import 'dart:async';

import 'package:grassroots_bluetooth_layer/grassroots_bluetooth_layer.dart'
    as ble;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:redux/redux.dart';

import '../models/identity.dart';
import '../models/packet.dart';
import '../models/peer.dart';
import '../store/store.dart';
import 'transport_service.dart';

/// Default display info for BLE transport
const _defaultBleDisplayInfo = TransportDisplayInfo(
  icon: Icons.bluetooth,
  name: 'Bluetooth',
  description: 'Bluetooth Low Energy direct P2P transport',
  color: Colors.blue,
);

/// Grassroots characteristic UUID, fixed across all peers. The containing
/// service UUID is derived from the advertiser's public key.
const String _grassrootsCharacteristicUuid =
    '0000ff01-0000-1000-8000-00805f9b34fb';

/// MTU we request from the peer on every central connect. ANNOUNCE alone is
/// ~200 bytes, far over the default ATT MTU of 23 (20-byte payload). 247 is
/// the largest most Android stacks negotiate; the actual value is whatever
/// the peer accepts and is reported back via the `BlePath.mtu` field.
const int _requestedAndroidMtu = 247;

/// BLE-based implementation of the transport service.
///
/// Wraps the `grassroots_bluetooth_layer` Flutter plugin which unifies central and peripheral
/// roles in one bondless layer. The plugin emits a single role-tagged path
/// stream; this service projects path lifecycle events into Redux actions and
/// forwards payloads to the message router.
///
/// ## Architecture
///
/// - **Peripheral mode**: advertises our derived Grassroots service UUID,
///   accepts incoming connections, exposes one notify+write characteristic.
/// - **Central mode**: scans for peers advertising the Grassroots service
///   prefix and connects to them.
/// - **Direct delivery only**. No relaying, no store-and-forward.
class BleTransportService extends TransportService {
  /// Local device name for advertising (informational; iOS ignores it,
  /// Android does not include it in the advertise packet either).
  final String? localName;

  /// Our identity
  final GrassrootsIdentity identity;

  /// Redux store
  final Store<AppState> store;

  /// The unified BLE plugin facade
  final ble.GrassrootsBluetooth _ble;

  // Subscriptions to plugin event streams
  StreamSubscription<ble.BleAdapterState>? _adapterSub;
  StreamSubscription<ble.BleAdvertisement>? _advertisementSub;
  StreamSubscription<ble.BlePath>? _pathSub;
  StreamSubscription<ble.BlePayload>? _payloadSub;
  StreamSubscription<String>? _logSub;

  /// Latest known plugin state per pathId (synchronous mirror of `paths()`).
  /// This is a strict cache of plugin facts, not consumer state.
  final Map<String, ble.BlePath> _paths = {};

  /// True while a `start()` call is in flight. Prevents re-entrant `start()`
  /// from `_onAdapterStateChanged` running concurrently with the original.
  bool _starting = false;

  /// True after [stop] is called. Drops in-flight payloads and prevents
  /// adapter-on auto-restart.
  bool _stopped = false;

  /// Stream controllers for the public TransportService API.
  final _dataController = StreamController<TransportDataEvent>.broadcast();
  final _connectionController =
      StreamController<TransportConnectionEvent>.broadcast();

  // ===== Public callbacks =====

  /// Called when a BLE packet is deserialized and ready for routing.
  /// `rssi` is the per-packet signal strength reported by the BLE plugin
  /// for every received packet, regardless of role; nullable only because
  /// the typedef matches `MessageRouter.processPacket`'s shared signature.
  void Function(GrassrootsPacket packet,
      {String? bleDeviceId, int? rssi, BleRole? bleRole})? onBlePacketReceived;

  /// Called when a peer disconnects at the BLE level. The argument is the
  /// peer's current `PeerState` snapshot — this is BLE-transport-level only;
  /// `GrassrootsNetwork` decides whether overall reachability changed before
  /// firing its consolidated `onPeerDisconnected`.
  void Function(PeerState peer)? onPeerDisconnected;

  // ===== Convenience getters for Redux state =====

  PeersState get _peersState => store.state.peers;

  BleTransportService({
    required this.identity,
    required this.store,
    this.localName,
    ble.GrassrootsBluetooth? grassrootsBluetooth,
  }) : _ble = grassrootsBluetooth ?? ble.GrassrootsBluetooth();

  // ===== TransportService implementation =====

  @override
  TransportType get type => TransportType.ble;

  @override
  TransportDisplayInfo get displayInfo => _defaultBleDisplayInfo;

  @override
  TransportState get state => store.state.transports.bleState;

  @override
  Stream<TransportDataEvent> get dataStream => _dataController.stream;

  @override
  Stream<TransportConnectionEvent> get connectionStream =>
      _connectionController.stream;

  @override
  int get connectedCount => _readyPaths.length;

  @override
  bool get isActive => store.state.transports.bleState == TransportState.active;

  /// Whether scanning is currently active. The plugin doesn't expose this
  /// directly, so we treat "transport is active" as a proxy.
  bool get isScanning => isActive;

  /// All known peers from Redux store
  List<PeerState> get knownPeers => _peersState.peersList;

  /// Connected peers from Redux store
  List<PeerState> get connectedKnownPeers => _peersState.connectedPeers;

  /// All currently sendable BLE pathIds (across both roles).
  Set<String> get connectedPeerIds => _readyPaths.map((p) => p.pathId).toSet();

  /// All discovered BLE peers (before ANNOUNCE).
  List<DiscoveredPeerState> get discoveredPeers =>
      _peersState.discoveredBlePeersList;

  bool isPeerReachable(Uint8List pubkey) => _peersState.isPeerReachable(pubkey);

  PeerState? getPeer(Uint8List pubkey) => _peersState.getPeerByPubkey(pubkey);

  /// Whether the given pathId is currently sendable.
  bool isDeviceConnected(String peerId) {
    final path = _paths[peerId];
    return path != null && _isReady(path);
  }

  // ===== Lifecycle =====

  @override
  Future<bool> initialize() async {
    if (state != TransportState.uninitialized) {
      return state.isUsable;
    }
    _setState(TransportState.initializing);

    try {
      _adapterSub = _ble.adapterStateChanges.listen((s) {
        _onAdapterStateChanged(s);
      });
      _advertisementSub = _ble.advertisements.listen(_onAdvertisement);
      _pathSub = _ble.pathChanges.listen(_onPathChanged);
      _payloadSub = _ble.payloads.listen(_onPayload);
      _logSub = _ble.logs.listen(
        (msg) => debugPrint('[grassroots_bluetooth_layer] $msg'),
      );

      // `restoreState: true` opts the iOS plugin into CoreBluetooth's
      // state-preservation. With this on, when iOS suspends and later
      // relaunches the app for a BLE event, the peripheral subscriptions,
      // GATT services and active scan are re-attached and the plugin's
      // `willRestoreState` handler rebuilds its in-process tables.
      await _ble.initialize(verboseLogging: true, restoreState: true);

      _setState(TransportState.ready);
      return true;
    } catch (e) {
      debugPrint('Failed to initialize BLE transport: $e');
      _setState(TransportState.error);
      return false;
    }
  }

  @override
  Future<void> start() async {
    if (state != TransportState.ready && state != TransportState.active) {
      debugPrint('Cannot start BLE transport in state: $state');
      return;
    }
    if (_starting) {
      // Re-entrant start (e.g. adapter-on event firing while a previous
      // start is still awaiting). Skip to avoid a redundant tear-down/rebuild
      // cycle that would drop currently-subscribed peripheral centrals.
      return;
    }
    _starting = true;
    _stopped = false;

    final mode = store.state.settings.bleRoleMode;
    final shouldAdvertise = mode != BleRoleMode.centralOnly;
    final shouldScan = mode != BleRoleMode.peripheralOnly;
    debugPrint('BLE start: roleMode=$mode '
        'advertise=$shouldAdvertise scan=$shouldScan');

    // Advertising and scanning are independent; failure in one must not
    // prevent the other. Track whether at least one succeeded — if both
    // fail (e.g. adapter still off), stay in `ready` so the next
    // adapter-on event re-invokes `start()`.
    var anyStarted = false;
    try {
      if (shouldAdvertise) {
        try {
          await _ble.startAdvertising(
            serviceUuid: identity.bleServiceUuid,
            characteristicUuid: _grassrootsCharacteristicUuid,
            localName: localName,
            bondless: true,
          );
          anyStarted = true;
        } catch (e) {
          debugPrint('Failed to start advertising: $e');
        }
      } else {
        // Make sure we aren't lingering as an advertiser from a previous
        // mode — explicitly tear down.
        try {
          await _ble.stopAdvertising();
        } catch (_) {}
      }

      if (shouldScan) {
        try {
          await _ble.startScan(
            serviceUuidPrefix: GrassrootsIdentity.grassrootsUuidPrefix,
            timeout: Duration.zero, // continuous scan
            // iOS CoreBluetooth deduplicates per-peer advertisements by
            // default; with allowDuplicates=true it keeps delivering
            // didDiscover so we see liveness/RSSI updates and so a peer that
            // joined mid-scan still gets observed. It costs a bit more power,
            // but also gives us fresh chances to retry a missing reverse leg.
            allowDuplicates: true,
          );
          anyStarted = true;
        } catch (e) {
          debugPrint('Failed to start scanning: $e');
        }
      } else {
        try {
          await _ble.stopScan();
        } catch (_) {}
      }

      if (anyStarted) {
        _setState(TransportState.active);
      }
    } finally {
      _starting = false;
    }
  }

  /// Apply a runtime role-mode change. Stops the current scan/advertise and
  /// restarts under the new mode. Existing live paths are left untouched —
  /// the plugin's path stream will tear them down naturally if the OS
  /// disconnects them.
  Future<void> applyRoleModeChange() async {
    if (state != TransportState.active && state != TransportState.ready) {
      return;
    }
    debugPrint('BLE role mode changed → restarting transport');
    try {
      await _ble.stopScan();
    } catch (_) {}
    try {
      await _ble.stopAdvertising();
    } catch (_) {}
    if (state == TransportState.active) {
      _setState(TransportState.ready);
    }
    await start();
  }

  @override
  Future<void> stop() async {
    _stopped = true;
    try {
      await _ble.stopScan();
    } catch (_) {}
    try {
      await _ble.stopAdvertising();
    } catch (_) {}

    // Disconnect every known path. Order doesn't matter — the plugin emits
    // disconnected events that we project into Redux.
    final pathIds = _paths.keys.toList(growable: false);
    for (final pathId in pathIds) {
      try {
        await _ble.disconnect(pathId, forget: true);
      } catch (_) {}
    }

    if (state == TransportState.active) {
      _setState(TransportState.ready);
    }
  }

  /// Trigger a finite scan window. The plugin handles the timeout natively.
  Future<void> scan({Duration? timeout}) async {
    if (store.state.settings.bleRoleMode == BleRoleMode.peripheralOnly) {
      return;
    }
    final t = timeout ?? const Duration(seconds: 10);
    try {
      await _ble.startScan(
        serviceUuidPrefix: GrassrootsIdentity.grassrootsUuidPrefix,
        timeout: t,
        // Match the continuous-scan path so already-discovered peers keep
        // surfacing for RSSI refreshes and reverse-leg retries.
        allowDuplicates: true,
      );
    } catch (e) {
      debugPrint('scan() failed: $e');
    }
  }

  @override
  Future<bool> sendToPeer(String peerId, Uint8List data) async {
    final path = _paths[peerId];
    if (path == null || !_isReady(path)) {
      return false;
    }
    try {
      await _ble.send(peerId, data);
      return true;
    } catch (e) {
      debugPrint('send() failed for $peerId: $e');
      return false;
    }
  }

  @override
  Future<void> broadcast(Uint8List data, {Set<String>? excludePeerIds}) async {
    // Sort by RSSI descending so the strongest signals get the data first.
    // Paths without a known RSSI (peripheral-role on iOS/Android, where the
    // OS doesn't expose remote signal strength) sort last via a very-weak
    // fallback so they still receive the broadcast.
    final ready = _readyPaths.toList()
      ..sort((a, b) => (b.rssi ?? -100).compareTo(a.rssi ?? -100));
    for (final path in ready) {
      if (excludePeerIds != null && excludePeerIds.contains(path.pathId)) {
        continue;
      }
      try {
        await _ble.send(path.pathId, data);
      } catch (e) {
        debugPrint('broadcast send() failed for ${path.pathId}: $e');
      }
    }
  }

  @override
  void associatePeerWithPubkey(String peerId, Uint8List pubkey) {
    final path = _paths[peerId];
    if (path == null || !_isReady(path)) return;

    final role = _roleFromPathId(peerId);
    if (role == null) return;
    store.dispatch(AssociateBleDeviceAction(
      publicKey: pubkey,
      deviceId: peerId,
      role: role,
    ));

    // Peripheral-side ANNOUNCE just identified the peer. This is the
    // moment we have enough information to try the reverse-leg dial:
    // we know the peer's pubkey, so we can derive their service UUID
    // and search the discovery map for a usable advertising address.
    if (role == BleRole.peripheral) {
      _maybeDialReverseCentralForPubkey(pubkey);
    }
  }

  @override
  String? getPeerIdForPubkey(Uint8List pubkey) {
    final peer = _peersState.getPeerByPubkey(pubkey);
    if (peer == null) return null;

    // Prefer our central path because writes go directly to the peer's GATT
    // characteristic; fall back to the inbound peripheral path when that is
    // the only ready route.
    final centralId = peer.bleCentralDeviceId;
    if (centralId != null && isDeviceConnected(centralId)) {
      return centralId;
    }
    final peripheralId = peer.blePeripheralDeviceId;
    if (peripheralId != null && isDeviceConnected(peripheralId)) {
      return peripheralId;
    }
    return null;
  }

  @override
  Uint8List? getPubkeyForPeerId(String peerId) {
    for (final peer in _peersState.peersList) {
      if (peer.bleCentralDeviceId == peerId ||
          peer.blePeripheralDeviceId == peerId) {
        return peer.publicKey;
      }
    }
    return null;
  }

  /// Accepted-friend hint for a BLE path.
  ///
  /// For already authenticated paths this returns the mapped friend pubkey.
  /// For pre-ANNOUNCE central paths it may return a friend whose derived
  /// service UUID matches the advertisement. That second case is only a hint:
  /// callers must not send friend-only metadata until a signed ANNOUNCE maps
  /// the path to the same public key.
  Uint8List? getFriendPubkeyHintForPeerId(String peerId) {
    final mappedPubkey = getPubkeyForPeerId(peerId);
    if (mappedPubkey != null) {
      final peer = _peersState.getPeerByPubkey(mappedPubkey);
      if (peer?.isFriend == true) return mappedPubkey;
    }

    final discovered = _peersState.getDiscoveredBlePeer(peerId);
    final serviceUuid = discovered?.serviceUuid;
    if (serviceUuid == null) return null;
    return _friendPubkeyForDerivedServiceUuid(serviceUuid);
  }

  @override
  Future<void> dispose() async {
    await stop();
    await _adapterSub?.cancel();
    await _advertisementSub?.cancel();
    await _pathSub?.cancel();
    await _payloadSub?.cancel();
    await _logSub?.cancel();
    try {
      await _ble.dispose();
    } catch (_) {}

    _setState(TransportState.disposed);
    await _dataController.close();
    await _connectionController.close();
  }

  // ===== Manual connect/disconnect (still exposed for the UI) =====

  /// Connect to a discovered peer. The pathId is `central:<remote-id>`.
  ///
  /// The plugin's `connect()` is itself idempotent — calling it twice for
  /// the same pathId either reuses the in-flight connection (iOS) or returns
  /// the existing path (Android). We do not duplicate that guard here.
  /// Path-state updates flow through `_onPathChanged`, which is the only
  /// dispatcher of `BleDeviceConnectingAction` / `Connected` / `Failed`.
  Future<bool> connectToDevice(String pathId) async {
    if (!pathId.startsWith('central:')) {
      // Peripheral-side paths are inbound — we don't dial them.
      return false;
    }
    if (isDeviceConnected(pathId)) {
      return false;
    }

    final discovered = _peersState.getDiscoveredBlePeer(pathId);
    if (discovered?.isConnecting == true) {
      return false;
    }
    final serviceUuid = discovered?.serviceUuid;
    if (serviceUuid == null) {
      debugPrint('Cannot connect to $pathId: no advertised service UUID');
      return false;
    }
    if (store.state.settings.coldCallTrustLevel == ColdCallTrustLevel.closed &&
        _friendPubkeyForDerivedServiceUuid(serviceUuid) == null) {
      debugPrint('Skipping $pathId: closed trust and unknown service UUID');
      return false;
    }

    final remoteId = pathId.substring('central:'.length);
    try {
      await _ble.connect(
        remoteId: remoteId,
        serviceUuid: serviceUuid,
        characteristicUuid: _grassrootsCharacteristicUuid,
        androidMtu: _requestedAndroidMtu,
        // Apple's docs say CoreBluetooth's connect can legitimately take
        // 10-15s. When iOS and Android are both also acting as centrals, the
        // BLE stack often needs that whole window to negotiate PHY,
        // connection interval, and MTU.
        timeout: const Duration(seconds: 30),
      );
      return true;
    } catch (e) {
      // The plugin throws synchronously only for invalid args / adapter off.
      // No path event will fire, so dispatch a failure action ourselves so
      // Redux doesn't show the peer stuck in `isConnecting` (which the
      // plugin would otherwise correct via a `failed` event).
      store.dispatch(BleDeviceConnectionFailedAction(pathId));
      return false;
    }
  }

  Future<void> disconnectDevice(String pathId, {bool forget = true}) async {
    try {
      await _ble.disconnect(pathId, forget: forget);
    } catch (e) {
      debugPrint('disconnect() failed for $pathId: $e');
    }
  }

  /// Process an incoming raw BLE packet. Deserializes and forwards to the
  /// MessageRouter via [onBlePacketReceived]. `rssi` is nullable because
  /// peripheral-role payloads carry no remote-RSSI measurement on either
  /// platform; the downstream router treats null as "unknown" and skips
  /// updating peer RSSI from that packet.
  void onPacketReceived(Uint8List data,
      {String? fromDeviceId, required int? rssi, BleRole? bleRole}) {
    if (_stopped) return;
    try {
      final packet = GrassrootsPacket.deserialize(data);
      onBlePacketReceived?.call(
        packet,
        bleDeviceId: fromDeviceId,
        rssi: rssi,
        bleRole: bleRole,
      );
    } catch (e) {
      debugPrint('Failed to deserialize packet: $e');
    }
  }

  // ===== Peer lifecycle helpers =====

  void onPeerBleConnected(String pathId, {int? rssi}) {
    debugPrint('BLE peer connected: $pathId');
  }

  void onPeerBleDisconnected(Uint8List pubkey, {BleRole? role}) {
    final peer = _peersState.getPeerByPubkey(pubkey);
    if (peer == null) return;
    store.dispatch(PeerBleDisconnectedAction(pubkey, role: role));
    onPeerDisconnected?.call(peer);
  }

  // ===== Plugin event handlers =====

  void _onAdapterStateChanged(ble.BleAdapterState adapterState) {
    if (adapterState != ble.BleAdapterState.poweredOn) {
      // The plugin already stops scan/advertising and tears down paths on
      // adapter-off; mirror that into Redux by dropping back to `ready` so
      // the next adapter-on triggers a fresh `start()`.
      if (state == TransportState.active) {
        _setState(TransportState.ready);
      }
      return;
    }

    // Adapter came back on. iOS resumes deferred scan/advertise itself, but
    // Android throws on a powered-off call so the prior start was dropped.
    // We re-issue both unconditionally when the transport is in `ready`;
    // duplicates are harmless because `start()` calls `stopScan`/`stopAdvertising`
    // first via the plugin's idempotent path.
    if (state == TransportState.ready && !_stopped) {
      unawaited(start());
    }
  }

  void _onAdvertisement(ble.BleAdvertisement adv) {
    final pathId = 'central:${adv.remoteId}';
    final serviceUuid = _firstGrassrootsServiceUuid(adv.serviceUuids);
    if (serviceUuid == null) {
      // Plugin already filters by Grassroots prefix, but defensively skip
      // anything that lost its service UUID before reaching us.
      return;
    }

    // Drop advertisements from a rotated radio MAC when we already have a
    // live or in-flight path to the same logical peer on a different MAC.
    // The service UUID is derived from the peer's pubkey and is stable
    // across rotations, so a different pathId with the same serviceUuid is
    // the same peer with a freshly-rotated address. Recording it as a new
    // DiscoveredPeerState (and dialing it) would create a duplicate central
    // path racing the existing one — that's exactly the failure mode behind
    // the GATT-status-133 storm we see when iOS rotates rapidly.
    final activeOnOtherMac = _peersState
        .getDiscoveredBlePeersByServiceUuid(serviceUuid)
        .where((p) => p.transportId != pathId)
        .any((p) => p.isConnected || p.isConnecting);
    if (activeOnOtherMac) {
      return;
    }

    final existing = _peersState.getDiscoveredBlePeer(pathId);
    if (existing == null) {
      store.dispatch(BleDeviceDiscoveredAction(
        deviceId: pathId,
        displayName: adv.advertisedName ?? adv.platformName,
        rssi: adv.rssi,
        serviceUuid: serviceUuid,
      ));
    } else {
      store.dispatch(BleDeviceRssiUpdatedAction(
        deviceId: pathId,
        rssi: adv.rssi,
      ));
    }

    // Update RSSI on identified peers too, so the UI ordering reflects fresh
    // signal strength.
    final pubkey = getPubkeyForPeerId(pathId);
    if (pubkey != null) {
      final existingPeer = _peersState.getPeerByPubkey(pubkey);
      if (existingPeer?.rssi == null || existingPeer?.rssi != adv.rssi) {
        store.dispatch(PeerRssiUpdatedAction(
          publicKey: pubkey,
          rssi: adv.rssi,
        ));
      }
    }

    if (existing != null && (existing.isConnected || existing.isConnecting)) {
      return;
    }
    if (_shouldYieldCentralDialToRemote(adv)) {
      // Let Apple devices take the first central role when Android is in auto
      // mode. Once their inbound peripheral path is ready, we can attempt the
      // reverse central leg.
      return;
    }
    if (store.state.settings.coldCallTrustLevel == ColdCallTrustLevel.closed &&
        _friendPubkeyForDerivedServiceUuid(serviceUuid) == null) {
      return;
    }
    // BLE address rotation produces a fresh pathId every ~30s for the same
    // peer. Cap the number of in-flight central dials so a chatty rotator
    // can't exhaust the BLE stack's connection slots.
    if (_inFlightCentralDials() >= _maxInFlightCentralDials) {
      return;
    }

    unawaited(connectToDevice(pathId));
  }

  /// Cap on simultaneous `connecting` central paths.
  /// Each `connectGatt` consumes a controller slot for ~5s on Android; too
  /// many parallel dials starve real connections.
  static const int _maxInFlightCentralDials = 2;

  int _inFlightCentralDials() {
    var count = 0;
    for (final p in _paths.values) {
      if (p.role != ble.BleRole.central) continue;
      if (p.state == ble.BlePathState.connecting ||
          p.state == ble.BlePathState.connected ||
          p.state == ble.BlePathState.subscribed) {
        count++;
      }
    }
    return count;
  }

  bool _shouldYieldCentralDialToRemote(ble.BleAdvertisement adv) {
    if (store.state.settings.bleRoleMode != BleRoleMode.auto) return false;
    if (defaultTargetPlatform != TargetPlatform.android) return false;
    if (!_advertisementLooksLikeAppleDevice(adv)) return false;
    return !_hasReadyPeripheralPathForRemote(adv.remoteId);
  }

  bool _hasReadyPeripheralPathForRemote(String remoteId) {
    final path = _paths['peripheral:$remoteId'];
    return path != null && _isReady(path);
  }

  /// Bridge for the peripheral-ready event in `_onPathChanged`. Two ways
  /// to identify the dial target, tried in order:
  ///
  /// 1. **Identity-based** (correct for modern Android with BLE privacy):
  ///    if ANNOUNCE has already landed, look up the peer's pubkey via the
  ///    peripheral pathId and dial a discovered advertising MAC that
  ///    matches their derived service UUID.
  ///
  /// 2. **Same-address fallback** (older Android stacks, iOS, simulators,
  ///    and any platform where the advertising MAC equals the connection
  ///    MAC): dial `central:<peripheral's_remoteId>` if scan already saw
  ///    that exact remoteId advertising as Grassroots.
  ///
  /// Pre-ANNOUNCE-AND-no-same-address-discovery, there's nothing useful
  /// to do here. The dial is retried from [associatePeerWithPubkey] when
  /// identity arrives, or from `_onAdvertisement` when a fresh advertising
  /// MAC for this peer lands.
  void _maybeDialReverseCentralAfterPeripheralReady(ble.BlePath path) {
    if (store.state.settings.bleRoleMode != BleRoleMode.auto) return;
    if (path.role != ble.BleRole.peripheral || !_isReady(path)) return;

    final pubkey = getPubkeyForPeerId(path.pathId);
    if (pubkey != null) {
      _maybeDialReverseCentralForPubkey(pubkey);
      return;
    }

    // Same-address fallback. Strip `peripheral:` and look up the matching
    // `central:` discovery. Only proceed when the scanner actually saw the
    // remote advertising as a Grassroots peripheral (so the dial has a
    // known-good target).
    const peripheralPrefix = 'peripheral:';
    if (!path.pathId.startsWith(peripheralPrefix)) return;
    final remoteId = path.pathId.substring(peripheralPrefix.length);
    final centralPathId = 'central:$remoteId';

    final existingCentral = _paths[centralPathId];
    if (existingCentral != null &&
        (existingCentral.state == ble.BlePathState.connecting ||
            existingCentral.state == ble.BlePathState.connected ||
            existingCentral.state == ble.BlePathState.subscribed ||
            existingCentral.state == ble.BlePathState.ready)) {
      return;
    }
    if (_peersState.getDiscoveredBlePeer(centralPathId) == null) return;
    if (_inFlightCentralDials() >= _maxInFlightCentralDials) return;

    debugPrint(
      '[ble] reverse leg (same-address fallback): peripheral path '
      '${path.pathId} is ready; dialing $centralPathId.',
    );
    unawaited(connectToDevice(centralPathId));
  }

  /// Try to open the central direction for a peer we already hold a
  /// peripheral path to. Keyed by the peer's **identity** (derived service
  /// UUID), NOT by the radio MAC they connected to us from: modern Android
  /// stacks use BLE-privacy with distinct advertising and initiator
  /// addresses, so a peer's connection MAC almost never appears in scan
  /// results. Looking up the dial target by service UUID lets us pick an
  /// advertising MAC the scanner has actually seen (and therefore one with
  /// a live Grassroots GATT server) rather than blindly dialing the
  /// connection MAC, which would always fail.
  ///
  /// Idempotent and safe to call repeatedly. Triggered from:
  ///   - peripheral-path-ready (when ANNOUNCE has already landed),
  ///   - `associatePeerWithPubkey` (when ANNOUNCE just identified the peer),
  ///   - `_onAdvertisement` (when a fresh advertising MAC appears for a
  ///     peer we have peripheral-only).
  void _maybeDialReverseCentralForPubkey(Uint8List pubkey) {
    if (store.state.settings.bleRoleMode != BleRoleMode.auto) return;

    final peer = _peersState.getPeerByPubkey(pubkey);
    if (peer == null) return;
    // Already have central? Nothing to do. Already have an in-flight dial
    // for the central side? Likewise — `_paths` tracks every state the
    // plugin has surfaced for the central pathIds we've requested.
    if (peer.bleCentralDeviceId != null) return;
    if (peer.blePeripheralDeviceId == null) return; // not actually peripheral-attached

    final serviceUuid =
        GrassrootsIdentity.deriveServiceUuid(pubkey).toLowerCase();

    // Skip if any central pathId for this service UUID is mid-handshake.
    // (Across-MAC, since the discovery map can hold multiple rotated MACs.)
    final alreadyDialing = _paths.values.any((p) {
      if (p.role != ble.BleRole.central) return false;
      if (p.state != ble.BlePathState.connecting &&
          p.state != ble.BlePathState.connected &&
          p.state != ble.BlePathState.subscribed &&
          p.state != ble.BlePathState.ready) {
        return false;
      }
      final discovered = _peersState.getDiscoveredBlePeer(p.pathId);
      return discovered?.serviceUuid?.toLowerCase() == serviceUuid;
    });
    if (alreadyDialing) return;

    if (_inFlightCentralDials() >= _maxInFlightCentralDials) return;

    // Pick any discovered advertising MAC that hashes to this peer's
    // identity and isn't itself in a connecting/connected state. If none
    // exist yet we bail — the next advertisement that lands for this peer
    // will re-trigger us (`_onAdvertisement` calls back into here).
    final candidate = _peersState
        .getDiscoveredBlePeersByServiceUuid(serviceUuid)
        .firstWhere(
          (dp) => !dp.isConnected && !dp.isConnecting,
          orElse: () => _noCandidate,
        );
    if (identical(candidate, _noCandidate)) return;

    debugPrint(
      '[ble] reverse leg: dialing ${candidate.transportId} for peer '
      '${peer.displayName} (peripheral up, opening central direction).',
    );
    unawaited(connectToDevice(candidate.transportId));
  }

  /// Sentinel returned by `firstWhere` when no candidate matches.
  /// Constructed once because `DiscoveredPeerState` requires positional args.
  static final DiscoveredPeerState _noCandidate = DiscoveredPeerState(
    transportId: '',
    rssi: 0,
    discoveredAt: DateTime.fromMillisecondsSinceEpoch(0),
    lastSeen: DateTime.fromMillisecondsSinceEpoch(0),
  );

  bool _advertisementLooksLikeAppleDevice(ble.BleAdvertisement adv) {
    final manufacturerData = adv.manufacturerData;
    if (manufacturerData != null &&
        manufacturerData.length >= 2 &&
        manufacturerData[0] == 0x4c &&
        manufacturerData[1] == 0x00) {
      return true;
    }

    final name = [
      adv.advertisedName,
      adv.platformName,
    ].whereType<String>().join(' ').toLowerCase();
    return name.contains('iphone') ||
        name.contains('ipad') ||
        name.contains('ipod');
  }

  void _onPathChanged(ble.BlePath path) {
    final previous = _paths[path.pathId];
    _paths[path.pathId] = path;

    final role =
        path.role == ble.BleRole.central ? BleRole.central : BleRole.peripheral;

    switch (path.state) {
      case ble.BlePathState.discovered:
        // Already handled by _onAdvertisement for central; for peripheral
        // we only see paths once the central connects.
        break;
      case ble.BlePathState.connecting:
        if (path.role == ble.BleRole.central) {
          store.dispatch(BleDeviceConnectingAction(path.pathId));
        }
        break;
      case ble.BlePathState.connected:
      case ble.BlePathState.subscribed:
        // Not yet sendable — wait for `ready`.
        break;
      case ble.BlePathState.ready:
        if (previous?.state != ble.BlePathState.ready) {
          store.dispatch(BleDeviceConnectedAction(path.pathId));
          _addConnectionEvent(TransportConnectionEvent(
            peerId: path.pathId,
            transport: TransportType.ble,
            connected: true,
            reason: role.name,
            isIncoming: role == BleRole.peripheral,
          ));
          _maybeDialReverseCentralAfterPeripheralReady(path);
        }
        break;
      case ble.BlePathState.failed:
      case ble.BlePathState.disconnected:
      case ble.BlePathState.stale:
        if (path.state == ble.BlePathState.failed &&
            path.role == ble.BleRole.central) {
          store.dispatch(BleDeviceConnectionFailedAction(path.pathId));
        }
        // Mirror the connect emit at the `ready` case: surface a disconnect
        // to the upper layer only on a true transition out of `ready`.
        // Failed dials from `connecting` never produced a "connected" event,
        // and re-emits of an already-dead path (the iOS `.failed → .disconnected`
        // pair, and scan re-discoveries that keep firing path-changed with
        // the cached state) would otherwise spam disconnect logs.
        if (previous?.state == ble.BlePathState.ready) {
          _emitDisconnect(path, role);
        }
        _paths.remove(path.pathId);
        break;
    }
  }

  void _emitDisconnect(ble.BlePath path, BleRole role) {
    if (path.role == ble.BleRole.central) {
      store.dispatch(BleDeviceDisconnectedAction(path.pathId));
    }
    final pubkey = getPubkeyForPeerId(path.pathId);
    if (pubkey != null) {
      onPeerBleDisconnected(pubkey, role: role);
    }
    _addConnectionEvent(TransportConnectionEvent(
      peerId: path.pathId,
      transport: TransportType.ble,
      connected: false,
      reason: path.error ?? role.name,
    ));
  }

  void _addConnectionEvent(TransportConnectionEvent event) {
    if (_connectionController.isClosed) return;
    _connectionController.add(event);
  }

  void _onPayload(ble.BlePayload payload) {
    if (_stopped) return;
    // Drop payloads unless the plugin currently marks the path ready. This
    // prevents late ANNOUNCE packets, hot-restart leftovers, or connected-but-
    // not-sendable paths from populating PeerState BLE role fields.
    final path = _paths[payload.pathId];
    if (path == null || !_isReady(path)) return;

    final role = payload.role == ble.BleRole.central
        ? BleRole.central
        : BleRole.peripheral;
    onPacketReceived(
      payload.value,
      fromDeviceId: payload.pathId,
      rssi: payload.rssi,
      bleRole: role,
    );
    if (_dataController.isClosed) return;
    _dataController.add(TransportDataEvent(
      peerId: payload.pathId,
      transport: TransportType.ble,
      data: payload.value,
    ));
  }

  // ===== Helpers =====

  void _setState(TransportState newState) {
    if (store.state.transports.bleState != newState) {
      store.dispatch(BleTransportStateChangedAction(newState));
    }
  }

  bool _isReady(ble.BlePath path) =>
      path.state == ble.BlePathState.ready && path.canSend;

  Iterable<ble.BlePath> get _readyPaths => _paths.values.where(_isReady);

  Uint8List? _friendPubkeyForDerivedServiceUuid(String serviceUuid) {
    final normalized = serviceUuid.toLowerCase();
    for (final peer in _peersState.friends) {
      if (GrassrootsIdentity.deriveServiceUuid(peer.publicKey).toLowerCase() ==
          normalized) {
        return peer.publicKey;
      }
    }
    return null;
  }

  BleRole? _roleFromPathId(String pathId) {
    if (pathId.startsWith('central:')) return BleRole.central;
    if (pathId.startsWith('peripheral:')) return BleRole.peripheral;
    return null;
  }

  /// Find the first service UUID that matches the Grassroots prefix.
  String? _firstGrassrootsServiceUuid(List<String?> uuids) {
    for (final uuid in uuids) {
      if (uuid == null) continue;
      final hex = uuid.toLowerCase().replaceAll('-', '');
      if (hex.startsWith(GrassrootsIdentity.grassrootsUuidPrefix)) {
        return uuid;
      }
    }
    return null;
  }

}

import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:grassroots_networking/src/grassroots_network.dart'
    show processReachabilityTransitions;
import 'package:grassroots_networking/src/models/peer.dart';
import 'package:grassroots_networking/src/store/peers_state.dart';

/// Tests for the reachability-transition diff that drives the consolidated
/// `onPeerConnected` / `onPeerDisconnected` callbacks on `GrassrootsNetwork`.
///
/// The contract: fire connect only on a false→true transition of
/// `PeerState.isReachable` (the live-now predicate); fire disconnect only on
/// a true→false transition, including when a previously-reachable peer is
/// removed from the store entirely. A transport flipping while another
/// stays live is a no-op.
void main() {
  Uint8List pubkey(int seed) =>
      Uint8List.fromList(List.generate(32, (i) => (seed + i) % 256));

  String pubkeyHex(Uint8List p) =>
      p.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

  PeersState stateWith(List<PeerState> peers) {
    final map = <String, PeerState>{
      for (final p in peers) p.pubkeyHex: p,
    };
    return PeersState.initial.copyWith(peers: map);
  }

  PeerState peerOnBle(int seed) => PeerState(
        publicKey: pubkey(seed),
        nickname: 'P$seed',
        connectionState: PeerConnectionState.connected,
        transport: PeerTransport.bleDirect,
        bleCentralDeviceId: 'ble-$seed',
      );

  PeerState peerOnUdp(int seed) => PeerState(
        publicKey: pubkey(seed),
        nickname: 'P$seed',
        connectionState: PeerConnectionState.connected,
        transport: PeerTransport.udp,
        udpAddress: '10.0.0.$seed:9514',
        hasLiveUdpConnection: true,
      );

  PeerState peerOnBoth(int seed) => PeerState(
        publicKey: pubkey(seed),
        nickname: 'P$seed',
        connectionState: PeerConnectionState.connected,
        transport: PeerTransport.bleDirect,
        bleCentralDeviceId: 'ble-$seed',
        udpAddress: '10.0.0.$seed:9514',
        hasLiveUdpConnection: true,
      );

  PeerState peerOffline(int seed) => PeerState(
        publicKey: pubkey(seed),
        nickname: 'P$seed',
        connectionState: PeerConnectionState.disconnected,
        transport: PeerTransport.bleDirect,
      );

  late List<Uint8List> connects;
  late List<Uint8List> disconnects;
  late List<(Uint8List, String)> discoveries;
  late Map<String, bool> tracker;

  void onConnected(PeerState p) => connects.add(p.publicKey);
  void onDisconnected(PeerState p) => disconnects.add(p.publicKey);
  void onDiscovered(Uint8List pk, String nick) => discoveries.add((pk, nick));

  void tick(PeersState s) => processReachabilityTransitions(
        peersState: s,
        lastKnownReachability: tracker,
        onConnected: onConnected,
        onDisconnected: onDisconnected,
        onDiscovered: onDiscovered,
      );

  setUp(() {
    connects = [];
    disconnects = [];
    discoveries = [];
    tracker = {};
  });

  group('reachability transitions', () {
    test('new BLE-reachable peer fires onPeerConnected', () {
      tick(stateWith([peerOnBle(1)]));
      expect(connects.length, 1);
      expect(connects.single, pubkey(1));
      expect(disconnects, isEmpty);
    });

    test('idempotent: same reachable state across two ticks fires once', () {
      tick(stateWith([peerOnBle(1)]));
      tick(stateWith([peerOnBle(1)]));
      expect(connects.length, 1);
      expect(disconnects, isEmpty);
    });

    test(
        'peer with BLE then also UDP (still reachable) does not fire a second '
        'connect', () {
      tick(stateWith([peerOnBle(1)]));
      tick(stateWith([peerOnBoth(1)]));
      expect(connects.length, 1);
      expect(disconnects, isEmpty);
    });

    test(
        'peer with both transports loses BLE while UDP remains live: no event',
        () {
      tick(stateWith([peerOnBoth(1)]));
      tick(stateWith([peerOnUdp(1)]));
      expect(connects.length, 1);
      expect(disconnects, isEmpty);
    });

    test(
        'peer with both transports loses UDP while BLE remains live: no event',
        () {
      tick(stateWith([peerOnBoth(1)]));
      tick(stateWith([peerOnBle(1)]));
      expect(connects.length, 1);
      expect(disconnects, isEmpty);
    });

    test('peer loses last transport fires onPeerDisconnected', () {
      tick(stateWith([peerOnBle(1)]));
      tick(stateWith([peerOffline(1)]));
      expect(connects.length, 1);
      expect(disconnects.length, 1);
      expect(disconnects.single, pubkey(1));
    });

    test('peer goes offline then comes back: connect fires again', () {
      tick(stateWith([peerOnBle(1)]));
      tick(stateWith([peerOffline(1)]));
      tick(stateWith([peerOnUdp(1)]));
      expect(connects.length, 2);
      expect(disconnects.length, 1);
    });

    test(
        'peer removed from store while reachable surfaces as a disconnect '
        'with a synthesized PeerState', () {
      tick(stateWith([peerOnBle(1)]));
      expect(tracker[pubkeyHex(pubkey(1))], true);

      // Peer entry vanishes (PeerRemovedAction / StalePeersRemovedAction).
      tick(stateWith([]));
      expect(disconnects.length, 1);
      expect(disconnects.single, pubkey(1));
      expect(tracker.containsKey(pubkeyHex(pubkey(1))), false);
    });

    test('multiple peers tracked independently', () {
      tick(stateWith([peerOnBle(1), peerOnUdp(2)]));
      expect(connects, [pubkey(1), pubkey(2)]);

      tick(stateWith([peerOnBle(1), peerOffline(2)]));
      expect(disconnects, [pubkey(2)]);
      expect(connects, [pubkey(1), pubkey(2)]);

      tick(stateWith([peerOffline(1), peerOffline(2)]));
      expect(disconnects, [pubkey(2), pubkey(1)]);
    });

    test('null callbacks are safe', () {
      processReachabilityTransitions(
        peersState: stateWith([peerOnBle(1)]),
        lastKnownReachability: tracker,
        onConnected: null,
        onDisconnected: null,
      );
      // No throw; tracker still updated.
      expect(tracker[pubkeyHex(pubkey(1))], true);
    });
  });

  group('onPeerDiscovered', () {
    test('fires on first reachability acquisition with pubkey + nickname', () {
      tick(stateWith([peerOnBle(1)]));
      expect(discoveries.length, 1);
      expect(discoveries.single.$1, pubkey(1));
      expect(discoveries.single.$2, 'P1');
    });

    test('fires AGAIN on re-discovery after going out of range', () {
      // Initial discovery + connect.
      tick(stateWith([peerOnBle(1)]));
      expect(discoveries.length, 1);
      expect(connects.length, 1);

      // Peer goes out of range — PeerState stays in store (e.g. friend, or
      // not yet stale-cleaned) but isReachable flips false.
      tick(stateWith([peerOffline(1)]));
      expect(disconnects.length, 1);
      expect(discoveries.length, 1, reason: 'no re-discovery while offline');

      // Peer comes back in range — same PeerState, isReachable flips true.
      tick(stateWith([peerOnBle(1)]));
      expect(discoveries.length, 2,
          reason: 'onPeerDiscovered must repeat on re-discovery');
      expect(connects.length, 2);
    });

    test('does NOT fire while peer stays reachable across ticks', () {
      tick(stateWith([peerOnBle(1)]));
      tick(stateWith([peerOnBoth(1)])); // gained UDP, still reachable
      tick(stateWith([peerOnUdp(1)])); // lost BLE, still reachable
      expect(discoveries.length, 1,
          reason: 'no flipping false→true → no re-fire');
    });

    test('null onDiscovered callback is safe', () {
      processReachabilityTransitions(
        peersState: stateWith([peerOnBle(1)]),
        lastKnownReachability: tracker,
        onConnected: onConnected,
        onDisconnected: onDisconnected,
        onDiscovered: null,
      );
      expect(connects.length, 1);
    });
  });
}

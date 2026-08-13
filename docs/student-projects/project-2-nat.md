# Project 2 — Grassroots NAT Detection and Hole-Punching Survey

**Revision 2 — grounded in the shipped Grassroots Networking stack.**
Contact: Dan Bachar · dan.bachar@campus.technion.ac.il

> **What changed from revision 1.** The first write-up proposed building on `dart_libp2p` and
> comparing "NAT-classification accuracy" against libp2p autoNAT. Neither survives contact with
> the code: there is no libp2p anywhere in this stack, and autoNAT does not classify NAT — it
> answers a reachability question. This revision restates the project against what we actually
> run, fixes the measurand, and names the validity threat that would otherwise silently invalidate
> every field result. All claims about the current system carry `file:line` citations and were
> verified against source.

---

## 1. Why this matters

**The pain point.** Every transport-layer decision in Grassroots Networking (GN) currently rests on
an assumption about NAT that we have never measured. We do not know what fraction of our users sit
behind carrier-grade NAT, whether hole-punching succeeds on the mobile carriers our users actually
sit behind, whether IPv6 gives us a path where IPv4 does not, or how long a NAT mapping survives with
the screen off. Public NAT measurements exist but are dated and overwhelmingly desktop- and
server-side; almost none of them are taken from handsets behind real carriers, which is exactly our
deployment.

**The goal.** Design and validate a *grassroots* NAT-detection algorithm — one that determines a
peer's NAT behaviour and reachability using **social-graph peers as dial-back witnesses**, with no
designated infrastructure. libp2p's autoNAT v1/v2 nominally decentralize this, but in practice lean
on a small set of well-known dial-back nodes. We want to know what it costs to replace those with
your friends, and whether the cost shrinks as the witness count grows.

**Decisions this unblocks.** Whether rendezvous anchors are needed by the median user or only as a
fallback; whether to keep investing in UDP at all versus pushing BLE harder; whether we ever ship a
relay; how hard to push IPv6; and what the transport should actually *do* at dial time instead of
the fixed 2-second punch and 10-second timeout it uses today.

**Why it is a grassroots question.** The founding claim is "no infrastructure." Every anchor and
every relay weakens it. Knowing empirically how many users we reach with pure peer-to-peer transport
tells us how much infrastructure is genuinely load-bearing and how much is over-engineering — and
gives the lab a defensible answer when a reviewer challenges the premise.

---

## 2. What we use today

The whole IP path, in the order it executes. Read this before writing any code — most of the
project's design constraints are already sitting in it.

### 2.1 Sockets and self-address

Two wildcard UDP sockets, one per family, **both bound on port 0** — the OS assigns an ephemeral
port and every rebind gets a new one ([udp_transport_service.dart:1009](../../lib/src/transport/udp_transport_service.dart#L1009)). There is no fixed or
configurable port, so there is no port-forwarding story. A `UDXMultiplexer` then wraps each socket
and **owns all reads** from it ([udp_transport_service.dart:264](../../lib/src/transport/udp_transport_service.dart#L264)).

We learn our own address two ways:

1. **HTTPS reflection.** A GET to `https://ipv4.seeip.org` / `https://ipv6.seeip.org`, cached 5
   minutes per family ([public_address_discovery.dart:40](../../lib/src/transport/public_address_discovery.dart#L40)).
2. **`ADDR_REFLECT` (signaling `0x07`).** A peer that is itself well-connected observes our source
   `ip:port` on an incoming session and reflects it back ([signaling_service.dart:760](../../lib/src/signaling/signaling_service.dart#L760)).

**There is no STUN client** — no Binding Request, no magic cookie, no `XOR-MAPPED-ADDRESS` anywhere
in the repo.

The single most consequential line in the subsystem: the address we advertise is the
externally-discovered **public IP paired with our locally-bound port**
([public_address_discovery.dart:97-104](../../lib/src/transport/public_address_discovery.dart#L97)). That reveals the public IP but *never the NAT-mapped port*. The
only true mapped port arrives via `ADDR_REFLECT`, which requires a session that already works — so
it can never help the case where nothing has connected yet, which is precisely the case this project
is about.

Self-classification is one boolean: `isWellConnected == hasPublicUdpAddress`, a routability test on
that advertised string ([transports_state.dart:94](../../lib/src/store/transports_state.dart#L94), [peers_state.dart:248](../../lib/src/store/peers_state.dart#L248)). `isGloballyRoutableIPv4` correctly
excludes 100.64/10 and the rest of the reserved space ([address_utils.dart:138](../../lib/src/transport/address_utils.dart#L138)) — but a phone behind carrier
NAT never *sees* its 100.64 inner address, so that exclusion never fires.

### 2.2 Advertising and candidates

ANNOUNCE carries `pubkey(32) | version(2) | nickname | candidates | Ed25519 signature(64)`, self-signed,
throwing on a bad signature ([protocol_handler.dart:173](../../lib/src/protocol/protocol_handler.dart#L173)). Candidates are plain `ip:port` strings (IPv6 must be
bracketed): the discovered public candidates plus the link-local IPv6, filtered to families with a
bound socket. ANNOUNCE repeats every **10 s** ([grassroots_network.dart:78](../../lib/src/grassroots_network.dart#L78)); the same tick drives liveness
(stale at 20 s), reconnection, and the queued-message drain. **There is no dedicated NAT keepalive** —
that 10 s tick is the de facto one, and it only fires over already-established connections.

### 2.3 Choosing where to dial

`UdpConnectionService.selectBestPair` scans every local×remote pair and returns exactly one, ranked
`linkLocalSameSubnet > ipv6 > ipv4` ([connection_service.dart:48](../../lib/src/transport/connection_service.dart#L48)). Only `pair.remote` is dialed. **Nothing probes
candidates in parallel, nothing validates a candidate, and nothing falls back to second-best after a
failed dial.** The lexicographically smaller Ed25519 pubkey is the deterministic initiator.

### 2.4 Punching

The punch packet is **36 bytes**: magic `BCPU` + the sender's 32-byte pubkey — no nonce, timestamp,
sequence, or signature ([hole_punch_service.dart:18](../../lib/src/transport/hole_punch_service.dart#L18)). `punch()` is fire-and-forget: **2 s at 200 ms ≈ 10
datagrams**, one address, one port, no port prediction, no sweep ([hole_punch_service.dart:117](../../lib/src/transport/hole_punch_service.dart#L117)).

`punchUntilResponse()` — the only mode that observes whether a hole actually opened — **has no
production caller and cannot work as wired**, because it reads the raw socket while the multiplexer
owns reads. Inbound punch packets are dropped before any accounting ([udp_transport_service.dart:848](../../lib/src/transport/udp_transport_service.dart#L848)).

Punching is therefore **open-loop**: we cannot distinguish "the NAT refused the mapping" from
"packets were lost" from "the port was wrong" from "the handshake was merely slow."

### 2.5 Dialing and failure

One UDX attempt, `connectHandshakeTimeout = 10 s`, **no retry loop and no second candidate inside
the transport** ([udp_transport_service.dart:58](../../lib/src/transport/udp_transport_service.dart#L58)). Failure classifies into
`{networkUnreachable, handshakeTimeout, other}`. Retries live outside at 15 s / 60 s / 5 min
backoffs. Note that UDX's `handshakeComplete` fires **on the first valid packet from the remote** —
it is a round-trip liveness signal, not a cryptographic handshake. Authentication is Noise_XX over
the stream, and the router drops every clear non-ANNOUNCE packet.

### 2.6 Mediation

11 signaling types, `0x05`–`0x0f` (`0x10`+ free, so new witness messages are purely additive), all
carried inside Noise — clear signaling is refused on both ends. Trust is a static three-way OR:
accepted friend, configured rendezvous pubkey, or a friend-advertised RV
([signaling_service.dart:849](../../lib/src/signaling/signaling_service.dart#L849)). No reputation, no cross-checking, no quorum.

A **friend mediator** will coordinate a punch only when the target is a friend, is reachable *on the
mediator right now*, and both addresses are in the same family. A **rendezvous anchor** runs the
two-sided RECONNECT/AVAILABLE matcher with a 5-minute pending expiry. The deployed anchor opens
exactly one data-plane firewall rule — `udp:9516` from `::/0`, **IPv6 only** (`bootstrap_anchor/deploy.sh:137`).

---

## 3. What we do not know, and what we get wrong

Ranked by how much each blocks a real decision.

1. **No NAT classification at all — and the boolean standing in for it is systematically wrong for
   exactly the devices that matter.** A phone behind carrier NAT that can reach seeip.org advertises
   a globally-routable IP and classifies itself, and is classified by every peer, as
   **well-connected**. Three live behaviours run off that false positive: the pre-connect punch is
   *suppressed* when the peer looks public ([grassroots_network.dart:3369-3373](../../lib/src/grassroots_network.dart#L3369)) — so it is skipped for precisely
   the peers that need it; the phone starts acting as an address reflector and facilitator for its
   friends; and the UI tells the user they are well-connected. Nothing distinguishes *"has a public
   IP"* from *"is reachable at that ip:port."*
2. **No mapped-port discovery on the primary path.** The port we tell every peer to dial is a guess.
3. **Multi-reflector disagreement is discarded.** Several anchors and several well-connected friends
   can each reflect the same socket — that is exactly RFC 5780 mapping-behaviour raw material.
   `onAddrReflected` overwrites the stored address wholesale and records nothing, so two disagreeing
   reflections are indistinguishable from roaming.
4. **No dial-back protocol and no notion of a witness.** "Am I reachable from outside?" is asserted
   from a string prefix, never tested. The inbound-connection observation point exists and is
   write-only — nothing reads it for a decision.
5. **Zero timing instrumentation.** No `Stopwatch` anywhere in `lib/`. The only record of a punch is
   a four-value enum with no timestamps, and the reducer *discards* the failure reason. No latency or
   robustness comparison is computable from what the app records today.
6. **No two-endpoint probe infrastructure.** RFC 5780 needs two IPs × two ports per family; the
   anchor binds one port per family and opens one IPv6 rule.
7. **No persistence or export.** Address tables are in-memory with a 5-minute TTL. The **testbed
   dataset** deliverable currently has neither producer nor sink.

Three of these are also production defects, independent of the project, and were confirmed in source
during this revision: the punch target from `PUNCH_INITIATE` is **never checked against
`isGloballyRoutableAddress`** (so any trusted sender can steer ~10 datagrams at an arbitrary
`ip:port`, including private or multicast addresses on the victim's own LAN); the mediator's pending
map has no TTL or sweep; and the stream framer trusts an attacker-supplied 32-bit length with no
bound ([udp_transport_service.dart:1103](../../lib/src/transport/udp_transport_service.dart#L1103)).

---

## 4. A worked example

**Maya** — Android handset, cellular only, carrier CGNAT, IPv4-only path.
**Noam** — home Wi-Fi behind a consumer router (endpoint-independent mapping, address-and-port-dependent
filtering), IPv4 plus a working IPv6 prefix. Accepted friends, previously paired over BLE, now apart.

1. Maya's seeip fetch returns the carrier's *outer* public IPv4 — globally routable by our test, since
   the inner 100.64 address is never visible. Advertised candidate: that IP + Maya's **local** port.
2. Both devices compute `isWellConnected = true`. Maya's UI says "Well-connected." This is wrong twice
   over: wrong port, and the carrier NAT will not accept unsolicited inbound at all.
3. Maya tries to add the deployed anchor. The data-plane rule is IPv6-only; the add times out after
   8 s and is refused. Maya now has **no path to ever learn her mapped port**.
4. Maya sends a message. `selectBestPair` prefers Noam's IPv6 candidate because Maya's IPv6 *socket*
   is bound — even though she has no IPv6 transit. One dial, 10 s, timeout, **no fallback to the IPv4
   pair**.
5. The pre-connect punch is suppressed on both sides, because each sees the other as public. Had it
   fired, it would have targeted the local ports anyway.
6. Friend-mediated rendezvous requires a mutual friend who has Noam reachable *right now* and a
   same-family address for both. If it happens, both punch 2 s — but if Maya's carrier assigns a
   different mapped port per destination, the mapping the mediator observed is not the one Noam's
   packets hit, and every datagram lands on a closed pinhole.
7. Nothing is recorded: no attempt id, no timestamps, no per-candidate outcome, no distinction
   between "wrong port," "filtered," "no route," and "peer offline."

**And when it works, it works blindly.** Put both on port-preserving, endpoint-independent NATs and
the advertised local port happens to equal the mapped port, the first dial succeeds, and the system
learns nothing. The identical code fails on the next carrier with **no diagnostic difference in the
logs.**

---

## 5. Research questions

**RQ1 — Can social-graph witnesses replace designated dial-back servers?** Specify and validate a
witness-based algorithm that recovers a peer's mapping and filtering behaviour, and quantify its
agreement with an RFC 5780 oracle.

**RQ2 — What does decentralization cost?** How do false-negative rate and time-to-verdict move with
the witness count *k* and the byzantine fraction *f*, colluding and independent? Does the gap to a
designated-server baseline close as *k* grows, or is there an inherent floor? And — the constraint
that will probably dominate — what is `P(≥k witnesses online and dialable)`, swept over plausible
online-fraction and friend-count distributions?

**RQ3 — What is the NAT reality for a user population like ours?** Two layers.

*Measured:* the tuple — mapping behaviour × filtering behaviour × port preservation × mapping
lifetime, plus CGNAT status and IPv6 path type — recorded **per stratum** on our own handsets across
every carrier and access network in the testbed, and reported as a per-stratum table. A distribution
appears only after weighting, in the layer below.

*Estimated:* population prevalence, obtained by treating the testbed as a **stratified census with a
small number of measurements per stratum**, weighted post hoc by published subscriber counts and
per-AS user-population estimates. Note the word: this is a *census of strata*, not a stratified
*sample* — there is no probabilistic sampling within a stratum, so no confidence interval is
computable and every interval we report is an assumption-sensitivity range. Reported with its weight
table, its denominator, its assumptions, and a sensitivity analysis. See §6 for the method and for
where it is strong versus weak.

*Denominator, stated once:* the estimate is over **consumer-APN mobile lines and residential
broadband lines in the countries we cover, as of the measurement date** — not over devices, not over
humans, and not over GN users. Published subscriber counts include M2M and data-only lines; net them
out where the source permits and flag the residual where it does not. Mapping this denominator onto
GN's actual users assumes GN users distribute across carriers and access networks like the general
population, which is an assumption, not a finding.

**RQ4 — What should the transport do at dial time?** An empirical decision rule (direct /
anchor-mediated / give up) over inputs the transport actually has when it must decide.

### Two corrections that shape all of the above

**Define the measurand properly.** Not "NAT type." A tuple: mapping behaviour
{endpoint-independent, address-dependent, address-and-port-dependent} × filtering behaviour
{EIF, ADF, APDF} × port preservation × mapping lifetime, plus the orthogonal facts (CGNAT-suspected,
IPv6 available, IPv6 routable). Any single-label "NAT type" is a derived convenience column, marked
as such.

Measure and report the tuple **per address family and per translation path** — NAT44, NAT64/464XLAT,
or native IPv6. This matters more than it looks: on a 464XLAT path what you are characterizing is the
carrier's PLAT, which the RFC 4787 NAT44 vocabulary describes only partially, and on a native IPv6
path there is typically no mapping at all — only stateful filtering — so mapping behaviour and port
preservation are **N/A**, which is not the same as absent. Path type splits strata; it is not an
orthogonal fact.

**AutoNAT is not a classifier.** v1 answers "am I publicly reachable"; v2 answers "is *this address*
dialable," per address, with a nonce'd dial-back. Neither emits a mapping- or filtering-behaviour
label. So the head-to-head is **reachability-only**, and the ground truth for classification is an
RFC 5780 oracle you stand up yourself — not autoNAT.

---

## 6. Approach

**Build inside `grassroots_networking`, in `lib/src/transport/`.** That is the system the decision
rule must serve, and `ADDR_REFLECT` is already a working reflection primitive. **Drop `dart_libp2p`.**

**Probe from the transport's own socket, not a new one.** One wildcard socket per family serving
every peer is exactly the precondition the RFC 5780 mapping tests require, in RFC 4787 terms; a
second socket has a
different mapping and measures a different NAT. The fork exposes `UDXMultiplexer.onRawPacket` for
precisely this. Three traps, stated explicitly because each costs a day: (a) `_handleRawPacket` drops
anything **< 50 bytes** and drops 36-byte `BCPU` packets, so a probe must be ≥ 50 bytes with its own
magic; (b) **do not reuse `sendRawTo`** — it registers the target in a map that `stop()` does not
clear, so the 10 s ANNOUNCE broadcast would start fanning out to your measurement targets; (c)
`punchUntilResponse` is dead today for the read-ownership reason above, which is the same wall a
second reader will hit.

**Split the two RFC 5780 dimensions — they are not equally reachable from social witnesses.**

- *Mapping behaviour is the easy half.* It needs the mapped `ip:port` reflected from ≥2 witnesses at
  distinct IPs, plus one at a distinct port. `ADDR_REFLECT` already does the reflection; the delta is
  reflecting from a *second distinct address* and retaining every `(reflector, observed tuple,
  timestamp)` instead of last-writer-wins.
- *Filtering behaviour is the actual contribution.* It requires an inbound packet from an endpoint the
  probe has never sent to — which no single witness can produce for itself. Spec it as a relayed
  dial-back: probe → W1 `{nonce, mapped tuple, requested source class}`; W1 instructs W2 (a witness the
  probe has not contacted) to dial back; W2 → probe carrying the nonce. Three arms — dial-back from
  (same IP, contacted port), (same IP, new port), (new IP) — yield EIF/ADF/APDF.

**Guard against contamination. This is the central validity threat and it is invisible unless you
look for it.** Social witnesses are exactly the peers the device already sends to — ANNOUNCE every
10 s, plus ~10 punch datagrams per attempt. A dial-back from an endpoint you already sent to
traverses a hole *you* opened, so it measures your own mapping and will systematically report NATs as
far more permissive than they are. Keep a per-test send-history of every `(dst ip, dst port)` emitted
on the measured socket, treat "witness source was previously contacted" as a **logged discard
condition**, and require every filtering-arm dial-back to come from an unsent-to endpoint. Then run
the with/without-prior-contact comparison on the bench and publish the figure — the label flip is
itself a result about why naive witness-based reachability tests over-report.

**Fix the aggregation rule before measuring its cost.** A nonce'd dial-back is unforgeable, so **one
honest witness suffices to prove reachability**, while a claimed *failure* is cheap to fabricate or
withhold. The sound rule is asymmetric: *any verified success → reachable; declare unreachable only
after k independent witnesses fail.* A symmetric majority vote is the wrong shape.

Byzantine witnesses are cheap to study on a testbed and should be studied there: run *k* witness
processes we control, instruct *f* of them to lie — claim dials they never performed, withhold
successes, collude on a story — and sweep. That gives a cleaner adversarial result than any live
deployment could, because the ground truth of who lied is ours by construction. The one thing the
testbed cannot hand you is the real online-friend-count distribution behind `P(≥k available)`, so
derive that curve parametrically — sweep online fraction and friend count — and state it as a
parametric result rather than a measured one.

**Write a threat model, and implement three defences before the probe runs anywhere outside the
bench.** (1) A
client-chosen nonce echoed in the dial-back, so a witness cannot claim a dial it never performed;
(2) an off-path dial must target the requester's *observed* source, or carry an autoNAT-v2-style
proof-of-cost — report what that costs in bytes and latency; (3) per-requester rate limiting and a
hard refusal to dial or punch any non-globally-routable target (`isGloballyRoutableAddress` already
exists — it is simply not applied on the punch path). Also require ≥2 independent witnesses to agree
before mutating the stored public address. Without these, a witness protocol layered on today's code
is **strictly weaker than autoNAT v1**, whose whole anti-amplification stance was refusing to dial
any address other than the requester's observed source.

**Everything is evaluated on a testbed we control — two tiers, and the vocabulary is enforced.**

*Tier 1 — synthetic bench, labelled by construction.* Spanning the mapping axis takes more than
netfilter flags, and getting this wrong would quietly break milestone 2: default `MASQUERADE` reuses
a mapping for the same source tuple and reads externally as **endpoint-independent**; `--random-fully`
picks a fresh port per flow and reads as **address-and-port-dependent**; and `--persistent` is a SNAT
source-*address* pool control that is not on the mapping axis at all. There is no netfilter knob for
the middle class, so the **address-dependent** case must be constructed deliberately — per-destination
SNAT via nftables maps keyed on destination address, or a userspace NAT. Add filtering variants
spanning EIF/ADF/APDF, 2–3 commercial CPE routers, and a double-NAT/CGNAT emulation. Because every label is known by
construction, "accuracy," precision/recall and confusion matrices are legitimate here, and this is
where the algorithm's correctness claim is established.

*Tier 2 — our own devices on real access networks.* A handful of handsets we own, carrying prepaid
SIMs across the local carriers, moved across the access networks we can physically reach: home,
office, university, and public/commercial Wi-Fi, plus at least one enterprise-style network if we can
get on one. No labels here, so report **"agreement with the oracle,"** never "accuracy," and treat
disagreements as a category with hypotheses (mapping churn mid-test, oracle rate-limited, multi-path).
This tier is what shows the algorithm survives contact with NAT behaviour nobody constructed.

**Get population prevalence by stratified estimation, not by counting devices.** A convenience sample
of our own handsets cannot be averaged into a prevalence figure directly — but it does not have to be.
NAT behaviour is mostly a property of *the network path*, not of the individual subscriber: every
customer of one mobile carrier, on the same APN and PDN type, traverses the same small set of gateway
configurations. So characterize each **stratum** in the testbed, then weight strata by published
population data — accepting up front that with few measurements per stratum the within-stratum
variance is not estimable, only bounded by assumption.

The residual subscriber-level determinants are named rather than wished away. The **handset stack**
decides the requested PDN type and whether a CLAT is present — Android ships 464XLAT and iOS does not
behave identically, so two subscribers on one carrier and APN with different phones can traverse
different translators and yield different measurands. Hence: every cellular stratum is measured on
**≥2 handset stacks, at least one Android and one iOS**.

- *Cellular strata* — one per (carrier, APN, PDN type), not one per carrier. **This is the tractable
  half, not the certain half:** few strata, each cheap to enumerate, each carrying large weight — which
  is exactly why an undetected error inside one is expensive. Near-homogeneity within a carrier is an
  *assumption*, and the named ways it fails are APN (prepaid vs postpaid vs corporate vs M2M, and a
  consumer prepaid SIM generally cannot reach the others), MVNO arrangement (a full MVNO runs its own
  core and NAT and is a separate stratum riding the same brand's market-share row; a light MVNO is
  not), regional PGW/CGNAT pool, and pool exhaustion behaviour under load. Weights come from published
  subscriber counts and market-share reports, cross-checked against per-AS end-user estimates.
- *Residential strata* — by **ISP × whether that ISP CGNATs the subscriber**, with CPE vendor and
  firmware family as a second-order split inside the non-CGNAT cells only. That ordering is the whole
  point: if carrier-grade NAT sits *above* the CPE, the CPE's mapping and port-preservation behaviour
  are invisible from outside and the vendor axis explains nothing. It also fixes the weights — ISP
  subscriber share is published, CPE share by firmware family is not. **This is the weak half:** inside
  the second-order split, many models, drifting firmware, and subscriber-configurable settings mean
  within-cell homogeneity is a real assumption rather than a near-certainty. Weight availability is
  itself a risk — vendor-share figures are shipment-based, rarely per-ISP, never per firmware family —
  so decide the fallback in month 1, not month 6: if per-ISP CPE weights cannot be obtained, report
  residential as an **interval across observed cells**, weighting only the ISP × CGNAT axis, with no
  point estimate and no invented weights.
- *Managed/public Wi-Fi strata* — university, office, commercial hotspot. Weights are the shakiest;
  treat these as a characterized set with a coarse, explicitly-uncertain weight.
- *Residual stratum* — everything the above does not cover: tethered/hotspot clients (whose NAT stacks
  above the carrier's), VPN and private-relay users (who replace the measured path entirely, and are
  over-represented in exactly the privacy-conscious population GN attracts), fixed-wireless and
  satellite home broadband (called residential, but the mechanism is a cellular-style gateway), and
  enterprise networks. We do not measure this stratum; we carry it with its best-available weight and
  it enters the bound at both extremes. **This bullet is what makes the weight table sum to the
  denominator** — without it the strata do not partition the population.

Report prevalence as an estimate with its weight table attached, and run a **sensitivity analysis in
four arms**: (i) recompute under each independent published weighting and vintage; (ii) a genuine
worst/best-case bound assigning all unmeasured and heterogeneity-uncertain mass to the least, then the
most, favourable point in the measurand domain — *this is the only arm that bounds the conclusion*;
(iii) a "behaves like the worst observed stratum" arm, labelled as a realistic-pessimistic variant and
never as a bound; (iv) a within-stratum-heterogeneity arm that perturbs each measured stratum's label
across whatever its homogeneity check observed, and across the full domain where no second measurement
exists. Report which envelope dominates — if heterogeneity dominates the weights, say so, because then
the honest headline is a range and not a number. Report the tractable and weak halves separately: a
defensible cellular/CGNAT estimate plus a bounded residential one beats a blended number nobody can
audit. Cross-check against published NAT and DCUtR measurement studies **only after reconciling
denominators** — those estimate over libp2p nodes and traversal attempts, skewed toward always-on
desktop and datacenter hosts, which is close to the complement of our handset population, so raw
agreement or disagreement is evidence of nothing. Compare where the denominators overlap, and say
plainly where they cannot be reconciled.

Two dividends of doing it this way. The algorithm's correctness claim rests on Tier 1's labelled ground
truth rather than on sample size; and every stratum can be **re-measured on demand**, so when a carrier
changes its gateway the estimate is refreshed with one afternoon of work, which no one-shot campaign
could offer. Buy coverage where it is cheap: each additional prepaid SIM opens another cellular cell,
and a travelling colleague with a spare handset is another country.

On the weight sources, be concrete and state their limits. Per-AS **end-user** estimates (APNIC's, for
example) estimate eyeball users per AS from an ad-delivered sample, and cannot be split into cellular
and fixed for a carrier announcing both under one ASN. Use published subscriber counts as the primary
weight and per-AS user estimates as the cross-check — never AS *size* in announced address space,
which is close to uncorrelated with user count once CGNAT is involved and would systematically
down-weight exactly the strata this study is about.

**AutoNAT baselines: the reference implementation as a sidecar** (go-libp2p `p2p/protocol/autonatv2`),
never a Dart reimplementation — otherwise the "baseline" is the student's own partial protocol and any
gap is unattributable. **Declare the head-to-head Android-only** and state it as a limitation.

**Instrumentation is a deliverable, not a side effect.** A per-attempt record — attempt id, peer,
candidate, family, path taken, phase timestamps, outcome, failure kind — with a durable sink, and the
attempt id stamped on every measurement-relevant control message so both endpoints' records join into
one observation. Add a measurement mode that quiesces the 10 s announce timer during a mapping-lifetime
probe, and stamp every sample with interface type, radio technology, screen state, foreground/background,
and battery-saver state.

**Keep measurement traffic inside the testbed, mechanically.** Enforce a hard target allowlist at the
send path: probes and punches may only target testbed infrastructure and our own devices, and a
witness-supplied address may never bypass it. This is the same guard as the anti-amplification defence
above, and it is what keeps an experiment from spraying unattributable UDP at third parties — which
would be both a nuisance and a source of traffic in the capture that nobody can explain. Never enable
measurement on the live build.

### Reuse, don't rebuild

`hole_punch_service.dart` (both modes; the closed-loop one is already unit-tested) ·
`udp_transport_service.dart` (`rawSocketsByType`, raw send/receive alongside UDX on the same socket,
`UdpConnectFailureKind`, `getRemoteAddress`, `probeAndRebindIfDead`) · `address_utils.dart` (a
ready-made address-class labeller — CGNAT, ULA, Teredo, 6to4 already excluded) ·
`connection_service.dart` (candidate scorer — add a probe loop on top, don't rewrite selection) ·
the signaling control plane (`0x10`+ free; new witness types are purely additive) ·
`noise_session_manager.dart` (authenticated, replay-protected channel — no new crypto work) ·
`peer_link.dart` + the anchor's redemption handler (a complete signed-capability template with expiry,
single-use atomic flip, and constant-time compare — the right shape for a witness attestation) ·
all of `bootstrap_anchor/` (the only Flutter-free deployable component: Dockerfile, GCE deploy,
dual-family bind, observed-source extraction, two-sided matcher) · `putPeerAddress` (the sanctioned
way to feed measured addresses back into the transport without touching the social graph).

---

## 7. Deliverables

- **The grassroots NAT-detection algorithm** — specification with a stated threat model, reference
  implementation in `grassroots_networking`, and validation against an RFC 5780 oracle on a labelled
  bench.
- **Reachability head-to-head** against libp2p autoNAT v1/v2 on the same device, network, and time
  window (Android).
- **Testbed dataset** — every bench configuration with its construction label, and every characterized
  stratum with its measured tuple. Released whole: it is our own devices on our own SIMs, so there is
  nothing to withhold. Two practical checks first — the acceptable-use terms
  of each prepaid and residential plan (consumer terms sometimes bar network probing; check in month 1
  when SIMs are bought, not at submission), and whether to publish our own home and carrier-facing
  addresses verbatim or under a stable pseudonym, which costs nothing and preserves every join.
- **Population prevalence estimates** — per-stratum measurements weighted by published subscriber counts
  and per-AS end-user estimates, carrying the weight table, the stated denominator, the measurement
  date, the assumptions, and the four-arm sensitivity analysis, with cellular reported separately from
  residential. Every interval is an **assumption-sensitivity range, not a confidence interval**: the
  design contains no random sampling, so no standard error exists and no "±" may be printed as if one
  did.
- **Empirical decision rule** for the GN transport, validated by replay on a held-out split.
- **Per-attempt instrumentation subsystem** — useful to the product regardless of the paper.
- **Technical report** targeting **ANRW or PAM** (not IMC — pick the deadline in month 1).

**Scope cut, stated up front.** Primary claim: the witness-based detection algorithm, validated on
labelled ground truth and exercised against real access networks. Supporting: the stratified prevalence
estimate, the reachability head-to-head, and the transport decision rule. *If time permits:* broadening
testbed coverage — more carriers, more countries via travelling handsets, which directly buys estimate
quality — and the IPv6 story, which falls out of the main data and is not a separate contribution. A longitudinal DCUtR/IPFS campaign already covers
millions of traversal attempts across tens of thousands of networks; our defensible axes are
**cellular carriers and CGNAT on
real handsets** and **witness decentralization**. Write related work in month 1, not month 6, and say
which of those findings you expect to reproduce versus contradict.

---

## 8. Milestones

| # | Window | Work | Exit criterion |
|---|--------|------|----------------|
| 1 | Month 1 | Scope lock, measurand in RFC 4787/5780 terms, threat model, aggregation rule, related work, stratum design and testbed inventory | 6–8 page design doc containing the test-to-witness-topology table; threat model with named security goals; the asymmetric aggregation rule; a written stack decision rejecting `dart_libp2p`; the stratum definition with its weight sources named and their coverage of the target population computed; a testbed inventory naming every handset, SIM, CPE router and access network needed to cover those strata, marking what is in hand and what must be bought |
| 2 | Month 2 | RFC 5780 oracle with **two public IPs × two ports**; labelled lab bench — endpoint-independent and address-and-port-dependent from netfilter, address-dependent constructed deliberately (nftables destination maps or userspace NAT), ≥2 CPE routers, CGNAT emulation | One command runs the oracle against ≥8 lab configurations and emits a confusion matrix; **all three mapping classes present, the address-dependent one demonstrably so**; ≥95% agreement with construction labels, every disagreement explained; reproduces from a clean checkout |
| 3 | Month 3 | Witness detection v1: nonce'd dial-back, relayed filtering test, contamination guard, three anti-amplification defences, multi-witness aggregation | With 3 honest witnesses, reproduces the oracle's mapping+filtering labels on ≥8 configurations at ≥90% agreement; tests prove a witness cannot claim an unperformed dial, cannot induce a dial at a third-party address, and that previously-contacted sources are discarded; one figure showing the label flip between contaminated and clean runs |
| 4 | Month 4 | AutoNAT sidecar; back-to-back harness (GN-detect, autoNAT v1, v2, oracle) on one device/network/window; sweep *k* × byzantine *f* ∈ {0, .1, .3, .5} with lying witnesses we operate | One CSV row per (device, network, epoch) with all four verdicts plus latency, bytes, battery; plots of false-negative/false-positive vs *k* per *f*, time-to-verdict vs *k*, and a parametric `P(≥k witnesses available)` curve over online fraction and friend count |
| 5 | Month 5 | Testbed campaign across every stratum: handset × SIM × access network, repeated over screen on/off and foreground/background, roaming and handover triggered deliberately; mapping-lifetime probes per network | Every stratum in the inventory characterized with its full tuple, each measurement repeated on ≥2 days spanning one peak and one off-peak window; **each cellular stratum measured on ≥2 independent subscriber configurations (≥2 SIMs differing in prepaid/postpaid or MVNO/host, and ≥2 handset stacks, at least one Android and one iOS), with their pairwise agreement reported as the within-stratum homogeneity check — a disagreement splits the stratum rather than being averaged away**; every record carrying interface/radio/screen/app state and translation path; notebook reports the per-stratum table and agreement with the oracle, disagreements categorised; every unreached stratum listed with the reason and its population weight, so the coverage hole is quantified rather than hidden |
| 6 | Month 6 | Weight strata into population prevalence with the four-arm sensitivity analysis; fit the decision rule; measure the address-exposure cost of decentralization; write and submit | Prevalence estimates carrying the weight table, denominator and date, cellular and residential separate, with all four sensitivity arms reported and the dominant envelope named, no interval presented as a confidence interval, and compared against published NAT/DCUtR studies **only where denominators reconcile**; decision rule as a predicate table over dial-time inputs, validated on a held-out split, with precision/recall for "direct will succeed" and time saved versus today's fixed 2 s + 10 s; a figure showing how many distinct peers learn a device's address per day, witness-based versus designated-server; a submission-ready paper; one script regenerates every figure from the released data |

*Start the IP-allocation and firewall work in week 1 — that is latency you cannot absorb in month 2.*

---

## 9. Recommended skills

- Basic mobile app development (or Claude)
- Basic networking; a peer-to-peer stack is a big plus
- Statistics
- Matplotlib, R, or any plotting library

Dart/Flutter is learnable during month 1; the networking intuition is the part that is hard to
shortcut.

---

## 10. Decisions to lock before starting

1. **Stack, definitively.** Confirm `dart_libp2p` is rejected and the probe lives in
   `grassroots_networking` on the transport's own socket.
2. **AutoNAT comparison shape.** go-libp2p sidecar (high fidelity, Android-only) or same-socket
   reimplementation (comparable probe, but the baseline becomes the student's own protocol)?
3. **Primary claim.** The *algorithm* or the *measurement*? Both cannot be first-class in six months.
4. **Oracle infrastructure.** Who provisions the dual-homed RFC 5780 server, and can the alternate
   addresses come from the static IPv6 /96 already reserved on the GCE VM? Gates month 2 — check in
   week 1.
5. **Anchor IPv4.** The data-plane rule is IPv6-only, which excludes exactly the IPv4-only CGNAT
   population the study targets. Open an IPv4 rule, or accept and document the exclusion?
6. **Testbed budget and coverage floor.** How many handsets and prepaid SIMs, and which carriers?
   Each *carrier* is a candidate stratum, but each SIM buys only one (carrier, APN, plan) cell of it,
   and at least two cells plus two handset stacks per carrier are needed before homogeneity can be
   checked rather than assumed — so budget roughly double the naive count. This maps directly onto how
   much of the population the estimate can cover and whether it can be defended at all. Decide before
   month 1 ends; procurement is slow.
7. **Whose backlog absorbs the security fixes?** The unvalidated punch target, the missing rate
   limits, the uncorroborated `ADDR_REFLECT`, and the unbounded framer length are production defects
   independent of this project. Student work or team work?
8. **Instrumentation ownership.** Does the per-attempt record land in `main` as a permanent subsystem,
   or in a measurement branch that gets discarded?

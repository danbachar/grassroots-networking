// Ten-slide talk deck for the NAT student project.
// Build:  NODE_PATH=<dir with pptxgenjs> node build-deck.js
// Density rule for this deck: at most four body lines per slide, at most
// twelve words per line. The detail lives in the speaker notes and in
// nat-project.pdf, not on the slide.

const pptxgen = require('pptxgenjs');

const INK = '16202A';
const INK_SOFT = '25323F';
const TEAL = '0E7C86';
const TEAL_DK = '0A5A62';
const AMBER = 'C25E28';
const MUTED = '6E7F8B';
const PANEL = 'EEF3F4';
const WHITE = 'FFFFFF';

const HEAD = 'Cambria';
const BODY = 'Calibri';

const W = 13.3, M = 0.75, CW = W - 2 * M;

const p = new pptxgen();
p.layout = 'LAYOUT_WIDE';
p.author = 'Dan Bachar';
p.title = 'NAT detection and hole punching';

function title(s, text, kicker, dark) {
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: M, y: 0.55, w: CW, h: 0.3, margin: 0,
      fontFace: BODY, fontSize: 11, bold: true, charSpacing: 2, color: TEAL,
    });
  }
  s.addText(text, {
    x: M, y: 0.88, w: CW, h: 0.9, margin: 0,
    fontFace: HEAD, fontSize: 36, bold: true, color: dark ? WHITE : INK,
  });
}

// Body lines, set large and airy. Max four.
function lines(s, arr, o) {
  const opt = o || {};
  const x = opt.x != null ? opt.x : M;
  const w = opt.w != null ? opt.w : CW;
  const size = opt.size || 17;
  const color = opt.color || (opt.dark ? 'B7C4CC' : '3E4C57');
  arr.forEach((t, i) => {
    const y = (opt.y != null ? opt.y : 5.1) + i * (opt.step || 0.48);
    s.addShape(p.ShapeType.ellipse, {
      x, y: y + 0.13, w: 0.13, h: 0.13,
      fill: { color: opt.dot || TEAL }, line: { color: opt.dot || TEAL, width: 0 },
    });
    s.addText(t, {
      x: x + 0.35, y, w: w - 0.35, h: 0.42, margin: 0,
      fontFace: BODY, fontSize: size, color, valign: 'middle',
    });
  });
}

function card(s, o) {
  s.addShape(p.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.06,
    fill: { color: o.fill || PANEL }, line: { color: o.fill || PANEL, width: 0.5 },
  });
}

// ============================================================ 1 · title
{
  const s = p.addSlide();
  s.background = { color: INK };

  const nodes = [[10.2, 1.7, TEAL], [11.5, 2.3, TEAL], [10.75, 3.2, AMBER],
                 [12.0, 3.75, TEAL], [10.35, 4.5, TEAL], [11.55, 5.15, AMBER], [9.7, 2.75, TEAL]];
  [[10.0, 1.85, 11.5, 2.45], [11.65, 2.45, 10.9, 3.35], [10.9, 3.35, 12.0, 3.9],
   [10.5, 4.65, 11.55, 5.3], [9.85, 2.9, 10.5, 4.65]].forEach(([x1, y1, x2, y2]) => {
    s.addShape(p.ShapeType.line, {
      x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
      line: { color: '3C4F5E', width: 1 }, flipH: x2 < x1, flipV: y2 < y1,
    });
  });
  nodes.forEach(([x, y, c]) => s.addShape(p.ShapeType.ellipse, {
    x, y, w: 0.30, h: 0.30, fill: { color: c }, line: { color: c, width: 0 },
  }));

  s.addText('GRASSROOTS NETWORKING  ·  STUDENT PROJECT', {
    x: M, y: 2.3, w: 8.4, h: 0.3, margin: 0,
    fontFace: BODY, fontSize: 12, bold: true, charSpacing: 2, color: TEAL,
  });
  s.addText('NAT detection and\nhole punching', {
    x: M, y: 2.8, w: 8.4, h: 1.8, margin: 0,
    fontFace: HEAD, fontSize: 44, bold: true, color: WHITE, lineSpacingMultiple: 0.95,
  });
  s.addText('Determining NAT behavior from the social graph, without designated servers', {
    x: M, y: 4.75, w: 8.4, h: 0.4, margin: 0, fontFace: BODY, fontSize: 16, color: 'B7C4CC',
  });
  s.addText([
    { text: 'Dan Bachar', options: { bold: true, color: WHITE } },
    { text: '   ·   dan.bachar@campus.technion.ac.il', options: { color: MUTED } },
  ], { x: M, y: 6.4, w: 8.4, h: 0.35, margin: 0, fontFace: BODY, fontSize: 13 });

  s.addNotes('Six months, one student, inside grassroots_networking. The deliverable is the detection algorithm, validated on a testbed we control; the prevalence measurement follows from the same campaign.');
}

// ============================================================ 2 · current path
{
  const s = p.addSlide();
  title(s, 'The current IP path', 'Implementation today', false);

  const steps = ['Learn address', 'Announce', 'Pick one candidate', 'Punch', 'Dial UDX'];
  const cw = 2.15, gap = 0.28;
  steps.forEach((t, i) => {
    const x = M + i * (cw + gap);
    card(s, { x, y: 2.35, w: cw, h: 1.0 });
    s.addText(t, {
      x: x + 0.12, y: 2.35, w: cw - 0.24, h: 1.0, margin: 0,
      fontFace: HEAD, fontSize: 14, bold: true, color: INK, align: 'center', valign: 'middle',
    });
    if (i < steps.length - 1) {
      s.addText('→', {
        x: x + cw, y: 2.35, w: gap, h: 1.0, margin: 0,
        fontFace: BODY, fontSize: 16, bold: true, color: MUTED, align: 'center', valign: 'middle',
      });
    }
  });

  lines(s, [
    'We advertise the discovered public IP with our own local port.',
    'One candidate, one attempt, ten-second timeout, no fallback.',
    'No timestamps and no failure reason: neither outcome teaches us anything.',
  ], { y: 4.3, size: 17 });

  s.addNotes('Two wildcard sockets on port 0, so the port changes on every rebind. The mapped port is only ever learned from ADDR_REFLECT, which needs a session that already works — no use for a first contact. The ten-second announce doubles as the de facto NAT keepalive.');
}

// ============================================================ 3 · NAT behavior
{
  const s = p.addSlide();
  title(s, 'NAT behavior', 'What we must distinguish', false);

  const colX = [M, M + 4.0, M + 6.9];
  const colW = [3.8, 2.7, CW - 6.9];
  ['Behavior', 'Example', 'Effect on hole punching'].forEach((h, i) => {
    s.addText(h.toUpperCase(), {
      x: colX[i], y: 2.15, w: colW[i], h: 0.3, margin: 0,
      fontFace: BODY, fontSize: 10, bold: true, charSpacing: 1.5, color: MUTED,
    });
  });

  const rows = [
    ['Endpoint-independent', 'most home routers', 'One external port for every destination. Punching works.', TEAL],
    ['Address-dependent', 'some enterprise NATs', 'A new port per destination address. Both sides must punch.', TEAL],
    ['Address-and-port-dependent', 'many mobile carriers', 'A new port per endpoint. Punching fails without prediction.', AMBER],
    ['Carrier-grade NAT', 'prepaid mobile data', 'Stacked above all of it. No unsolicited inbound at all.', AMBER],
  ];
  rows.forEach(([b, ex, eff, color], i) => {
    const y = 2.55 + i * 0.92;
    if (i % 2 === 0) card(s, { x: M - 0.15, y: y - 0.06, w: CW + 0.3, h: 0.84, fill: 'F6F9F9' });
    s.addText(b, {
      x: colX[0], y, w: colW[0], h: 0.72, margin: 0,
      fontFace: HEAD, fontSize: 15, bold: true, color, valign: 'middle',
    });
    s.addText(ex, {
      x: colX[1], y, w: colW[1], h: 0.72, margin: 0,
      fontFace: BODY, fontSize: 13, italic: true, color: MUTED, valign: 'middle',
    });
    s.addText(eff, {
      x: colX[2], y, w: colW[2], h: 0.72, margin: 0,
      fontFace: BODY, fontSize: 14.5, color: '3E4C57', valign: 'middle',
    });
  });

  s.addText('We measure the tuple — mapping, filtering, port preservation, lifetime — never a single type.', {
    x: M, y: 6.35, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 15, italic: true, color: TEAL_DK,
  });

  s.addNotes('Filtering is the second axis: which inbound traffic is admitted on an existing mapping, endpoint-independent through address-and-port-dependent. Mapping decides whether a port can be predicted at all; filtering decides whether the arriving packet is let through. Port preservation is why the current code sometimes works by accident, and mapping lifetime sets the keepalive interval.');
}

// ============================================================ 4 · self-classification (dark emphasis)
{
  const s = p.addSlide();
  s.background = { color: INK };
  title(s, 'Self-classification', 'One boolean', true);

  card(s, { x: M, y: 2.3, w: 5.6, h: 1.5, fill: INK_SOFT });
  s.addText('isWellConnected = true', {
    x: M + 0.4, y: 2.55, w: 4.8, h: 0.45, margin: 0,
    fontFace: 'Courier New', fontSize: 20, bold: true, color: WHITE,
  });
  s.addText('A routability test over the advertised string.', {
    x: M + 0.4, y: 3.05, w: 4.8, h: 0.35, margin: 0, fontFace: BODY, fontSize: 13, color: '93A4AE',
  });

  card(s, { x: M + 6.0, y: 2.3, w: 5.8, h: 1.5, fill: '3A2A22' });
  s.addText('A CGNAT handset passes it', {
    x: M + 6.4, y: 2.55, w: 5.0, h: 0.35, margin: 0,
    fontFace: HEAD, fontSize: 17, bold: true, color: 'E9A876',
  });
  s.addText('It never sees its own inner address.', {
    x: M + 6.4, y: 3.0, w: 5.0, h: 0.4, margin: 0, fontFace: BODY, fontSize: 13, color: 'D8C3B4',
  });

  lines(s, [
    'The punch is then suppressed for the peers that need it.',
    'The device reflects addresses and mediates for its friends.',
    'Having a public address is not being reachable at it.',
  ], { y: 4.5, size: 17, dark: true, dot: AMBER });

  s.addNotes('Confirmed in source at grassroots_network.dart:3369. This is the clearest motivation for the project: the system cannot distinguish a public address from a reachable one, and every consequence follows from that.');
}

// ============================================================ 5 · the idea
{
  const s = p.addSlide();
  title(s, 'Witness-based detection', 'The idea', false);

  // Probe at left; three friends at right, each dialing back from its own vantage point.
  const px = M + 0.4, py = 3.15;
  s.addShape(p.ShapeType.roundRect, {
    x: px, y: py, w: 2.5, h: 1.1, rectRadius: 0.06,
    fill: { color: PANEL }, line: { color: TEAL, width: 1.4 },
  });
  s.addText('Probe', { x: px, y: py + 0.2, w: 2.5, h: 0.36, margin: 0, fontFace: HEAD, fontSize: 17, bold: true, color: INK, align: 'center' });
  s.addText('the device', { x: px, y: py + 0.58, w: 2.5, h: 0.3, margin: 0, fontFace: BODY, fontSize: 12, color: MUTED, align: 'center' });

  const friends = [
    ['Friend A', 'session open', TEAL, 2.15],
    ['Friend B', 'new source port', TEAL, 3.35],
    ['Friend C', 'never contacted', AMBER, 4.55],
  ];
  friends.forEach(([n, sub, color, y]) => {
    const fx = M + 8.3;
    s.addShape(p.ShapeType.roundRect, {
      x: fx, y, w: 3.3, h: 0.95, rectRadius: 0.06,
      fill: { color: PANEL }, line: { color, width: 1.3 },
    });
    s.addText(n, { x: fx + 0.15, y: y + 0.14, w: 3.0, h: 0.32, margin: 0, fontFace: HEAD, fontSize: 15, bold: true, color: INK });
    s.addText(sub, { x: fx + 0.15, y: y + 0.48, w: 3.0, h: 0.3, margin: 0, fontFace: BODY, fontSize: 11.5, color });
    const x1 = px + 2.5, y1 = py + 0.55;      // probe, right edge
    const x2 = fx, y2 = y + 0.475;            // friend, left edge
    s.addShape(p.ShapeType.line, {
      x: x1, y: Math.min(y1, y2), w: x2 - x1, h: Math.abs(y2 - y1),
      line: { color, width: 1.4, beginArrowType: 'triangle' },
      flipV: y2 < y1,
    });
  });
  s.addText('each dial-back carries the nonce', {
    x: px, y: py + 1.3, w: 2.5, h: 0.3, margin: 0,
    fontFace: BODY, fontSize: 11.5, color: MUTED, align: 'center',
  });

  lines(s, [
    'Only friends. The probe asks each of them directly.',
    'They dial back from different addresses and ports.',
    'A nonce in each reply makes a fabricated dial-back impossible.',
  ], { y: 5.75, size: 16.5, step: 0.44 });

  s.addNotes('Reflections from friends at distinct addresses give mapping behavior. Filtering follows from where the dial-backs come from, classified against our own send history: a friend we have a session with, the same friend on a fresh source port, and a friend we have never transmitted to. No friend is ever asked to dial anyone but us, so there is no amplification vector and no relaying for non-friends, which the signaling design forbids anyway.');
}

// ============================================================ 6 · validity threats
{
  const s = p.addSlide();
  title(s, 'Two things that mislead', 'Under honest peers', false);

  card(s, { x: M, y: 2.3, w: 5.7, h: 2.9 });
  s.addShape(p.ShapeType.ellipse, { x: M + 0.4, y: 2.6, w: 0.4, h: 0.4, fill: { color: AMBER }, line: { color: AMBER, width: 0 } });
  s.addText('Contamination', { x: M + 0.4, y: 3.15, w: 4.9, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 20, bold: true, color: INK });
  lines(s, [
    'Witnesses are the peers we already transmit to.',
    'It measures our own mapping, not the NAT rule.',
    'Guard: a per-test send history discards contacted sources.',
  ], { x: M + 0.4, w: 4.9, y: 3.65, size: 13.5, step: 0.42, dot: AMBER });

  card(s, { x: M + 6.1, y: 2.3, w: 5.7, h: 2.9 });
  s.addShape(p.ShapeType.ellipse, { x: M + 6.5, y: 2.6, w: 0.4, h: 0.4, fill: { color: TEAL }, line: { color: TEAL, width: 0 } });
  s.addText('Absent dial-backs', { x: M + 6.5, y: 3.15, w: 4.9, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 20, bold: true, color: INK });
  lines(s, [
    'An arriving dial-back is definitive: the path exists.',
    'An absent one is filtering, or simply loss.',
    'Negative verdicts need retries and k witnesses.',
  ], { x: M + 6.5, w: 4.9, y: 3.65, size: 13.5, step: 0.42 });

  s.addText('We assume peers are honest. Relaxing that assumption is follow-on work.', {
    x: M, y: 5.6, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 15, italic: true, color: TEAL_DK,
  });

  s.addNotes('Contamination is the one that would quietly invalidate a field campaign: it biases in the direction that looks like good news. We publish the label difference between contaminated and clean runs as a result in its own right. The nonce survives the honesty assumption for a different reason: the peers are honest but the network is not, and an off-path party could otherwise inject something resembling a dial-back. Disagreement between witnesses is diagnostic here, not malicious: it usually means the behavior genuinely depends on the source address or port.');
}

// ============================================================ 7 · validation
{
  const s = p.addSlide();
  title(s, 'Validation in two tiers', 'How the claim is established', false);

  const rows = [
    ['Bench', 'Eight-plus configurations, labeled by construction', 'accuracy is legitimate here', TEAL],
    ['Sweep', 'Witness count k against byzantine fraction f', 'we operate every witness', TEAL],
    ['Campaign', 'Our own handsets and SIMs across every stratum', 'agreement, never accuracy', AMBER],
  ];
  rows.forEach(([label, what, note, color], i) => {
    const y = 2.5 + i * 1.25;
    card(s, { x: M, y, w: CW, h: 1.05 });
    s.addShape(p.ShapeType.roundRect, {
      x: M + 0.3, y: y + 0.25, w: 1.9, h: 0.55, rectRadius: 0.05,
      fill: { color }, line: { color, width: 0 },
    });
    s.addText(label, {
      x: M + 0.3, y: y + 0.25, w: 1.9, h: 0.55, margin: 0,
      fontFace: HEAD, fontSize: 15, bold: true, color: WHITE, align: 'center', valign: 'middle',
    });
    s.addText(what, {
      x: M + 2.5, y, w: 6.4, h: 1.05, margin: 0,
      fontFace: BODY, fontSize: 16, color: '3E4C57', valign: 'middle',
    });
    s.addText(note, {
      x: M + 9.0, y, w: 2.6, h: 1.05, margin: 0,
      fontFace: BODY, fontSize: 13, italic: true, color: MUTED, valign: 'middle', align: 'right',
    });
  });

  s.addText('Address-dependent mapping is built deliberately; no netfilter flag produces it.', {
    x: M, y: 6.15, w: CW, h: 0.35, margin: 0, fontFace: BODY, fontSize: 15, italic: true, color: TEAL_DK,
  });
  s.addText('Friends carry the method; public autoNAT nodes are a spot check on reachability only.', {
    x: M, y: 6.55, w: CW, h: 0.35, margin: 0, fontFace: BODY, fontSize: 15, italic: true, color: TEAL_DK,
  });

  s.addNotes('The correctness claim rests on the bench, where labels are known by construction. The reference server needs two public addresses and two ports per family. Default masquerade reads endpoint-independent and --random-fully reads address-and-port-dependent, so the middle class comes from per-destination SNAT via nftables maps. The autoNAT cross-check runs as a standalone client on the same network, so it characterizes the network rather than our socket, and it is Wi-Fi only: on cellular it would need tethering, which adds another translation layer.');
}

// ============================================================ 8 · testbed and strata
{
  const s = p.addSlide();
  title(s, 'The testbed', 'What prevalence costs', false);

  lines(s, [
    'NAT behavior is a property of the path, not the subscriber.',
    'A stratum is one carrier, APN and PDN type; or one ISP and CGNAT status.',
    'Two SIMs and two handset stacks per carrier, before assuming homogeneity.',
    'Weights from published subscriber counts, never announced address space.',
  ], { y: 2.5, size: 17, step: 0.62 });

  card(s, { x: M, y: 5.35, w: CW, h: 1.0, fill: 'E7F1F1' });
  s.addText([
    { text: 'A census of strata, not a sample:  ', options: { bold: true, color: TEAL_DK } },
    { text: 'there is no probabilistic sampling within a stratum, so we report sensitivity ranges and never confidence intervals.', options: { color: '3E4C57' } },
  ], { x: M + 0.4, y: 5.55, w: CW - 0.8, h: 0.6, margin: 0, fontFace: BODY, fontSize: 14.5, lineSpacingMultiple: 1.05 });

  s.addNotes('Each SIM buys one carrier-APN-plan cell, not a whole carrier, so budget roughly double the naive count. A residual stratum — tethering, VPN and private relay, fixed wireless, enterprise — is carried unmeasured at its best available weight, which is what lets the weight table sum to the denominator.');
}

// ============================================================ 9 · plan
{
  const s = p.addSlide();
  title(s, 'One semester', 'Sequence', false);

  const phases = [
    ['Weeks 1–3', 'Onboarding; a STUN client on the transport\u2019s own socket. Go/no-go.', TEAL],
    ['Weeks 4–10', 'The oracle and labeled bench; then the witness protocol and its classifier.', TEAL],
    ['Weeks 11–15', 'Measurement on our own devices across reachable networks; write-up.', AMBER],
  ];
  phases.forEach(([when, what, color], i) => {
    const y = 2.6 + i * 1.3;
    s.addShape(p.ShapeType.roundRect, {
      x: M, y, w: 2.5, h: 1.0, rectRadius: 0.06,
      fill: { color }, line: { color, width: 0 },
    });
    s.addText(when, {
      x: M, y, w: 2.5, h: 1.0, margin: 0,
      fontFace: HEAD, fontSize: 16, bold: true, color: WHITE, align: 'center', valign: 'middle',
    });
    s.addText(what, {
      x: M + 2.9, y, w: CW - 2.9, h: 1.0, margin: 0,
      fontFace: BODY, fontSize: 16.5, color: '3E4C57', valign: 'middle',
    });
  });

  s.addText('Week one: two public addresses, firewall rules, SIMs and handsets. They gate week four.', {
    x: M, y: 6.35, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 15, italic: true, color: AMBER,
  });

  s.addNotes('Every phase carries an exit criterion in the written brief. The week-3 checkpoint is code rather than a document: a reflexive address obtained over the transport\u2019s own socket, which forces the demultiplexer change early and tells us whether the socket can be shared at all. Excluded by design and named as such: the autoNAT sidecar, the byzantine analysis, the weighted prevalence estimate and the decision-rule fit.');
}

// ============================================================ 10 · open decisions (dark)
{
  const s = p.addSlide();
  s.background = { color: INK };
  title(s, 'Open decisions', 'Before the work begins', true);

  const qs = [
    ['Primary claim', 'The algorithm or the measurement, not both.'],
    ['UDX fork', 'The guard cannot see UDX\u2019s own sends. Patch the fork, or report the residual.'],
    ['Reference server', 'Who provisions it, and from which address block.'],
    ['Testbed budget', 'Each SIM covers one carrier, APN and plan.'],
  ];
  qs.forEach(([h, b], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (CW / 2 + 0.2), y = 2.5 + row * 1.6;
    const w = CW / 2 - 0.2;
    s.addText(h, { x, y, w, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 19, bold: true, color: TEAL });
    s.addText(b, { x, y: y + 0.48, w, h: 0.5, margin: 0, fontFace: BODY, fontSize: 15, color: 'B7C4CC' });
  });

  s.addText('The written brief carries the detail: measurand, threat model, milestones, exit criteria.', {
    x: M, y: 6.1, w: CW, h: 0.4, margin: 0, fontFace: BODY, fontSize: 14, italic: true, color: MUTED,
  });

  s.addNotes('The anchor is IPv6-only in its data plane, which excludes the IPv4-only CGNAT population the study targets; that is a fifth decision and it also affects the product. Three unrelated defects found while surveying the transport are listed in the brief.');
}

p.writeFile({ fileName: 'grassroots-nat-project.pptx' }).then((f) => console.log('wrote', f));

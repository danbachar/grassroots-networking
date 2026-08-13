const pptxgen = require('pptxgenjs');

// ---- palette -------------------------------------------------------------
const INK = '16202A';        // deep slate — dark slides
const INK_SOFT = '25323F';   // panel on dark
const TEAL = '0E7C86';       // primary
const TEAL_DK = '0A5A62';
const AMBER = 'C25E28';      // accent: blocked / signal
const MUTED = '6E7F8B';
const PANEL = 'EEF3F4';
const WHITE = 'FFFFFF';

const HEAD = 'Cambria';
const BODY = 'Calibri';

const W = 13.3, H = 7.5, M = 0.6, CW = W - 2 * M;

const p = new pptxgen();
p.layout = 'LAYOUT_WIDE';
p.author = 'Dan Bachar';
p.title = 'Grassroots NAT Detection';

// ---- helpers -------------------------------------------------------------
function titleBar(s, text, kicker, dark) {
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: M, y: 0.42, w: CW, h: 0.28, margin: 0,
      fontFace: BODY, fontSize: 11, bold: true, charSpacing: 2,
      color: dark ? TEAL : TEAL, align: 'left',
    });
  }
  s.addText(text, {
    x: M, y: kicker ? 0.72 : 0.5, w: CW, h: 0.85, margin: 0,
    fontFace: HEAD, fontSize: 34, bold: true,
    color: dark ? WHITE : INK, align: 'left', valign: 'top',
  });
}

function card(s, o) {
  s.addShape(p.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.06,
    fill: { color: o.fill || PANEL },
    line: { color: o.fill ? o.fill : PANEL, width: 0.5 },
  });
}

function numDot(s, o) {
  s.addShape(p.ShapeType.ellipse, {
    x: o.x, y: o.y, w: 0.42, h: 0.42,
    fill: { color: o.color || TEAL }, line: { color: o.color || TEAL, width: 0 },
  });
  s.addText(String(o.n), {
    x: o.x, y: o.y, w: 0.42, h: 0.42, margin: 0,
    fontFace: BODY, fontSize: 15, bold: true, color: WHITE,
    align: 'center', valign: 'middle',
  });
}

// ============================================================ 1. TITLE
{
  const s = p.addSlide();
  s.background = { color: INK };

  // node motif: a scatter of peers, two of them blocked
  const nodes = [
    [10.05, 1.55, TEAL], [11.35, 2.15, TEAL], [10.62, 3.05, AMBER],
    [11.9, 3.62, TEAL], [10.2, 4.35, TEAL], [11.42, 5.02, AMBER],
    [9.55, 2.62, TEAL],
  ];
  // lines first, so the nodes sit on top of their connectors
  [[9.85, 1.70, 11.35, 2.30], [11.5, 2.30, 10.77, 3.20], [10.77, 3.20, 11.9, 3.77],
   [10.35, 4.50, 11.42, 5.17], [9.7, 2.77, 10.35, 4.50]].forEach(([x1, y1, x2, y2]) => {
    s.addShape(p.ShapeType.line, {
      x: Math.min(x1, x2), y: Math.min(y1, y2),
      w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
      line: { color: '3C4F5E', width: 1, dashType: 'solid' },
      flipH: x2 < x1, flipV: y2 < y1,
    });
  });
  nodes.forEach(([x, y, c]) => {
    s.addShape(p.ShapeType.ellipse, {
      x, y, w: 0.30, h: 0.30, fill: { color: c }, line: { color: c, width: 0 },
    });
  });

  s.addText('STUDENT PROJECT  ·  GRASSROOTS NETWORKING', {
    x: M, y: 1.75, w: 8.6, h: 0.3, margin: 0,
    fontFace: BODY, fontSize: 12, bold: true, charSpacing: 2, color: TEAL,
  });
  s.addText('Measuring what\nwe currently guess', {
    x: M, y: 2.25, w: 8.6, h: 1.9, margin: 0,
    fontFace: HEAD, fontSize: 46, bold: true, color: WHITE, lineSpacingMultiple: 0.95,
  });
  s.addText('NAT detection and hole-punching, using your friends instead of servers', {
    x: M, y: 4.25, w: 8.4, h: 0.5, margin: 0,
    fontFace: BODY, fontSize: 17, color: 'B7C4CC',
  });
  s.addText([
    { text: 'Dan Bachar', options: { bold: true, color: WHITE } },
    { text: '   ·   dan.bachar@campus.technion.ac.il', options: { color: MUTED } },
  ], { x: M, y: 6.35, w: 8.6, h: 0.35, margin: 0, fontFace: BODY, fontSize: 13 });

  s.addNotes('Framing: this is not a survey project. The deliverable is an algorithm — NAT detection without designated servers — validated against a proper oracle. The survey falls out of it.');
}

// ============================================================ 2. CONTEXT
{
  const s = p.addSlide();
  titleBar(s, 'What Grassroots Networking is', 'Context', false);

  const items = [
    ['No infrastructure', 'Messages go straight from sender to recipient. No relay ever carries another peer\'s traffic — that is the founding claim, and every server we add erodes it.'],
    ['Two transports', 'BLE for peers in range, UDP/UDX for everyone else. Same interface: connect, send, receive. BLE wins when both are available.'],
    ['Identity is a key pair', 'An Ed25519 public key is the peer. Nicknames are cosmetic; every trust decision is a signature check.'],
  ];
  items.forEach(([h, b], i) => {
    const x = M + i * (CW / 3 + 0.06), w = CW / 3 - 0.2;
    card(s, { x, y: 2.2, w, h: 3.35 });
    s.addShape(p.ShapeType.ellipse, {
      x: x + 0.35, y: 2.6, w: 0.5, h: 0.5,
      fill: { color: TEAL }, line: { color: TEAL, width: 0 },
    });
    s.addText(h, {
      x: x + 0.35, y: 3.32, w: w - 0.7, h: 0.45, margin: 0,
      fontFace: HEAD, fontSize: 19, bold: true, color: INK,
    });
    s.addText(b, {
      x: x + 0.35, y: 3.82, w: w - 0.7, h: 1.5, margin: 0,
      fontFace: BODY, fontSize: 13.5, color: '3E4C57', lineSpacingMultiple: 1.12,
    });
  });

  s.addText('The IP transport is where this project lives — and it is the half we have never measured.', {
    x: M, y: 6.05, w: CW, h: 0.45, margin: 0,
    fontFace: BODY, fontSize: 15, italic: true, color: TEAL_DK,
  });
  s.addNotes('Keep this short. The point of the slide is that the no-infrastructure claim is falsifiable, and nobody has tried to falsify it yet.');
}

// ============================================================ 3. TODAY'S PATH
{
  const s = p.addSlide();
  titleBar(s, 'What happens today when two peers connect', 'The current path', false);

  const steps = [
    ['Learn my address', 'HTTPS to seeip.org,\ncached 5 min'],
    ['Advertise', 'ANNOUNCE every 10 s,\nsigned, with candidates'],
    ['Pick one target', 'link-local > IPv6 > IPv4,\nexactly one pair'],
    ['Punch', '36-byte packet,\n2 s at 200 ms ≈ 10 sent'],
    ['Dial UDX', 'one attempt,\n10 s timeout'],
  ];
  const cw = 2.24, gap = 0.22;
  steps.forEach(([h, b], i) => {
    const x = M + i * (cw + gap);
    card(s, { x, y: 2.25, w: cw, h: 2.3 });
    numDot(s, { x: x + 0.22, y: 2.45, n: i + 1 });
    s.addText(h, {
      x: x + 0.22, y: 2.98, w: cw - 0.44, h: 0.6, margin: 0,
      fontFace: HEAD, fontSize: 14.5, bold: true, color: INK,
    });
    s.addText(b, {
      x: x + 0.22, y: 3.58, w: cw - 0.44, h: 0.8, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: '4A5A66', lineSpacingMultiple: 1.05,
    });
    if (i < steps.length - 1) {
      s.addText('→', {
        x: x + cw - 0.02, y: 3.15, w: 0.26, h: 0.4, margin: 0,
        fontFace: BODY, fontSize: 17, bold: true, color: MUTED, align: 'center',
      });
    }
  });

  card(s, { x: M, y: 5.0, w: CW, h: 1.55, fill: 'FBF0E8' });
  s.addText('Three things this path never does', {
    x: M + 0.35, y: 5.2, w: 4.2, h: 0.35, margin: 0,
    fontFace: HEAD, fontSize: 15, bold: true, color: AMBER,
  });
  s.addText([
    { text: 'Discover the NAT-mapped port. ', options: { bold: true } },
    { text: 'We advertise our public IP paired with our ', options: {} },
    { text: 'local', options: { italic: true } },
    { text: ' port — a guess.', options: {} },
  ], { x: M + 0.35, y: 5.58, w: CW - 0.7, h: 0.28, margin: 0, fontFace: BODY, fontSize: 12.5, color: '4A3529' });
  s.addText([
    { text: 'Check whether the punch worked. ', options: { bold: true } },
    { text: 'The closed-loop mode has no production caller and cannot run — the multiplexer owns socket reads.', options: {} },
  ], { x: M + 0.35, y: 5.88, w: CW - 0.7, h: 0.28, margin: 0, fontFace: BODY, fontSize: 12.5, color: '4A3529' });
  s.addText([
    { text: 'Record anything. ', options: { bold: true } },
    { text: 'No timestamps, no attempt id; the reducer discards the failure reason. Nothing is measurable after the fact.', options: {} },
  ], { x: M + 0.35, y: 6.18, w: CW - 0.7, h: 0.28, margin: 0, fontFace: BODY, fontSize: 12.5, color: '4A3529' });

  s.addNotes('Every constant here was read out of the source, not the design docs. 10 s announce is also the de facto NAT keepalive — there is no dedicated one.');
}

// ============================================================ 4. THE BLIND SPOT (dark)
{
  const s = p.addSlide();
  s.background = { color: INK };
  titleBar(s, 'The blind spot that bites hardest', 'One boolean, two wrong answers', true);

  s.addText('A phone behind carrier NAT asks seeip.org for its address. It gets the carrier’s outer public IP — it never sees its own 100.64 inner address. So it advertises a globally routable IP, and every peer agrees:', {
    x: M, y: 1.95, w: CW, h: 0.72, margin: 0,
    fontFace: BODY, fontSize: 15, color: 'B7C4CC', lineSpacingMultiple: 1.1,
  });

  card(s, { x: M, y: 2.85, w: 6.0, h: 1.5, fill: INK_SOFT });
  s.addText('isWellConnected = true', {
    x: M + 0.4, y: 3.12, w: 5.2, h: 0.4, margin: 0,
    fontFace: 'Courier New', fontSize: 19, bold: true, color: WHITE,
  });
  s.addText('The UI tells the user they are well-connected.', {
    x: M + 0.4, y: 3.6, w: 5.2, h: 0.35, margin: 0,
    fontFace: BODY, fontSize: 13, color: '93A4AE',
  });

  card(s, { x: M + 6.35, y: 2.85, w: 5.75, h: 1.5, fill: '3A2A22' });
  s.addText('Wrong twice over', {
    x: M + 6.75, y: 3.05, w: 5.0, h: 0.32, margin: 0,
    fontFace: HEAD, fontSize: 15, bold: true, color: 'E9A876',
  });
  s.addText('The advertised port is the local port, not the mapped one — and the carrier NAT will not accept unsolicited inbound at all.', {
    x: M + 6.75, y: 3.42, w: 5.0, h: 0.7, margin: 0,
    fontFace: BODY, fontSize: 13, color: 'D8C3B4', lineSpacingMultiple: 1.05,
  });

  s.addText('Three live behaviours run off that false positive', {
    x: M, y: 4.65, w: CW, h: 0.35, margin: 0,
    fontFace: HEAD, fontSize: 16, bold: true, color: WHITE,
  });
  const cons = [
    'The pre-connect punch is suppressed for peers that look public — so it is skipped for exactly the peers that need it.',
    'The phone starts acting as an address reflector and rendezvous facilitator for its friends.',
    'Nothing anywhere distinguishes “has a public IP” from “is reachable at that ip:port.”',
  ];
  cons.forEach((t, i) => {
    const y = 5.12 + i * 0.44;
    s.addShape(p.ShapeType.ellipse, {
      x: M + 0.05, y: y + 0.09, w: 0.16, h: 0.16,
      fill: { color: AMBER }, line: { color: AMBER, width: 0 },
    });
    s.addText(t, {
      x: M + 0.42, y, w: CW - 0.5, h: 0.4, margin: 0,
      fontFace: BODY, fontSize: 13.5, color: 'C3CFD6',
    });
  });
  s.addNotes('This is the slide to slow down on. It is a real defect, confirmed in source at grassroots_network.dart:3369-3373, and it is also the cleanest motivation for the whole project.');
}

// ============================================================ 5. WHAT WE DON'T KNOW
{
  const s = p.addSlide();
  titleBar(s, 'What we do not know', 'The evidence gap', false);

  const gaps = [
    ['No NAT classification', 'Not one line of code determines mapping or filtering behaviour. A routability check on a string stands in for it.'],
    ['No mapped-port discovery', 'The true port only ever arrives from a peer that is already connected — useless for the case where nothing has connected yet.'],
    ['No dial-back, no witnesses', '“Am I reachable from outside?” is asserted from a string prefix. It is never tested.'],
    ['No instrumentation', 'No Stopwatch anywhere in lib/. Punch outcome is a four-value enum with no timestamps and the reason discarded.'],
  ];
  gaps.forEach(([h, b], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (CW / 2 + 0.1), y = 2.15 + row * 2.0;
    const w = CW / 2 - 0.1;
    card(s, { x, y, w, h: 1.75 });
    s.addShape(p.ShapeType.ellipse, {
      x: x + 0.32, y: y + 0.42, w: 0.34, h: 0.34,
      fill: { color: AMBER }, line: { color: AMBER, width: 0 },
    });
    s.addText(h, {
      x: x + 0.85, y: y + 0.38, w: w - 1.2, h: 0.4, margin: 0,
      fontFace: HEAD, fontSize: 17, bold: true, color: INK,
    });
    s.addText(b, {
      x: x + 0.85, y: y + 0.82, w: w - 1.2, h: 0.75, margin: 0,
      fontFace: BODY, fontSize: 12.5, color: '4A5A66', lineSpacingMultiple: 1.08,
    });
  });

  s.addText('Every give-up constant in the transport — 2 s punch, 10 s handshake, 15 s backoff, 60 s retry — was chosen by intuition. None of them came from a measurement.', {
    x: M, y: 6.35, w: CW, h: 0.6, margin: 0,
    fontFace: BODY, fontSize: 15, italic: true, color: TEAL_DK, lineSpacingMultiple: 1.1,
  });
  s.addNotes('Ranked by how much each blocks a decision. The instrumentation gap is the one that makes the paper impossible, not just the product worse.');
}

// ============================================================ 6. USE CASE
{
  const s = p.addSlide();
  titleBar(s, 'Maya cannot reach Noam, and nobody finds out why', 'A concrete failure', false);

  card(s, { x: M, y: 1.9, w: 3.5, h: 1.0 });
  s.addText('MAYA', { x: M + 0.3, y: 2.02, w: 2.9, h: 0.28, margin: 0, fontFace: BODY, fontSize: 11, bold: true, charSpacing: 1.5, color: TEAL });
  s.addText('Android, cellular only,\ncarrier CGNAT, IPv4 only', { x: M + 0.3, y: 2.3, w: 3.0, h: 0.55, margin: 0, fontFace: BODY, fontSize: 12.5, color: '4A5A66' });

  s.addText('→', { x: M + 3.62, y: 2.2, w: 0.5, h: 0.4, margin: 0, fontFace: BODY, fontSize: 20, bold: true, color: AMBER, align: 'center' });

  card(s, { x: M + 4.25, y: 1.9, w: 3.5, h: 1.0 });
  s.addText('NOAM', { x: M + 4.55, y: 2.02, w: 2.9, h: 0.28, margin: 0, fontFace: BODY, fontSize: 11, bold: true, charSpacing: 1.5, color: TEAL });
  s.addText('Home Wi-Fi, port-restricted\nNAT, IPv4 + working IPv6', { x: M + 4.55, y: 2.3, w: 3.0, h: 0.55, margin: 0, fontFace: BODY, fontSize: 12.5, color: '4A5A66' });

  card(s, { x: M + 8.1, y: 1.9, w: 4.0, h: 1.0, fill: 'FBF0E8' });
  s.addText('Accepted friends, paired\nover BLE, now apart.', { x: M + 8.4, y: 2.12, w: 3.5, h: 0.6, margin: 0, fontFace: BODY, fontSize: 12.5, italic: true, color: '7A4A28' });

  const steps = [
    ['Maya advertises her carrier’s public IP + her own local port. Both sides compute “well-connected”.', false],
    ['She tries to add the anchor. Its firewall rule is IPv6-only; the add times out. She now has no way to ever learn her mapped port.', true],
    ['She dials. Candidate selection prefers Noam’s IPv6 because her IPv6 socket is bound — though she has no IPv6 transit. One attempt, 10 s, no fallback to IPv4.', true],
    ['The punch is suppressed on both sides: each sees the other as public. Had it fired, it would have targeted the local ports anyway.', true],
    ['Mediation needs a mutual friend who has Noam live right now, same address family. If the carrier maps a different port per destination, every datagram hits a closed pinhole.', true],
    ['Nothing is recorded. “Wrong port”, “filtered”, “no route” and “peer offline” are indistinguishable in the logs.', true],
  ];
  steps.forEach(([t, bad], i) => {
    const y = 3.15 + i * 0.55;
    numDot(s, { x: M + 0.02, y: y - 0.02, n: i + 1, color: bad ? AMBER : TEAL });
    s.addText(t, {
      x: M + 0.58, y, w: CW - 0.7, h: 0.48, margin: 0,
      fontFace: BODY, fontSize: 13, color: '3E4C57', valign: 'middle',
    });
  });

  s.addText('And when it works, it works blindly: on a port-preserving NAT the guess happens to be right, the first dial succeeds, and we learn nothing.', {
    x: M, y: 6.5, w: CW, h: 0.5, margin: 0,
    fontFace: BODY, fontSize: 13.5, italic: true, color: TEAL_DK,
  });
  s.addNotes('Every step here is what the current code actually does, traced through the source. The last line is the important one — success teaches us nothing either.');
}

// ============================================================ 7. THE IDEA
{
  const s = p.addSlide();
  titleBar(s, 'Ask your friends to dial you back', 'The idea', false);

  s.addText('libp2p’s autoNAT leans on a small set of well-known dial-back nodes. We have a social graph instead. The hard half is filtering behaviour: it needs an inbound packet from an endpoint you have never sent to — which no single witness can produce for itself.', {
    x: M, y: 1.85, w: CW, h: 0.7, margin: 0,
    fontFace: BODY, fontSize: 14.5, color: '3E4C57', lineSpacingMultiple: 1.1,
  });

  // diagram: probe -> W1 -> W2 -> probe
  const dy = 3.45;
  const nodeAt = (x, label, sub, color) => {
    s.addShape(p.ShapeType.roundRect, {
      x, y: dy, w: 2.1, h: 0.95, rectRadius: 0.06,
      fill: { color: PANEL }, line: { color: color, width: 1.25 },
    });
    s.addText(label, { x: x + 0.1, y: dy + 0.16, w: 1.9, h: 0.32, margin: 0, fontFace: HEAD, fontSize: 15, bold: true, color: INK, align: 'center' });
    s.addText(sub, { x: x + 0.1, y: dy + 0.5, w: 1.9, h: 0.3, margin: 0, fontFace: BODY, fontSize: 11, color: MUTED, align: 'center' });
  };
  nodeAt(M, 'Probe', 'the device', TEAL);
  nodeAt(M + 4.0, 'Witness 1', 'a friend', TEAL);
  nodeAt(M + 8.0, 'Witness 2', 'never contacted', AMBER);

  const arrow = (x1, x2, y, label, color) => {
    s.addShape(p.ShapeType.line, {
      x: x1, y, w: x2 - x1, h: 0,
      line: { color, width: 1.5, endArrowType: 'triangle' },
    });
    s.addText(label, {
      x: x1, y: y - 0.42, w: x2 - x1, h: 0.34, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: color, align: 'center',
    });
  };
  arrow(M + 2.15, M + 3.95, dy + 0.45, 'nonce + my mapped tuple', TEAL);
  arrow(M + 6.15, M + 7.95, dy + 0.45, 'dial this peer, from you', TEAL);
  s.addShape(p.ShapeType.line, {
    x: M + 1.05, y: dy + 0.95, w: 0, h: 0.62, line: { color: AMBER, width: 1.5 },
  });
  s.addShape(p.ShapeType.line, {
    x: M + 1.05, y: dy + 1.57, w: 8.0, h: 0, line: { color: AMBER, width: 1.5, beginArrowType: 'triangle' },
  });
  s.addShape(p.ShapeType.line, {
    x: M + 9.05, y: dy + 0.95, w: 0, h: 0.62, line: { color: AMBER, width: 1.5 },
  });
  s.addText('dial-back carrying the nonce  —  from an endpoint the probe never sent to', {
    x: M + 1.05, y: dy + 1.62, w: 8.0, h: 0.3, margin: 0,
    fontFace: BODY, fontSize: 11.5, color: AMBER, align: 'center',
  });

  card(s, { x: M + 10.3, y: dy - 0.15, w: 1.8, h: 2.1, fill: 'E7F1F1' });
  s.addText('Three arms', { x: M + 10.5, y: dy + 0.0, w: 1.5, h: 0.3, margin: 0, fontFace: HEAD, fontSize: 13, bold: true, color: TEAL_DK });
  s.addText([
    { text: 'same IP, known port', options: { bullet: true, breakLine: true } },
    { text: 'same IP, new port', options: { bullet: true, breakLine: true } },
    { text: 'new IP entirely', options: { bullet: true } },
  ], { x: M + 10.5, y: dy + 0.36, w: 1.5, h: 1.2, margin: 0, fontFace: BODY, fontSize: 10.5, color: '3E4C57', paraSpaceAfter: 4 });
  s.addText('→ EIF / ADF / APDF', { x: M + 10.5, y: dy + 1.6, w: 1.5, h: 0.3, margin: 0, fontFace: BODY, fontSize: 10.5, italic: true, color: TEAL_DK });

  s.addText([
    { text: 'The trap: ', options: { bold: true, color: AMBER } },
    { text: 'witnesses are exactly the peers you already send to — ANNOUNCE every 10 s, ten punch datagrams per attempt. A dial-back from an endpoint you contacted traverses a hole ', options: { color: '3E4C57' } },
    { text: 'you', options: { color: '3E4C57', italic: true } },
    { text: ' opened, and reports every NAT as far more permissive than it is. The send-history guard is not optional.', options: { color: '3E4C57' } },
  ], { x: M, y: 6.15, w: CW, h: 0.75, margin: 0, fontFace: BODY, fontSize: 13, lineSpacingMultiple: 1.08 });

  s.addNotes('The contamination guard is the single most important design point in the project. Without it the field results are wrong in a direction that looks like good news.');
}

// ============================================================ 8. CORRECTIONS
{
  const s = p.addSlide();
  titleBar(s, 'Two things the first write-up got wrong', 'Framing', false);

  const cols = [
    ['There is no libp2p in this stack',
     'The IP transport is grassroots_dart_udx 2.1.0, a fork of dart_udx, with its own signaling and its own hole-punch path.',
     'Building the probe on dart_libp2p would open a second socket — a different NAT mapping, measuring a different thing, and producing a decision rule for a transport we do not ship.',
     'Build inside grassroots_networking, probing from the transport’s own socket.'],
    ['autoNAT is not a NAT classifier',
     'v1 answers “am I publicly reachable”. v2 answers “is this address dialable”, per address, with a nonce’d dial-back. Neither emits a mapping or filtering label.',
     '“Accuracy versus autoNAT” compares two things with no shared measurand.',
     'Head-to-head is reachability-only; classification ground truth is an RFC 5780 oracle we stand up ourselves.'],
  ];
  cols.forEach(([h, what, why, fix], i) => {
    const x = M + i * (CW / 2 + 0.1), w = CW / 2 - 0.1;
    card(s, { x, y: 2.05, w, h: 4.2 });
    s.addText(h, {
      x: x + 0.4, y: 2.35, w: w - 0.8, h: 0.7, margin: 0,
      fontFace: HEAD, fontSize: 20, bold: true, color: INK,
    });
    s.addText(what, {
      x: x + 0.4, y: 3.12, w: w - 0.8, h: 0.9, margin: 0,
      fontFace: BODY, fontSize: 13, color: '3E4C57', lineSpacingMultiple: 1.1,
    });
    s.addText(why, {
      x: x + 0.4, y: 4.1, w: w - 0.8, h: 0.95, margin: 0,
      fontFace: BODY, fontSize: 13, color: AMBER, lineSpacingMultiple: 1.1,
    });
    s.addShape(p.ShapeType.roundRect, {
      x: x + 0.4, y: 5.2, w: w - 0.8, h: 0.8, rectRadius: 0.05,
      fill: { color: 'E7F1F1' }, line: { color: 'E7F1F1', width: 0 },
    });
    s.addText(fix, {
      x: x + 0.6, y: 5.32, w: w - 1.2, h: 0.6, margin: 0,
      fontFace: BODY, fontSize: 12.5, bold: true, color: TEAL_DK, lineSpacingMultiple: 1.05,
    });
  });

  s.addText('Neither correction shrinks the project. Both make it a study of our own system rather than of someone else’s.', {
    x: M, y: 6.5, w: CW, h: 0.4, margin: 0,
    fontFace: BODY, fontSize: 14.5, italic: true, color: TEAL_DK,
  });
  s.addNotes('Say plainly that revision 1 was written before anyone read the transport source. That is fine — it is why we read it.');
}

// ============================================================ 9. RESEARCH QUESTIONS
{
  const s = p.addSlide();
  titleBar(s, 'What we are actually asking', 'Research questions', false);

  const rqs = [
    ['Can social-graph witnesses replace designated servers?', 'Specify and validate a witness-based algorithm that recovers mapping and filtering behaviour, and measure its agreement with an RFC 5780 oracle.'],
    ['What does decentralization cost?', 'False-negative rate and time-to-verdict against witness count k and byzantine fraction f, with lying witnesses we operate. And the constraint that probably dominates: P(≥k witnesses online and dialable).'],
    ['What is the NAT reality for a population like ours?', 'Characterize each stratum on our own handsets — carrier and APN for cellular, ISP and CGNAT status for residential — then weight by published subscriber counts and per-AS end-user estimates. Cellular and residential reported apart, as an assumption bound, never a confidence interval.'],
    ['What should the transport do at dial time?', 'An empirical decision rule — direct, anchor-mediated, or give up — over the inputs the transport actually holds when it must decide.'],
  ];
  rqs.forEach(([h, b], i) => {
    const y = 1.95 + i * 1.15;
    numDot(s, { x: M + 0.05, y: y + 0.12, n: i + 1 });
    s.addText(h, {
      x: M + 0.72, y, w: CW - 0.9, h: 0.38, margin: 0,
      fontFace: HEAD, fontSize: 17.5, bold: true, color: INK,
    });
    s.addText(b, {
      x: M + 0.72, y: y + 0.4, w: CW - 1.0, h: 0.6, margin: 0,
      fontFace: BODY, fontSize: 13, color: '4A5A66', lineSpacingMultiple: 1.08,
    });
  });

  card(s, { x: M, y: 6.4, w: CW, h: 0.72, fill: 'E7F1F1' });
  s.addText([
    { text: 'Measure a tuple, not a “NAT type”:  ', options: { bold: true, color: TEAL_DK } },
    { text: 'mapping behaviour × filtering behaviour × port preservation × mapping lifetime, plus CGNAT-suspected and IPv6 availability. Any single label is a derived column, marked as such.', options: { color: '3E4C57' } },
  ], { x: M + 0.35, y: 6.55, w: CW - 0.7, h: 0.45, margin: 0, fontFace: BODY, fontSize: 12.5, lineSpacingMultiple: 1.05 });

  s.addNotes('RQ2 is the one with a real chance of a surprising answer: witness availability may dominate everything else, and that finding is more useful to us than the accuracy curve.');
}

// ============================================================ 10. MILESTONES
{
  const s = p.addSlide();
  titleBar(s, 'Six months, with exit criteria', 'Milestones', false);

  const ms = [
    ['1', 'Scope + strata', 'Measurand in RFC 4787/5780 terms, threat model, aggregation rule, stratum design and testbed inventory', 'Design doc with the test-to-witness-topology table; strata defined, weight sources named, kit list costed'],
    ['2', 'Oracle + bench', 'RFC 5780 server on two IPs × two ports; netfilter and CPE bench, with address-dependent mapping built deliberately — no netfilter flag produces it', 'One command, ≥8 configs, all three mapping classes present, ≥95% agreement with construction labels'],
    ['3', 'Detection v1', 'Nonce’d dial-back, relayed filtering test, contamination guard, anti-amplification defences', '≥90% agreement with the oracle on the bench; three adversarial properties proven in tests'],
    ['4', 'Baselines', 'autoNAT v1/v2 sidecar; back-to-back harness; sweep k against byzantine fraction f', 'One CSV row per device/network/epoch with all four verdicts, latency, bytes, battery'],
    ['5', 'Testbed campaign', 'Every stratum: ≥2 SIMs × ≥2 handset stacks per carrier, screen on/off, roaming triggered deliberately', 'Every stratum characterized with its homogeneity check; disagreement splits a stratum; unreached strata listed with their weight'],
    ['6', 'Prevalence + rule', 'Weight strata into prevalence with the four-arm sensitivity analysis; fit the transport rule; measure address exposure; write', 'Prevalence with weight table, denominator and date; dominant envelope named; predicate table validated on a held-out split'],
  ];
  const rowH = 0.7;
  ms.forEach(([n, title, work, exit], i) => {
    const y = 1.95 + i * rowH;
    if (i % 2 === 0) card(s, { x: M, y: y - 0.04, w: CW, h: rowH - 0.02, fill: 'F6F9F9' });
    numDot(s, { x: M + 0.16, y: y + 0.1, n });
    s.addText(title, {
      x: M + 0.75, y: y + 0.02, w: 1.85, h: 0.55, margin: 0,
      fontFace: HEAD, fontSize: 13.5, bold: true, color: INK, valign: 'middle',
    });
    s.addText(work, {
      x: M + 2.65, y: y + 0.02, w: 4.55, h: 0.58, margin: 0,
      fontFace: BODY, fontSize: 11, color: '4A5A66', valign: 'middle', lineSpacingMultiple: 1.0,
    });
    s.addText(exit, {
      x: M + 7.35, y: y + 0.02, w: 4.75, h: 0.58, margin: 0,
      fontFace: BODY, fontSize: 11, color: TEAL_DK, valign: 'middle', lineSpacingMultiple: 1.0, italic: true,
    });
  });
  s.addText('EXIT CRITERION', {
    x: M + 7.35, y: 1.62, w: 4.75, h: 0.26, margin: 0,
    fontFace: BODY, fontSize: 9.5, bold: true, charSpacing: 1.5, color: MUTED,
  });
  s.addText('WORK', {
    x: M + 2.65, y: 1.62, w: 4.55, h: 0.26, margin: 0,
    fontFace: BODY, fontSize: 9.5, bold: true, charSpacing: 1.5, color: MUTED,
  });

  s.addText('Start the IP allocation and firewall work in week 1 — that is latency you cannot absorb in month 2.', {
    x: M, y: 6.35, w: CW, h: 0.4, margin: 0,
    fontFace: BODY, fontSize: 13.5, italic: true, color: AMBER,
  });
  s.addNotes('Primary claim is the algorithm. Broader testbed coverage — more carriers, more countries via travelling handsets — is explicitly if-time-permits; six months does not hold both. Each added SIM is another stratum cell, not more generality.');
}

// ============================================================ 11. CLOSING (dark)
{
  const s = p.addSlide();
  s.background = { color: INK };
  titleBar(s, 'Decisions to lock before starting', 'Open questions', true);

  const qs = [
    ['Stack', 'Confirm dart_libp2p is rejected and the probe lives on the transport’s own socket.'],
    ['Baseline shape', 'go-libp2p sidecar (high fidelity, Android-only) or same-socket reimplementation?'],
    ['Primary claim', 'The algorithm or the measurement? Both cannot be first-class in six months.'],
    ['Oracle hosting', 'Who provisions the dual-homed server — and can it come from the /96 already reserved?'],
    ['Anchor IPv4', 'The data-plane rule is IPv6-only, excluding exactly the CGNAT population we target.'],
    ['Testbed budget', 'How many handsets and SIMs, and which carriers? Each SIM buys one (carrier, APN, plan) cell — two per carrier before homogeneity is checked rather than assumed.'],
  ];
  qs.forEach(([h, b], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (CW / 2 + 0.1), y = 2.05 + row * 1.2;
    const w = CW / 2 - 0.15;
    s.addText(h, {
      x, y, w, h: 0.32, margin: 0,
      fontFace: HEAD, fontSize: 16, bold: true, color: TEAL,
    });
    s.addText(b, {
      x, y: y + 0.34, w, h: 0.65, margin: 0,
      fontFace: BODY, fontSize: 12.5, color: 'B7C4CC', lineSpacingMultiple: 1.08,
    });
  });

  card(s, { x: M, y: 5.75, w: CW, h: 1.0, fill: INK_SOFT });
  s.addText([
    { text: 'Also independent of this project: ', options: { bold: true, color: 'E9A876' } },
    { text: 'the punch target from PUNCH_INITIATE is never checked for global routability, the mediator’s pending map has no TTL, and the stream framer trusts an unbounded 32-bit length. Someone’s backlog needs these.', options: { color: 'B7C4CC' } },
  ], { x: M + 0.4, y: 5.98, w: CW - 0.8, h: 0.6, margin: 0, fontFace: BODY, fontSize: 12.5, lineSpacingMultiple: 1.08 });

  s.addNotes('Close on the fact that the audit turned up three production defects on the way. The project pays for itself before it starts.');
}

p.writeFile({ fileName: 'grassroots-nat-project.pptx' }).then((f) => console.log('wrote', f));

// Eight-slide talk deck for the NAT student project.
// Build:  NODE_PATH=<dir with pptxgenjs> node build-deck.js
// Density rule for this deck: at most four body lines per slide, at most
// twelve words per line. The detail lives in
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
p.title = 'NAT Topology and Hole-Punching Survey';

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
  s.addText('NAT Topology and Hole-Punching Survey', {
    x: M, y: 2.8, w: 8.4, h: 1.8, margin: 0,
    fontFace: HEAD, fontSize: 44, bold: true, color: WHITE, lineSpacingMultiple: 0.95,
  });
  s.addText('Grassroots approach to classifying NATs', {
    x: M, y: 4.75, w: 8.4, h: 0.4, margin: 0, fontFace: BODY, fontSize: 16, color: 'B7C4CC',
  });
  s.addText([
    { text: 'Dan Bachar', options: { bold: true, color: WHITE } },
    { text: '   ·   dan.bachar@campus.technion.ac.il', options: { color: MUTED } },
  ], { x: M, y: 6.4, w: 8.4, h: 0.35, margin: 0, fontFace: BODY, fontSize: 13 });

}

// ============================================================ 2 · current path
{
  const s = p.addSlide();
  title(s, 'Well-connected devices', 'Who can facilitate', false);

  const steps = ['Register address with a well-connected friend', 'Ask it for the other peer\u2019s address', 'It tells both sides to punch at once', 'The peers talk directly'];
  const cw = 2.65, gap = 0.4;
  steps.forEach((t, i) => {
    const x = M + i * (cw + gap);
    card(s, { x, y: 2.35, w: cw, h: 1.1 });
    s.addText(t, {
      x: x + 0.12, y: 2.35, w: cw - 0.24, h: 1.1, margin: 0,
      fontFace: HEAD, fontSize: 14, bold: true, color: INK, align: 'center', valign: 'middle',
    });
    if (i < steps.length - 1) {
      s.addText('→', {
        x: x + cw, y: 2.35, w: gap, h: 1.1, margin: 0,
        fontFace: BODY, fontSize: 16, bold: true, color: MUTED, align: 'center', valign: 'middle',
      });
    }
  });

  lines(s, [
    'Well-connected: has a public address, so anyone can reach it.',
    'It facilitates between mutual friends by passing on addresses, as well as coordinating punching.',
    'Today simple private address regex decides who qualifies: we replace it with an algorithmic test.',
  ], { y: 4.3, size: 17 });

}

// ============================================================ 3 · NAT behavior
{
  const s = p.addSlide();
  title(s, 'NAT behavior', 'What we must distinguish', false);

  const colX = [M, M + 2.75, M + 4.45, M + 7.7, M + 9.8];
  const colW = [2.6, 1.55, 3.05, 1.95, CW - 9.8];
  ['Behavior', 'Example', 'Effect on hole punching', 'AutoNAT', 'Reachability'].forEach((h, i) => {
    s.addText(h.toUpperCase(), {
      x: colX[i], y: 2.15, w: colW[i], h: 0.3, margin: 0,
      fontFace: BODY, fontSize: 10, bold: true, charSpacing: 1.5, color: MUTED,
    });
  });

  const rows = [
    ['Endpoint-independent', 'formerly: cone', 'home routers', 'One external port for every destination. Punching works.', 'EndpointIndependent', 'Public if filtering is open, else Private', TEAL],
    ['Address-dependent', 'formerly: no name', 'enterprise NATs', 'A new port per destination address. Both sides must punch.', 'EndpointDependent', 'Private', TEAL],
    ['Address-and-port-dependent', 'formerly: symmetric', 'mobile carriers', 'A new port per endpoint. Punching fails without prediction.', 'EndpointDependent', 'Private', AMBER],
    ['Carrier-grade NAT', '', 'mobile carriers', 'Sits on top of the others. Nothing unsolicited gets in.', 'no name', 'Private', AMBER],
  ];
  rows.forEach(([b, old, ex, eff, an, reach, color], i) => {
    const y = 2.55 + i * 0.8;
    if (i % 2 === 0) card(s, { x: M - 0.15, y: y - 0.05, w: CW + 0.3, h: 0.74, fill: 'F6F9F9' });
    s.addText([
      { text: b, options: { fontFace: HEAD, fontSize: 13, bold: true, color, breakLine: !!old } },
      ...(old ? [{ text: old, options: { fontFace: BODY, fontSize: 11, italic: true, color: MUTED } }] : []),
    ], { x: colX[0], y, w: colW[0], h: 0.64, margin: 0, valign: 'middle' });
    s.addText(ex, {
      x: colX[1], y, w: colW[1], h: 0.64, margin: 0,
      fontFace: BODY, fontSize: 12, italic: true, color: MUTED, valign: 'middle',
    });
    s.addText(eff, {
      x: colX[2], y, w: colW[2], h: 0.64, margin: 0,
      fontFace: BODY, fontSize: 12, color: '3E4C57', valign: 'middle',
    });
    s.addText(an, {
      x: colX[3], y, w: colW[3], h: 0.64, margin: 0,
      fontFace: 'Courier New', fontSize: 11, bold: true, color: INK, valign: 'middle',
    });
    s.addText(reach, {
      x: colX[4], y, w: colW[4], h: 0.64, margin: 0,
      fontFace: BODY, fontSize: 12, bold: true, color: INK, valign: 'middle',
    });
  });

  s.addText([
    'We measure four properties: ',
    '1. Mapping: which external port the NAT assigns. ',
    '2. Filtering: which senders it lets in. ',
    '3. Port preservation: whether it keeps our own port.',
    '4. Lifetime: how long it keeps an idle mapping. ',
    'AutoNAT also reports reachability (Public, Private or Unknown)',
  ].map((t, k, arr) => ({ text: t, options: { breakLine: k < arr.length - 1 } })), {
    x: M, y: 5.85, w: CW, h: 1.3, margin: 0, fontFace: BODY, fontSize: 12, italic: true, color: TEAL_DK, valign: 'top',
  });

}

// ============================================================ 4 · self-classification (dark emphasis)
{
  const s = p.addSlide();
  s.background = { color: INK };
  title(s, 'Self-classification', 'An address range test', true);

  card(s, { x: M, y: 2.3, w: 5.6, h: 1.5, fill: INK_SOFT });
  s.addText('not 10.* | 192.168.* | ...', {
    x: M + 0.4, y: 2.55, w: 4.8, h: 0.45, margin: 0,
    fontFace: 'Courier New', fontSize: 14, bold: true, color: WHITE,
  });
  s.addText('Well-connected if the advertised address is in none of the private or reserved ranges.', {
    x: M + 0.4, y: 3.05, w: 4.8, h: 0.6, margin: 0, fontFace: BODY, fontSize: 13, color: '93A4AE', valign: 'top',
  });

  card(s, { x: M + 6.0, y: 2.3, w: 5.8, h: 1.5, fill: '3A2A22' });
  s.addText('A phone behind carrier NAT passes it', {
    x: M + 6.4, y: 2.55, w: 5.0, h: 0.35, margin: 0,
    fontFace: HEAD, fontSize: 17, bold: true, color: 'E9A876',
  });
  s.addText('It advertises the carrier\u2019s public address, so it looks reachable.', {
    x: M + 6.4, y: 3.0, w: 5.0, h: 0.4, margin: 0, fontFace: BODY, fontSize: 13, color: 'D8C3B4',
  });

  lines(s, [
    'Hole punching is skipped despite CGNAT not allowing unsolicited incoming requests.',
    'Peer is considered well-connected, although nobody can reach it.',
    'A public address does not mean peer can be reached.',
  ], { y: 4.5, size: 17, dark: true, dot: AMBER });

}

// ============================================================ 5 · the idea
{
  const s = p.addSlide();
  title(s, 'Witness-based detection', 'The algorithm', false);

  // Left: the algorithm, five numbered steps. Right: the probe and the three
  // friends it uses. A friend has one UDP link to the probe, so one source
  // address and one port. A and B are linked (teal); C is not (amber).
  const steps = [
    'Pick A, a well-connected friend we have a link to; B, a linked friend; C, a friend of A with no link to us.',
    'A and B report the address and port they see us at.',
    'Ask A to start a punch between us and C. A gives C our address as A saw it. We send nothing.',
    'C\u2019s punch packets, carrying its key, arrive: anyone can reach us. Not after retries: filtering is endpoint-dependent.',
    'A and B saw one port: mapping is endpoint-independent. Two ports: endpoint-dependent.',
  ];
  const sw = 7.4;
  steps.forEach((t, i) => {
    const y = 2.3 + i * 0.92;
    s.addShape(p.ShapeType.ellipse, {
      x: M, y: y + 0.08, w: 0.42, h: 0.42,
      fill: { color: i < 3 ? TEAL : AMBER }, line: { color: i < 3 ? TEAL : AMBER, width: 0 },
    });
    s.addText(String(i + 1), {
      x: M, y: y + 0.08, w: 0.42, h: 0.42, margin: 0,
      fontFace: HEAD, fontSize: 14, bold: true, color: WHITE, align: 'center', valign: 'middle',
    });
    s.addText(t, {
      x: M + 0.65, y, w: sw - 0.65, h: 0.6, margin: 0,
      fontFace: BODY, fontSize: 16, color: '3E4C57', valign: 'middle',
    });
  });

  const fx = M + 8.3, fw = CW - 8.3;
  const node = (y, h, name, sub, color) => {
    s.addShape(p.ShapeType.roundRect, {
      x: fx, y, w: fw, h, rectRadius: 0.06,
      fill: { color: PANEL }, line: { color, width: 1.3 },
    });
    s.addText(name, { x: fx + 0.15, y: y + 0.12, w: fw - 0.3, h: 0.32, margin: 0, fontFace: HEAD, fontSize: 15, bold: true, color: INK });
    s.addText(sub, { x: fx + 0.15, y: y + 0.46, w: fw - 0.3, h: 0.3, margin: 0, fontFace: BODY, fontSize: 11.5, color });
  };
  node(2.3, 0.9, 'Probe', 'the phone under test', INK_SOFT);
  node(3.45, 0.9, 'Friend A', 'linked, well-connected; reports, signals', TEAL);
  node(4.6, 0.9, 'Friend B', 'linked, another address; reports', TEAL);
  node(5.75, 0.9, 'Friend C', 'no link; punches toward us', AMBER);

}

// ============================================================ 6 · the algorithm
{
  const s = p.addSlide();
  title(s, 'The procedure', 'Two rounds', false);

  const half = (x, w, head, sub, rows, color) => {
    s.addText(head, { x, y: 2.15, w, h: 0.35, margin: 0, fontFace: HEAD, fontSize: 19, bold: true, color: INK });
    s.addText(sub, { x, y: 2.52, w, h: 0.3, margin: 0, fontFace: BODY, fontSize: 12.5, italic: true, color: MUTED });
    rows.forEach(([obs, label], i) => {
      const y = 3.05 + i * 0.92;
      if (i % 2 === 0) card(s, { x: x - 0.15, y: y - 0.08, w: w + 0.3, h: 0.86, fill: 'F6F9F9' });
      s.addText(obs, {
        x, y, w: w * 0.56, h: 0.7, margin: 0,
        fontFace: BODY, fontSize: 13, color: '3E4C57', valign: 'middle',
      });
      s.addText(label, {
        x: x + w * 0.58, y, w: w * 0.42, h: 0.7, margin: 0,
        fontFace: HEAD, fontSize: 13, bold: true, color, valign: 'middle',
      });
    });
  };

  half(M + 6.3, 5.5, 'Dial back', 'filtering: A tells C to punch toward us; we send nothing', [
    ['C\u2019s packets arrive: anyone can reach us', 'endpoint-independent'],
    ['They do not, after retries via more friends', 'endpoint-dependent'],
    ['A\u2019s packet always arrives; it proves only the link', 'no verdict'],
  ], AMBER);

  half(M, 5.5, 'Reflect', 'mapping: A and B report the port they saw us at', [
    ['Both saw the same port', 'endpoint-independent'],
    ['They saw different ports', 'endpoint-dependent'],
    ['Address- or port-dependent? One source per friend cannot tell', 'oracle only'],
  ], TEAL);

  s.addText('Friends separate independent from dependent, the split autoNAT reports. The finer split needs the oracle.', {
    x: M, y: 6.2, w: CW, h: 0.6, margin: 0, fontFace: BODY, fontSize: 14.5, italic: true, color: TEAL_DK, valign: 'top',
  });

}

// ============================================================ 7 · validity threats
{
  const s = p.addSlide();
  title(s, 'Two things that mislead', 'A false yes and a false no', false);

  card(s, { x: M, y: 2.3, w: 5.7, h: 2.9 });
  s.addShape(p.ShapeType.ellipse, { x: M + 0.4, y: 2.6, w: 0.4, h: 0.4, fill: { color: AMBER }, line: { color: AMBER, width: 0 } });
  s.addText('False yes: contamination', { x: M + 0.4, y: 3.15, w: 4.9, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 20, bold: true, color: INK });
  lines(s, [
    'If we ever sent to C, our packets opened the hole.',
    'The normal punch sends from both sides. We send nothing.',
    'Guard: log where we sent; ignore punches from there.',
  ], { x: M + 0.4, w: 4.9, y: 3.65, size: 13.5, step: 0.42, dot: AMBER });

  card(s, { x: M + 6.1, y: 2.3, w: 5.7, h: 2.9 });
  s.addShape(p.ShapeType.ellipse, { x: M + 6.5, y: 2.6, w: 0.4, h: 0.4, fill: { color: TEAL }, line: { color: TEAL, width: 0 } });
  s.addText('False no: loss', { x: M + 6.5, y: 3.15, w: 4.9, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 20, bold: true, color: INK });
  lines(s, [
    'Arrival is proof. Absence is not: the packet may be lost.',
    'Or C was offline, or A did not pass the request on.',
    'Retry, then ask A for another C, before recording no.',
  ], { x: M + 6.5, w: 4.9, y: 3.65, size: 13.5, step: 0.42 });


}

// ============================================================ 8 · testbed and hosting
{
  const s = p.addSlide();
  title(s, 'Testbed and hosting', 'What we measure, and from where', false);

  card(s, { x: M, y: 2.3, w: 5.7, h: 3.0 });
  s.addText('What we measure', { x: M + 0.4, y: 2.6, w: 4.9, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 19, bold: true, color: INK });
  lines(s, [
    'Our own smartphones, on carrier and home paths.',
    'A group: one carrier, one kind of plan.',
    'Two SIMs and Android plus iOS per carrier.',
  ], { x: M + 0.4, w: 4.9, y: 3.2, size: 13.5, step: 0.52 });

  card(s, { x: M + 6.1, y: 2.3, w: 5.7, h: 3.0 });
  s.addText('What the institution hosts', { x: M + 6.5, y: 2.6, w: 4.9, h: 0.4, margin: 0, fontFace: HEAD, fontSize: 19, bold: true, color: INK });
  lines(s, [
    'Oracle: a reference NAT-test server.',
    'Witnesses: small hosts, different networks.',
    'Bench: fake NATs built on one Linux machine.',
  ], { x: M + 6.5, w: 4.9, y: 3.2, size: 13.5, step: 0.52, dot: AMBER });


}

// pptxgenjs writes an empty notes page per slide and a notes master. Strip them.
const fs = require('fs');
const JSZip = require('jszip');
p.writeFile({ fileName: 'grassroots-nat-project.pptx' }).then(async (f) => {
  const zip = await JSZip.loadAsync(fs.readFileSync(f));
  Object.keys(zip.files).filter((n) => /^ppt\/notes(Slides|Masters)\//.test(n)).forEach((n) => zip.remove(n));
  const edit = async (n, fn) => zip.file(n, fn(await zip.file(n).async('string')));
  await edit('[Content_Types].xml', (x) => x.replace(/<Override[^>]*PartName="\/ppt\/notes(Slides|Masters)\/[^>]*\/>/g, ''));
  await edit('ppt/presentation.xml', (x) => x.replace(/<p:notesMasterIdLst>.*?<\/p:notesMasterIdLst>/s, ''));
  await edit('ppt/_rels/presentation.xml.rels', (x) => x.replace(/<Relationship [^>]*notesMaster[^>]*\/>/g, ''));
  for (const n of Object.keys(zip.files).filter((n) => /^ppt\/slides\/_rels\/.*\.rels$/.test(n))) {
    await edit(n, (x) => x.replace(/<Relationship [^>]*notesSlide[^>]*\/>/g, ''));
  }
  fs.writeFileSync(f, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('wrote', f);
});

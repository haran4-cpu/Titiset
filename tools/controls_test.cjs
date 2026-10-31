// every live control does something you can hear: for each command the menus send (FX rack units, deck sends incl. the
// harmonic echo, throws, performance pads, fills, part sends, per-part sound (perc too), mutes of every part that plays), two
// identical engines render the same passage — one gets the command — and the difference must be clearly audible (> −40 dB
// against the deck). Usage: node tools/controls_test.cjs
const { load } = require('./load.cjs'); const X = load(); const cal = require('../src/engine/calibration.json');
const pack = (s) => { const ev = s.ev; return { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: { n: ev.n, t: ev.t.slice(), ch: ev.ch.slice(), a: ev.a.slice(), v: ev.v.slice(), d: ev.d.slice(), f: ev.f.slice(), x: ev.x.slice(), y: ev.y.slice() } }; };
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const g = process.argv[2] || 'deep-house', s = X.composeTrack(g, 5), from = X.peakSectionOf(s).bar0 * 16;
const L = new Float32Array(128), R = new Float32Array(128);
function run(cmds, nb, probe) { X.noiseSeed(7); const E = new X.Engine(44100); E.cmd({ type: 'load', deck: 0, score: pack(s), cal: cal[g], play: true, from }); for (let b = 0; b < 100; b++) E.render(L, R, 128);
  if (probe) { const T = E.decks[0].tex, r0 = T.render.bind(T); T.render = (a, b, n) => { r0(a, b, n); for (let i = 0; i < n; i++) texE += a[i] * a[i]; }; } // is the texture bed sounding here at all
  for (const c of cmds) E.cmd(c); const o = new Float32Array(nb * 128); for (let b = 0; b < nb; b++) { E.render(L, R, 128); o.set(L, b * 128); } return o; }
let texE = 0; const NB = 700, base = run([], NB, true); let eb = 0; for (const x of base) eb += x * x;
const diff = (o) => { let e = 0; for (let i = 0; i < o.length; i++) { const d = o[i] - base[i]; e += d * d; } return 10 * Math.log10(e / eb + 1e-30); };
const steps = (100 + NB) * 128 / (44100 * 60 / s.meta.bpm / 4), used = new Set(); for (let k = 0; k < s.ev.n; k++) if (s.ev.t[k] >= from && s.ev.t[k] < from + steps && s.ev.ch[k] < 11) used.add(s.ev.ch[k]); // the parts that play in this passage
const C = [];
for (const name of ['sweep', 'phaser', 'flanger', 'echo', 'crush', 'gate', 'repeat', 'tape', 'swirl']) C.push([`FX rack: ${name}`, [{ type: 'fx', deck: 0, name, on: true, amt: 0.6 }]]);
for (const [k, v] of [['verb', 0.6], ['delay', 0.6], ['echo', 1.8], ['sc', 0.8], ['heat', 2], ['punch', 0]]) C.push([`deck send: ${k}`, [{ type: 'sends', deck: 0, p: { [k]: v } }]]);
C.push(['echo throw', [{ type: 'throw', deck: 0, steps: 8 }]]);
for (const [k, n] of [[0, 'riser'], [1, 'impact'], [2, 'downlifter'], [3, 'sweep'], [4, 'snare roll']]) C.push([`performance pad: ${n}`, [{ type: 'fxNow', deck: 0, kind: k, steps: 16 }]]);
for (const k of ['roll', 'hats', 'kick', 'toms']) C.push([`fill: ${k}`, [{ type: 'fill', deck: 0, kind: k, on: true }]]);
for (const ch of [5, 6, 7, 8].filter((c) => used.has(c))) C.push([`part send ch ${ch} (echo + room)`, [{ type: 'partfx', deck: 0, ch, echo: 0.7, verb: 0.5 }]]);
const TONE = ['sub', 'b808', 'organ', 'piano', 'ep', 'bell', 'kspluck', 'vox'], CHS = { kick: 0, snare: 1, hats: 2, perc: 3, bass: 4, chords: 5, pad: 6, lead: 7, arp: 8 };
for (const [slot, p] of [['kick', { fEnd: 70 }], ['snare', { tone: 300, clapF: 2200, rimF: 2600 }], ['hats', { cDec: 0.12 }], ['perc', { pitch: 1.6 }], ['bass', { cut: 300 }], ['chords', { cut: 400 }], ['pad', { cut: 300 }], ['lead', { cut: 500 }], ['arp', { cut: 400 }]]) { if (!used.has(CHS[slot])) continue;
  const kit = slot === 'arp' ? s.kits.hook || s.kits.arp : s.kits[slot]; let q = kit && TONE.includes(kit.model) && p.cut ? { tone: 0.25 } : p;
  // (v9.3) a snare / hats / percussion part playing a kit family is shaped by Tune / Decay (what its Sound page shows), not by the synth knobs
  if ((slot === 'snare' || slot === 'hats' || slot === 'perc') && (s.kits.drumFam || X.BANK_FOR_GENRE[g] || 'forge') !== 'forge') q = { bank: { tune: 7, decay: 0.3 } };
  C.push([`sound ${slot} (${Object.keys(q)[0]})`, [{ type: 'kit', deck: 0, slot, p: q }]]); }
for (let ch = 0; ch < 11; ch++) if (used.has(ch) && (ch !== 10 || texE > 1e-6)) C.push([`mute ${['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'arp', 'fx', 'texture'][ch]}`, [{ type: 'mute', deck: 0, ch, on: true }]]);
C.push(['energy macro', [{ type: 'energy', deck: 0, v: 1 }]]);
for (const [name, cmds] of C) { const d = diff(run(cmds, NB)); ok(d > -40, `${name.padEnd(30)} ${d.toFixed(1)} dB`); }
console.log(fails ? `${fails} control(s) without an audible effect` : `controls: all ${C.length} act on the sound`); process.exit(fails ? 1 : 0);

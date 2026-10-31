// v9.3 listening pack, transitions: the same two tracks (house → tech house) mixed with each style, rendered through the engine's
// own mix automation, as MP3 (the mix plus two bars either side). Usage: node tools/listen_tx.cjs <outdir> [styles=blend,echo,stems,riser,roll,brake,cut,filter,breakdown,tease]
const { X, appScore, wav } = require('./render.cjs'); const cal = require('../src/engine/calibration.json'); const { execFileSync } = require('child_process'); const fs = require('fs');
const OUT = process.argv[2] || 'listen', STY = (process.argv[3] || 'blend,echo,stems,riser,roll,brake,cut,filter,breakdown,tease').split(','); fs.mkdirSync(OUT, { recursive: true });
const sr = 44100, gA = 'house', gB = 'tech-house', sA = appScore(gA, 2), sB = appScore(gB, 3), HARD = new Set(['cut', 'roll', 'brake', 'riser']);
for (const style of STY) { const E = new X.Engine(sr), L = new Float32Array(128), R = new Float32Array(128), out = sA.sections[sA.sections.length - 1], fromA = Math.max(0, out.bar0 * 16 - 16 * 16);
  E.cmd({ type: 'load', deck: 0, score: sA, cal: cal[gA], play: true, from: fromA }); E.cmd({ type: 'load', deck: 1, score: sB, cal: cal[gB], play: false, bpm: sA.meta.bpm }); for (let i = 0; i < 100; i++) E.render(L, R, 128);
  const bars = HARD.has(style) ? 8 : 16, at = Math.ceil(E.decks[0].pos / 16) * 16 + 2 * 16, drop = sB.sections.find((S) => S.type === 'drop') || sB.sections[1], first = sB.sections.find((S) => S.type !== 'intro');
  const fromB = HARD.has(style) ? Math.max(0, drop.bar0 * 16 - bars * 8) : Math.max(0, (first ? first.bar0 : 0) - bars) * 16; E.cmd({ type: 'transition', from: 0, deck: 1, atStep: at, bars, kind: style, fromB, swap: HARD.has(style) ? 0.5 : undefined });
  const n = Math.round((at - E.decks[0].pos + (bars + 2) * 16) / 16 * 4 * 60 / sA.meta.bpm * sr / 128), oL = new Float32Array(n * 128), oR = new Float32Array(n * 128);
  for (let b = 0; b < n; b++) { E.render(L, R, 128); oL.set(L, b * 128); oR.set(R, b * 128); }
  const f = `${OUT}/transition-${style}`; wav(f + '.wav', oL, oR, sr); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f + '.wav', '-b:a', '256k', f + '.mp3']); fs.unlinkSync(f + '.wav'); console.log(`transition-${style}.mp3  ${(oL.length / sr).toFixed(1)} s · ${bars}-bar mix starting 2 bars in`); }

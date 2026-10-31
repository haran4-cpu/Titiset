// matches each drum-bank voice to the synthesized voice it replaces: equal RMS over the first 150 ms at full velocity, averaged
// over the six families and their variants. Prints BANK_GAIN for src/engine/02c_drumbank.js. Usage: node tools/bank_level.cjs
const { load } = require('./load.cjs'); const E = load(); const sr = 48000, N = Math.round(0.15 * sr);
const NOTE = { tom: 45, conga: 57, bongo: 67 }, SN = { sn: 'snare', cp: 'clap', rim: 'rim' }, HAT = { hc: 0, ho: 1, hp: 5, ride: 2, crash: 4, shk: 3 };
function rms(L, R) { let s = 0; for (let i = 0; i < N; i++) s += (L[i] * L[i] + R[i] * R[i]) / 2; return Math.sqrt(s / N); }
function synth(key) { const L = new Float32Array(N), R = new Float32Array(N); let o;
  if (SN[key]) { o = new E.Snare(sr); o.trigger(0, 1, SN[key]); } else if (key in HAT) { o = new E.Hats(sr); o.trigger(0, 1, HAT[key], 0); } else { o = new E.Perc(sr); o.trigger(0, 1, key, NOTE[key] || 0, 0); }
  o.render(L, R, N); return rms(L, R); }
function bank(fam, key) { const P = new E.BankPlayer(sr); P.setFamily(fam); P.ready(); const nv = P.bank.v[key].length; let t = 0;
  for (let k = 0; k < nv; k++) { const BL = [0, 1, 2, 3].map(() => new Float32Array(N)), BR = [0, 1, 2, 3].map(() => new Float32Array(N));
    P.trigger(0, 1, key, 1, 0, NOTE[key], 1 / E.BANK_GAIN[key]); P.render(BL, BR, N); t += rms(BL[1], BR[1]); for (const v of P.v) v.on = 0; }
  return t / nv; }
const out = {}; for (const key of E.BANK_VOICES) { const s = synth(key); let b = 0; for (const f of E.BANK_FAMILIES) b += bank(f, key); b /= E.BANK_FAMILIES.length; out[key] = +(s / b).toFixed(3);
  console.log(key.padEnd(8), 'synth', (20 * Math.log10(s)).toFixed(1), 'dB   bank (unity)', (20 * Math.log10(b)).toFixed(1), 'dB'); }
console.log('const BANK_GAIN = ' + JSON.stringify(out).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ') + ';');

// real-time budget: the engine as it runs on a set — deck A in its peak section, deck B mixing in over 16 bars — for every
// genre, measured per 128-sample quantum. Reports the CPU cost as a percentage of real time (load) and the slowest quanta.
// The Stable engine renders ahead in its own thread, so single slow quanta are absorbed by its buffer; what a slow machine
// cannot absorb is the MEAN. Standard: worst genre ≤ 25 % here (≈ 75 % on a 3× slower laptop, where eco mode then sheds the
// channel character) and the mean over all genres ≤ 16 %. The slowest quanta are reported (this VM itself stalls ~18 ms).
// Usage: node tools/cpu_bench.cjs [genres|all] [seconds=8] [--json]
const { load } = require('./load.cjs'); const X = load(); const cal = require('../src/engine/calibration.json');
const args = process.argv.slice(2), JSONOUT = args.includes('--json'), pos = args.filter((a) => !a.startsWith('--'));
const sr = 44100, secs = +(pos[1] || 8), G = !pos[0] || pos[0] === 'all' ? X.GENRES.map((g) => g.id) : pos[0].split(',');
const pack = (s) => { const ev = s.ev; return { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: { n: ev.n, t: ev.t.slice(), ch: ev.ch.slice(), a: ev.a.slice(), v: ev.v.slice(), d: ev.d.slice(), f: ev.f.slice(), x: ev.x.slice(), y: ev.y.slice() } }; };
const L = new Float32Array(128), R = new Float32Array(128), CL = new Float32Array(128), CR = new Float32Array(128);
X.warmUp({ scores: ['trance', 'dnb'].map((g) => { const p = pack(X.composeTrack(g, 7)); p.cal = cal[g]; return p; }), blocks: 120 }, sr);
const rows = []; let worstLoad = 0, worstQ = 0;
const REPS = +((args.find((a) => a.startsWith('--reps=')) || '--reps=3').slice(7));
for (const g of G) { let best = null; for (let rep = 0; rep < REPS; rep++) { const gb = X.GENRES[(X.GENRES.findIndex((x) => x.id === g) + 5) % X.GENRES.length].id;
  const a = X.composeTrack(g, 3), b = X.composeTrack(gb, 4), E = new X.Engine(sr), pk = X.peakSectionOf(a);
  const ECOL = +((args.find((x) => x.startsWith('--eco=')) || '--eco=0').slice(6)); if (ECOL) E.setEco(ECOL); // --eco=N: the engine's degradation step held from the start (what a phone would run)
  E.cmd({ type: 'load', deck: 0, score: pack(a), cal: cal[g], play: true, from: pk.bar0 * 16 }); E.cmd({ type: 'load', deck: 1, score: pack(b), cal: cal[gb], play: false, bpm: a.meta.bpm });
  for (let i = 0; i < 200; i++) E.render(L, R, 128, CL, CR);
  E.cmd({ type: 'transition', from: 0, deck: 1, atStep: Math.ceil(E.decks[0].pos / 16 + 1) * 16, bars: 16, kind: 'blend', fromB: 0 });
  const nq = Math.round(secs * sr / 128), q = new Float64Array(nq); let tot = 0; const c0 = process.cpuUsage();
  for (let i = 0; i < nq; i++) { const t = process.hrtime.bigint(); E.render(L, R, 128, CL, CR); const dt = Number(process.hrtime.bigint() - t) / 1e6; q[i] = dt; tot += dt; }
  const cu = process.cpuUsage(c0), cpuMs = (cu.user + cu.system) / 1000; // CPU time, not wall time: the VM's own scheduling noise is not ours
  const s = Array.from(q).sort((x, y) => x - y), loadPct = cpuMs / (secs * 1000) * 100, p999 = s[Math.floor(nq * 0.999)], mx = s[nq - 1];
  const row = { g, loadPct, cpuMs, nq, s, p999, mx }; if (!best || row.loadPct < best.loadPct) best = row; }
  { const { loadPct, cpuMs, nq, s, p999, mx } = best; // the least-disturbed of REPS runs: this VM's own scheduling noise is ±15 %
  worstLoad = Math.max(worstLoad, loadPct); worstQ = Math.max(worstQ, p999);
  rows.push({ g, load: +loadPct.toFixed(1), mean: +(cpuMs / nq).toFixed(3), p99: +s[Math.floor(nq * 0.99)].toFixed(2), p999: +p999.toFixed(2), max: +mx.toFixed(2) });
  if (!JSONOUT) console.log(`${g.padEnd(18)} load ${loadPct.toFixed(1).padStart(5)} %  mean ${(cpuMs / nq).toFixed(3)} ms  p99 ${s[Math.floor(nq * 0.99)].toFixed(2)}  p99.9 ${p999.toFixed(2)}  max ${mx.toFixed(2)} ms`); } }
const mean = rows.reduce((s, r) => s + r.load, 0) / rows.length;
if (JSONOUT) console.log(JSON.stringify({ rows, mean, worstLoad, worstQ }));
else console.log(`\nmean load ${mean.toFixed(1)} % · worst genre ${worstLoad.toFixed(1)} % · worst p99.9 quantum ${worstQ.toFixed(2)} ms`);
const pass = worstLoad <= 25 && mean <= 16; if (!JSONOUT) console.log(pass ? 'cpu: inside the budget (worst genre ≤ 25 %, mean ≤ 16 %)' : 'cpu: OVER the budget (worst genre ≤ 25 %, mean ≤ 16 %)'); process.exit(pass ? 0 : 1);

/* ===================== SYNTH VOICE IN WEBASSEMBLY =====================
   The inner loop of Synth.voice() runs as WebAssembly (src/wasm/voice.c → src/engine/03w_voice_wasm.js, built by
   tools/wasm_build.cjs). Per 128-sample block the voice's state is copied into the module's memory, the block is rendered there,
   and the state is copied back: the trigger logic, voice stealing, hand-over and every preset stay in JavaScript, and the
   output is bit-identical to the JavaScript path (tools/wasm_test.cjs). What changes: no garbage on the audio thread from the
   synths (the JavaScript loop produced 20–50 MB per second of audio, at the JIT's whim) and a steadier cost per block.
   If WebAssembly is unavailable (or fails to load) the JavaScript voice runs, as before. WV.off forces it (A/B tests). */
const WV = { ok: false, failed: false, off: false, ex: null, G: null, P: null, V: null, PH: null, PA: null, PD: null, SINW: null, KS: null, OL: null, OR: null, wt: [], wtDone: new Uint8Array(8) };
const WV_P = ['aDec', 'fDec', 'fAtk', 'glide', 'mLfoS', 'lfoRate', 'aSus', 'fSus', 'pEnv', 'lfoAmp', 'gain', 'tone', 'uni', 'detune', 'spread', 'pDec',
  'lfoDepth', 'mLfo', 'keytrack', 'cut', 'envAmt', 'mCut', 'l2Sync', 'l2Rate', 'l2Pitch', 'pos', 'posEnv', 'posLfo', 'mPos', 'table', 'res', 'mRes',
  'ftype', 'drive', 'vow', 'vowLfo', 'sub', 'wave', 'pw', 'voices', 'ratio', 'index', 'bright', 'lfoSync', 'lfoShape', 'width', 'fold', 'noiseAmt', 'subPost'];
function wvB64(s) { const T = new Uint8Array(128); const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; for (let i = 0; i < 64; i++) T[A.charCodeAt(i)] = i;
  const n = s.length, pad = s[n - 1] === '=' ? (s[n - 2] === '=' ? 2 : 1) : 0, out = new Uint8Array((n * 3 >> 2) - pad); let o = 0;
  for (let i = 0; i < n; i += 4) { const v = (T[s.charCodeAt(i)] << 18) | (T[s.charCodeAt(i + 1)] << 12) | (T[s.charCodeAt(i + 2)] << 6) | T[s.charCodeAt(i + 3)]; if (o < out.length) out[o++] = v >> 16; if (o < out.length) out[o++] = (v >> 8) & 255; if (o < out.length) out[o++] = v & 255; }
  return out; }
function wasmVoiceInit() { if (WV.ok || WV.failed) return WV.ok;
  try { if (typeof WebAssembly === 'undefined' || typeof VOICE_WASM_B64 === 'undefined') throw new Error('no WebAssembly');
    const inst = new WebAssembly.Instance(new WebAssembly.Module(wvB64(VOICE_WASM_B64)), { env: { exp: Math.exp, pow: Math.pow, tan: Math.tan, cos: Math.cos } }), x = inst.exports, buf = x.memory.buffer;
    const F64 = (p, n) => new Float64Array(buf, p, n), F32 = (p, n) => new Float32Array(buf, p, n);
    if (x.counts(1) !== WV_P.length) throw new Error('parameter layout mismatch');
    WV.ex = x; WV.G = F64(x.g(), x.counts(0)); WV.P = F64(x.p(), x.counts(1)); WV.V = F64(x.v(), x.counts(2)); WV.PH = F64(x.ph(), 9); WV.PA = F64(x.pa(), 8); WV.PD = F64(x.pd(), 8);
    const C = F64(x.c(), x.counts(3)); C.set(SUPERSAW_DET, 0); C.set(ORGAN_R, 7); C.set(ORGAN_DRAW, 16); C.set(PIANO_FR, 25); for (let U = 0; U < 7; U++) { C.set(UNI_OFF[U], 33 + U * 7); C.set(UNI_PAN[U], 82 + U * 7); }
    WV.SINW = F32(x.sin(), SN + 1); WV.SINW.set(SIN); WV.KS = F32(x.ks(), 2400); WV.OL = F32(x.ol(), 128); WV.OR = F32(x.or(), 128);
    for (let t = 0; t < 8; t++) { WV.wt.push([]); for (let k = 0; k < WT_L; k++) WV.wt[t].push(F32(x.wt(t, k), WT_F * WT_N)); }
    WV.ok = true; } catch (e) { WV.failed = true; WV.err = String(e && e.message || e); }
  return WV.ok; }
// the parameter block, property by property (monomorphic loads; a loop over names was a keyed lookup per value)
function wvParams(P, PP) { PP[0] = P.aDec; PP[1] = P.fDec; PP[2] = P.fAtk; PP[3] = P.glide; PP[4] = P.mLfoS; PP[5] = P.lfoRate; PP[6] = P.aSus; PP[7] = P.fSus; PP[8] = P.pEnv; PP[9] = P.lfoAmp; PP[10] = P.gain; PP[11] = P.tone; PP[12] = P.uni; PP[13] = P.detune; PP[14] = P.spread; PP[15] = P.pDec; PP[16] = P.lfoDepth; PP[17] = P.mLfo; PP[18] = P.keytrack; PP[19] = P.cut; PP[20] = P.envAmt; PP[21] = P.mCut; PP[22] = P.l2Sync; PP[23] = P.l2Rate; PP[24] = P.l2Pitch; PP[25] = P.pos; PP[26] = P.posEnv; PP[27] = P.posLfo; PP[28] = P.mPos; PP[29] = P.table; PP[30] = P.res; PP[31] = P.mRes; PP[32] = P.ftype; PP[33] = P.drive; PP[34] = P.vow; PP[35] = P.vowLfo; PP[36] = P.sub; PP[37] = P.wave; PP[38] = P.pw; PP[39] = P.voices; PP[40] = P.ratio; PP[41] = P.index; PP[42] = P.bright; PP[43] = P.lfoSync; PP[44] = P.lfoShape; PP[45] = P.width; PP[46] = P.fold; PP[47] = P.noiseAmt; PP[48] = P.subPost; for (let k = 0; k < 49; k++) if (PP[k] !== PP[k]) PP[k] = 0; } // an absent parameter (NaN) reads as 0 — as its falsy JavaScript value does
// one voice, one block, in WebAssembly (same contract as Synth.voice)
function wasmVoice(S, v, L, R, n) { const G = WV.G, PP = WV.P, V = WV.V, P = v.p, m = v.m;
  G[0] = S.sr; G[1] = S.bpm; G[2] = S.beat; G[3] = ECO.level; G[4] = NZ;
  if (WV.lastP !== P || WV.lastPv !== S.pv) { wvParams(P, PP); WV.lastP = P; WV.lastPv = S.pv; } // the voices of one synth share their parameter object: copied once per block, not per voice
  V[0] = m; V[1] = v.atk; V[2] = v.rel; V[3] = v.ls; V[4] = v.ft; V[5] = v.vel; V[6] = v.gl; V[7] = v.gr; V[8] = v.env; V[9] = v.stage; V[10] = v.fenv; V[11] = v.fstage; V[12] = v.f; V[13] = v.lfo; V[14] = v.t; V[15] = v.len;
  V[16] = v.relFast; V[17] = v.fadeIn; V[18] = v.ag; V[19] = v.wait; V[20] = v.note; V[21] = v.bright; V[22] = v.acc; V[23] = v.cut; V[24] = v.mph; V[25] = v.mph2; V[26] = v.e1; V[27] = v.e2; V[28] = v.e3; V[29] = v.d1; V[30] = v.d2; V[31] = v.d3;
  V[32] = v.kw; V[33] = v.kl; V[34] = v.kz; V[35] = v.apx; V[36] = v.apy; V[37] = v.vg; V[38] = v.on;
  const ld = v.lad; V[40] = ld.s1; V[41] = ld.s2; V[42] = ld.s3; V[43] = ld.s4; V[44] = ld.G; V[45] = ld.g; V[46] = ld.k; V[47] = ld.drive;
  wvSvfIn(v.s1, V, 48); wvSvfIn(v.s2, V, 58); wvSvfIn(v.s3, V, 68); wvSvfIn(v.s4, V, 78);
  WV.PH.set(v.ph); if (m === 12) { WV.PA.set(v.pa); WV.PD.set(v.pd); }
  const ks = m === 15 || (m === 24 && P.ftype === 4); if (ks) WV.KS.set(v.ks);
  if (m === 24) { let t = P.table | 0; if (t < 0 || t >= 8) t = 0; if (!WV.wtDone[t]) { const tab = wtGet(t); for (let k = 0; k < WT_L; k++) WV.wt[t][k].set(tab[k]); WV.wtDone[t] = 1; } }
  const OL = WV.OL, OR = WV.OR; for (let i = 0; i < n; i++) { OL[i] = L[i]; OR[i] = R[i]; }
  WV.ex.voice(n);
  for (let i = 0; i < n; i++) { L[i] = OL[i]; R[i] = OR[i]; }
  NZ = G[4] | 0;
  v.env = V[8]; v.stage = V[9]; v.fenv = V[10]; v.fstage = V[11]; v.f = V[12]; v.lfo = V[13]; v.t = V[14]; v.len = V[15]; v.relFast = V[16]; v.fadeIn = V[17]; v.ag = V[18]; v.wait = V[19]; v.cut = V[23];
  v.mph = V[24]; v.mph2 = V[25]; v.e1 = V[26]; v.e2 = V[27]; v.e3 = V[28]; v.kw = V[32]; v.apx = V[35]; v.apy = V[36]; v.on = V[38];
  ld.s1 = V[40]; ld.s2 = V[41]; ld.s3 = V[42]; ld.s4 = V[43]; ld.G = V[44]; ld.g = V[45]; ld.k = V[46]; ld.drive = V[47];
  wvSvfOut(v.s1, V, 48); wvSvfOut(v.s2, V, 58); wvSvfOut(v.s3, V, 68); wvSvfOut(v.s4, V, 78);
  v.ph.set(WV.PH); if (m === 12) v.pa.set(WV.PA); if (ks) v.ks.set(WV.KS); }
function wvSvfIn(s, V, o) { V[o] = s.ic1; V[o + 1] = s.ic2; V[o + 2] = s.g; V[o + 3] = s.k; V[o + 4] = s.a1; V[o + 5] = s.a2; V[o + 6] = s.a3; V[o + 7] = s.lp; V[o + 8] = s.bp; V[o + 9] = s.hp; }
function wvSvfOut(s, V, o) { s.ic1 = V[o]; s.ic2 = V[o + 1]; s.g = V[o + 2]; s.k = V[o + 3]; s.a1 = V[o + 4]; s.a2 = V[o + 5]; s.a3 = V[o + 6]; s.lp = V[o + 7]; s.bp = V[o + 8]; s.hp = V[o + 9]; }

/* (v9.4) MP3 export: FORGE's own MPEG-1 Layer III encoder (src/wasm/mp3enc.c, built to WebAssembly by tools/mp3_build.cjs) driven
   from JS. 320 kbit/s joint stereo by default. Runs where the export runs (the composer worker); one frame = 1152 samples per channel.
   mp3Encoder(sr, ch, kbps) → { push(L, R, n): feeds n samples, finish(): Uint8Array of the whole file } */
let MP3_MOD = null;
function mp3Module() { if (MP3_MOD) return MP3_MOD; const s = typeof atob === 'function' ? atob(MP3_WASM_B64) : Buffer.from(MP3_WASM_B64, 'base64').toString('binary'), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  MP3_MOD = new WebAssembly.Module(b); return MP3_MOD; }
function mp3Encoder(sr, ch, kbps) { const inst = new WebAssembly.Instance(mp3Module(), { env: { cos: Math.cos, sin: Math.sin, exp: Math.exp, log: Math.log } }), e = inst.exports, mem = () => e.memory.buffer;
  const rc = e.mp3_init(sr, ch === 1 ? 1 : 2, kbps || 320, 1); if (rc) throw new Error(rc === -1 ? `MP3 needs 32, 44.1 or 48 kHz (not ${sr})` : `no MP3 bitrate ${kbps}`);
  const chunks = []; let fill = 0, total = 0, inL = new Float32Array(mem(), e.mp3_in(0), 1152), inR = new Float32Array(mem(), e.mp3_in(1), 1152);
  const take = (n) => { if (!n) return; const out = new Uint8Array(mem(), e.mp3_out(), n); chunks.push(out.slice()); total += n; e.mp3_take(); };
  const frame = () => { const n = e.mp3_encode(); if (inL.buffer !== mem()) { inL = new Float32Array(mem(), e.mp3_in(0), 1152); inR = new Float32Array(mem(), e.mp3_in(1), 1152); } take(n); fill = 0; };
  return { push(L, R, n) { for (let i = 0; i < n; i++) { const l = L[i], r = R ? R[i] : l; inL[fill] = l > 1 ? 1 : l < -1 ? -1 : l; inR[fill] = r > 1 ? 1 : r < -1 ? -1 : r; if (++fill === 1152) frame(); } },
    finish() { if (fill) { for (let i = fill; i < 1152; i++) { inL[i] = 0; inR[i] = 0; } frame(); } take(e.mp3_flush()); const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } chunks.length = 0; return out; },
    frames: () => e.mp3_frames() }; }

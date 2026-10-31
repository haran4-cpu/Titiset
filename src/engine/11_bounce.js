/* ===================== BOUNCE: a whole track to audio, faster than real time =====================
   Runs on the composer thread (never the audio thread): the deck's score through the same deck + master path as the live engine
   (calibration, per-track auto-gain, the room of its family, the output level the player chose), from the first bar to the end
   plus 4 s of tail. Mix: 16-bit stereo with TPDF dither.
   STEMS (optional, v9.2): drums, bass, chords + pad, lead + arp, fx + texture — stems that ADD UP TO THE MIX. Measured on 9.1:
   they were taken at the channel strips (before the deck's own processing, its section dynamics and auto-gain, the shared reverb
   and delay, and the master) and written as 16-bit integers — on a deep-house track the drum stem had 148,786 full-scale
   (clipped) samples, the stems summed came out 4.5 dB louder than the mix and peaked at +6.1 dBFS. Now each stem is its own pass
   of the whole chain — the same deck with only its channels sounding, through the same reverb and delay — and the master's
   dynamics (glue, level, soft clip, limiter) are replaced by the gains the mix itself got, recorded during the mix pass (see
   Master.runReplay): the stems sum to the mix. They are 32-bit float WAVs (nothing can clip), each handed over as soon as it is
   done (a stem is ~90 MB for a 4-minute track: they are never all held at once). */
const BOUNCE_STEMS = [['drums', [0, 1, 2, 3]], ['bass', [4]], ['chords-pad', [5, 6]], ['lead-arp', [7, 8]], ['fx', [9, 10]]];
// a WAV header (44 bytes): 16-bit PCM, or 32-bit IEEE float (format 3) for the stems
function wavHeader(bytes, sr, float) { const h = new DataView(new ArrayBuffer(44)), w = (o, s) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, s.charCodeAt(i)); }, bps = float ? 4 : 2;
  w(0, 'RIFF'); h.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, float ? 3 : 1, true); h.setUint16(22, 2, true); h.setUint32(24, sr, true); h.setUint32(28, sr * 2 * bps, true); h.setUint16(32, 2 * bps, true); h.setUint16(34, bps * 8, true); w(36, 'data'); h.setUint32(40, bytes, true);
  return new Uint8Array(h.buffer); }
const CRC_TAB = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32Of(parts) { let c = 0xFFFFFFFF; for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC_TAB[(c ^ p[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
// one file of the export: its WAV header, its samples and the zip CRC of both (computed here, off the page's thread)
async function bouncePart(name, data, sr, float) { const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength), head = wavHeader(data.byteLength, sr, float);
  let c = 0xFFFFFFFF; for (let i = 0; i < 44; i++) c = CRC_TAB[(c ^ head[i]) & 255] ^ (c >>> 8);
  for (let o = 0; o < bytes.length; o += 1 << 20) { const e = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < e; i++) c = CRC_TAB[(c ^ bytes[i]) & 255] ^ (c >>> 8); await paced(); }
  return { name, head, data, crc: (c ^ 0xFFFFFFFF) >>> 0, float: !!float }; }
// emit(part): called for each finished file (the mix first, then the stems); without it the stems come back in the result
async function bounceTrack(m, progress, emit) { ECO.exactN++; ECO.exact = true; try { return await bounceRun(m, progress, emit); } finally { ECO.exactN = Math.max(0, ECO.exactN - 1); ECO.exact = ECO.exactN > 0; } } // (v9.2) no idle shortcuts while exporting: an effect fed by two stems idled in a pass that had only one of them, and came back with its delay line and LFO elsewhere (techno: the stems were 23 dB off the mix). Counted (review): with two exports at once, one per deck, the first to finish switched the flag off under the other, whose stems then missed the mix by 28 dB instead of 74
async function bounceRun(m, progress, emit) { const sr = m.sr || 44100, s = m.score, wantStems = !!m.stems, passes = wantStems ? 1 + BOUNCE_STEMS.length : 1; // async: it renders minutes of audio — paced (10_analysis.js) so a set keeps playing while it exports
  let trim = null; if (m.cal) { try { const t = await trackTrimAsync(s, m.cal, sr); trim = Math.pow(10, t.trimDb / 20); } catch (e) { /* no trim: the calibrated level */ } }
  const sps = sr * 60 / s.meta.bpm / 4, body = Math.round(s.meta.bars * 16 * sps), N = body + Math.round(sr * 4), K = (N >> 3) + 24;
  const q16 = (x) => { const v = Math.round(x * 32767 + (Math.random() - Math.random())); return v > 32767 ? 32767 : v < -32768 ? -32768 : v; };
  const g1 = wantStems ? new Float32Array(K) : null, g2 = wantStems ? new Float32Array(K) : null, L = new Float32Array(128), R = new Float32Array(128);
  const clip = { n: 0, at: new Int32Array(4096), l: new Float32Array(4096), r: new Float32Array(4096) }; // where the master's soft clip shaped the mix, and by how much (sparse)
  const res = { sr, frames: N, seconds: N / sr, peakDb: -120, lufs: null, mix: null, stems: wantStems && !emit ? [] : null };
  for (let pass = 0; pass < passes; pass++) {
    noiseSeed(0x5eed51); // every pass draws the same noise: the stems are the mix's own sounds, not new takes of them
    const D = new Deck(sr, 0), M = new Master(sr); D.load(s, m.cal || null); D.playing = 1; M.setTempo(s.meta.bpm); if (D.space) M.setSpace(D.space[0], D.space[1]); // (v9.2: the family's room, as the live engine plays it — the export had the default room)
    if (m.cal) M.setLoudness(m.cal.master + (m.levelDb || 0)); else if (m.levelDb) M.setLoudness(m.levelDb); if (trim) D.mix.trim = D.mix.trimS = trim;
    // a stem pass renders every part and mutes the others at the mixer: the parts share one noise generator (the hats, snares, risers and
    // plucks draw from it in turn), so a pass that left parts out handed the others different noise — tried, 5–10 dB off the mix
    const grp = pass ? BOUNCE_STEMS[pass - 1][1] : null; if (grp) for (let c = 0; c < NCH; c++) if (!grp.includes(c)) { const st = D.mix.s[c]; st.mute = 1; st.gs = st.gp = 0; }
    if (!pass && wantStems) M.cap = { g: new Float32Array(128), l: new Float32Array(128), g1, g2, t: 0, clipAt: (j, a, b) => { if (clip.n === clip.at.length) { const k = clip.n * 2, x = new Int32Array(k), y = new Float32Array(k), z = new Float32Array(k); x.set(clip.at); y.set(clip.l); z.set(clip.r); clip.at = x; clip.l = y; clip.r = z; } clip.at[clip.n] = j; clip.l[clip.n] = a; clip.r[clip.n] = b; clip.n++; } };
    if (pass) M.rep = { g1, g2, clip, ck: 0, t: 0, w: 0, ql: new Float32Array(M.lim.DL), qr: new Float32Array(M.lim.DL) };
    const out = pass ? new Float32Array(N * 2) : new Int16Array(N * 2); let done = 0, next = 0, peak = 0;
    while (done < N) { const n = Math.min(128, N - done); D.process(128); if (pass) M.runReplay([D.mix], 1, L, R, 128); else M.run([D.mix], 1, L, R, 128);
      if (pass) for (let i = 0; i < n; i++) { const k = (done + i) * 2; out[k] = L[i]; out[k + 1] = R[i]; const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; }
      else for (let i = 0; i < n; i++) { const k = (done + i) * 2; out[k] = q16(L[i]); out[k + 1] = q16(R[i]); const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; }
      done += n; if (progress && done >= next) { progress((pass + done / N) / passes); next += N / 20; } if (((done >> 7) & 7) === 0) { const nz = NZ; await paced(); NZ = nz; } } // (the noise is the export's own across its pauses: a track analysed in this worker meanwhile drew from it, and the stems no longer added up to the mix)
    if (!pass) { res.peakDb = 20 * Math.log10(peak + 1e-12); res.lufs = M.meter.integrated ? M.meter.integrated() : null;
      if (wantStems) { const last = Math.max(0, (N - 1) >> 3); for (let k = last + 1; k < K; k++) { g1[k] = g1[last]; g2[k] = g2[last]; } } // the curve's last knots hold its end
      if (emit) emit(await bouncePart('mix', out, sr, false)); else res.mix = out; }
    else { const name = BOUNCE_STEMS[pass - 1][0]; if (emit) emit(await bouncePart(name, out, sr, true)); else res.stems.push({ name, data: out, peakDb: 20 * Math.log10(peak + 1e-12) }); } }
  return res; }

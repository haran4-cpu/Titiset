// v9.4 listening pack: rendered through the app's own engine path and encoded by FORGE's own MP3 encoder (320 kbit/s).
//   tracks-<genre>-N     the first drop of four new tracks of one genre (their own sounds, forms, kits): how different they are
//   kit-<family>         one tech-house drop, the same notes, the six new drum families
//   build-<shape>        builds of different shapes into their drops (the last 8 bars of the build + 4 of the drop)
//   lead2-<mode>         the second melodic voice: an answer, a counter-line, a motif
//   full-<genre>         one whole track at the Club length; extended-<genre>: the same track with Extend pressed in its last drop
// Usage: node tools/listen_v94.cjs <outdir>
const { X, renderTrack, appScore } = require('./render.cjs'); const { lufs, truePeak } = require('./lib/dsp.cjs'); const fs = require('fs');
const OUT = process.argv[2] || 'listen-v9.4'; fs.mkdirSync(OUT, { recursive: true }); const lines = [];
function mp3(name, r, note) { const e = X.mp3Encoder(r.sr, 2, 320); e.push(r.L, r.R, r.L.length); fs.writeFileSync(`${OUT}/${name}.mp3`, e.finish());
  const l = `${name}.mp3  ${(r.L.length / r.sr).toFixed(1)} s · ${lufs(r.L, r.R, r.sr).I.toFixed(1)} LUFS · true peak ${truePeak(r.L, r.R).toFixed(2)} dBTP${note ? ' · ' + note : ''}`; lines.push(l); console.log(l); }
const snd = (s) => { const sp = s.spec && s.spec.sound || {}; return ['lead', 'chords', 'pad', 'bass', 'arp'].filter((k) => sp[k] && sp[k].preset).map((k) => `${k} ${sp[k].preset}`).concat(sp.drums && sp.drums.family ? [`kit ${sp.drums.family}`] : []).join(', ') || 'the genre\'s own sounds'; };
// 1. four tracks of a genre, their first drops
for (const gid of ['melodic-techno', 'deep-house', 'psytrance', 'dnb']) for (let k = 0; k < 4; k++) { const seed = 9400 + k * 131, s = appScore(gid, seed), d = s.sections.find((x) => x.type === 'drop') || X.peakSectionOf(s);
  mp3(`tracks-${gid}-${k + 1}`, renderTrack(gid, seed, { score: s, fromBar: d.bar0, toBar: Math.min(s.meta.bars, d.bar0 + 8) }), snd(s) + (s.contract.hook && s.contract.hook.lead2 ? ` · LEAD 2 (${s.contract.hook.mode}, ${s.contract.hook.preset})` : '')); }
// 2. the six new kit families on one drop
{ const s0 = X.composeTrack('tech-house', 3), d = s0.sections.find((x) => x.type === 'drop'); for (const fam of ['cr78', 'minimal', 'industrial', 'vintage', 'trap', 'garage']) { const s = X.composeTrack('tech-house', 3); s.kits.drumFam = fam; mp3(`kit-${fam}`, renderTrack('tech-house', 3, { score: s, fromBar: d.bar0, toBar: d.bar0 + 8 }), fam + ' family'); } }
// 3. builds of different shapes
{ const done = new Set(); for (const gid of ['house', 'techno', 'trance', 'dnb', 'afro-house', 'dubstep', 'psytrance', 'garage', 'ukg']) for (let seed = 1; seed < 40 && done.size < 7; seed++) { const s = appScore(gid, 500 + seed);
    for (const b of s.sections) { if (b.type !== 'build' || !b.bx || done.has(b.bx.shape)) continue; done.add(b.bx.shape); const from = Math.max(0, b.bar0 + b.bars - 8);
      mp3(`build-${b.bx.shape}-${gid}`, renderTrack(gid, 500 + seed, { score: s, fromBar: from, toBar: Math.min(s.meta.bars, b.bar0 + b.bars + 4) }), `${b.bx.shape} · ${b.bx.fx === 'none' ? 'no effect' : b.bx.fx} · ending ${b.bx.end}`); break; } } }
// 4. LEAD 2
{ const done = new Set(); for (const gid of ['tech-house', 'techno', 'nu-disco', 'electro', 'house', 'dnb', 'reggaeton']) for (let seed = 1; seed < 30 && done.size < 3; seed++) { const s = appScore(gid, 700 + seed), h = s.contract.hook; if (!h || !h.lead2 || done.has(h.mode)) continue; done.add(h.mode);
    const d = s.sections.find((x) => x.type === 'drop'); mp3(`lead2-${h.mode}-${gid}`, renderTrack(gid, 700 + seed, { score: s, fromBar: d.bar0, toBar: d.bar0 + 8 }), `${h.mode} on ${h.preset}`); } }
// 5. one whole Club track, and the same track extended in its last drop
{ const gid = 'melodic-techno', seed = 9494, s = appScore(gid, seed); mp3(`full-${gid}`, renderTrack(gid, seed, { score: s }), `${s.sections.map((x) => x.type + ' ' + x.bars).join(' · ')}`);
  const spec = X.exportSpec(s, { melody: false }), k = s.sections.map((x) => x.type).lastIndexOf('drop'), act = X.extensionAct(X.GENRE_BY_ID[gid], X.rng(3), 'extend', s.sections[k]).map(([t, b, l]) => ({ section: t, bars: b, layer: l }));
  spec.form = spec.form.slice(0, k + 1).concat(act, spec.form.slice(k + 1)); const s2 = X.compileSpec(spec, { fastLevels: true }); if (s2.levelPending) X.refineLevels(s2);
  mp3(`extended-${gid}`, renderTrack(gid, seed, { score: s2, fromBar: s.sections[k].bar0 + s.sections[k].bars - 8 }), `from 8 bars before the end of the last drop: + ${act.map((f) => (f.layer === 'tease' ? 'false drop' : f.section) + ' ' + f.bars).join(' · ')}`); }
fs.writeFileSync(`${OUT}/LEVELS.txt`, 'FORGE v9.4 listening pack — rendered through the app\'s own engine path, encoded by FORGE\'s own MP3 encoder (320 kbit/s), measured to BS.1770-4\n\n' + lines.join('\n') + '\n');

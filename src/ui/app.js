/* ===================== FORGE · UI (main thread) =====================
   The UI composes scores (pure JS, off the audio thread) and sends commands. Everything time-critical — event
   timing, jumps, loops, the bass swap of a transition — executes inside the audio worklet on exact samples. */
'use strict';
const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const SECTION_COL = { intro: '--s-intro', groove: '--s-groove', break: '--s-break', build: '--s-build', drop: '--s-drop', outro: '--s-outro' };
const FAMILY_NAME = { house: 'House', techno: 'Techno', trance: 'Trance', psy: 'Psy', dnb: 'Drum & Bass', bass: 'Bass', hiphop: 'Hip-hop / Club', garage: 'Garage', afro: 'Afro', latin: 'Latin', hard: 'Hard', pop: 'Future / Synth', chill: 'Chill', breaks: 'Breaks', ambient: 'Ambient' };
const FAMILY_COL = { house: '#d9a441', techno: '#8b9db0', trance: '#7aa7e0', psy: '#b77be0', dnb: '#e07a5f', bass: '#d65d7a', hiphop: '#c9a0dc', garage: '#6fc2a8', afro: '#e0b15c', latin: '#ef8a5b', hard: '#e05252', pop: '#78c6e6', chill: '#9fbf8f', breaks: '#c4b080', ambient: '#8fb6b0' };
const STEM_NAMES = ['KICK', 'SNR', 'HAT', 'PRC', 'BASS', 'CHD', 'PAD', 'LEAD', 'ARP', 'FX', 'TEX'];
const PCN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// (v9.2) the screen is written only where it changes: 9.1 rewrote ~14 texts every frame (~95 layouts a second on a phone) — main-
// thread time that, on Android, is taken from the audio engine's worker. The theme colours are read once (a getComputedStyle per
// draw call forced style work every frame); a colour-scheme change clears that cache. Canvas sizes come from a ResizeObserver.
const CSS_C = new Map(); const css = (v) => { let c = CSS_C.get(v); if (c === undefined) { c = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); if (c) CSS_C.set(v, c); } return c; };
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => CSS_C.clear()); } catch (e) { /* an old browser: the colours stay as read */ }
function setText(el, v) { if (!el) return; v = String(v); if (el.textContent !== v) el.textContent = v; }
function setW(el, w) { if (el && el.style.width !== w) el.style.width = w; }
// pointers down on the page right now (v9.2): a panel that would rebuild itself under a held finger waits until it lets go
const PTR = new Set(), ptrUp = (e) => { PTR.delete(e.pointerId); if (!PTR.size && DOCK.renderLater) { DOCK.renderLater = false; setTimeout(() => { DOCK.dpat = DOCK.bpat = null; renderDock(); }, 0); } };
document.addEventListener('pointerdown', (e) => PTR.add(e.pointerId), true); document.addEventListener('pointerup', ptrUp, true); document.addEventListener('pointercancel', ptrUp, true); window.addEventListener('blur', () => PTR.clear());
const GEO = new WeakMap(), GEO_RO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => { for (const e of es) GEO.set(e.target, { width: e.contentRect.width, height: e.contentRect.height }); }) : null;

// ---------------------------------------------------------------- audio transport
const A = { ctx: null, node: null, E: null, mode: '', lat: 0 };
const decks = [newDeck(0), newDeck(1)];
let lead = 0, tx = null, meter = null, auto = { on: false, journey: 'flow', len: 32, prepared: false };
function newDeck(i) { return { i, trim: null, score: null, gid: '', playing: false, pos: 0, posT: 0, bpm: 0, sec: 0, peaks: new Array(11).fill(0), mute: new Array(11).fill(false), eq: { low: 0, mid: 0, high: 0 }, filter: 0, fader: 1, loop: 0, pendJump: -1, ended: false, native: 0 }; }
function send(m, transfer) { if (A.sendTap) A.sendTap(m); healthCmd(m); if (A.worker) A.worker.postMessage(m, transfer || []); else if (A.node) A.node.port.postMessage(m, transfer || []); else if (A.E) A.E.cmd(m); }
function packScore(s) { // keep our copy for drawing, transfer a clone to the audio thread
  const ev = s.ev, c = { n: ev.n, t: ev.t.slice(), ch: ev.ch.slice(), a: ev.a.slice(), v: ev.v.slice(), d: ev.d.slice(), f: ev.f.slice(), x: ev.x.slice(), y: ev.y.slice() };
  return { msg: { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: c }, transfer: [c.t.buffer, c.ch.buffer, c.a.buffer, c.v.buffer, c.d.buffer, c.f.buffer, c.x.buffer, c.y.buffer] }; }
// Audio engines. STABLE (every choice on Android; on desktop the 'buffered' choice — desktop starts on Live · safe): the DSP runs in a Worker, ahead of the audio clock, and the audio thread only plays the
// chunks it receives (ForgePlayer) — a GC pause, a JIT recompile, a dense chord or a busy page is absorbed by the buffer instead
// of being heard as a stall; controls answer in ~90 ms, and on a machine that still drops out the buffer grows on its own.
// TIGHT: the DSP inside the AudioWorklet (lowest latency — strong machines, controller sets). FALLBACK: a ScriptProcessor on
// the main thread (browsers without AudioWorklet). The choice is stored; the header shows the engine, buffer and dropouts.
// ANDROID (v9.1): Chrome's audio worklet skips with a large output buffer on Android — the 'playback' hint and the numeric one the
// gig engine used (Chromium issue 40133762: "AudioWorklet audio skips / glitches with playback latency on Android Chrome"); measured
// by the person playing it: the gig engine jumped constantly, the balanced one at the busy points. The small buffer is the path
// Android's low-latency audio (AAudio) is built for, but it leaves the DSP ~3 ms per callback on a phone core. So on Android every
// choice runs the STABLE engine — the DSP in a worker, rendered ahead; the audio thread only copies — on a low-latency context, and
// the choice sets how far ahead it renders (the knobs answer that much later): a gig ≈ 340 ms, live ≈ 170 ms, studio ≈ 85 ms.
// An Android tablet often asks for desktop sites (its user agent then reads as desktop Linux): an ARM Linux platform with a touch
// screen, or the client-hints platform, still identifies it (ChromeOS is excluded: its audio is a desktop's)
const ANDROID = (() => { if (typeof navigator === 'undefined') return false; const ua = navigator.userAgent || '', pf = navigator.platform || '', ch = navigator.userAgentData && navigator.userAgentData.platform;
  return /Android/i.test(ua) || /android/i.test(ch || '') || (!/CrOS/.test(ua) && /Linux (arm|aarch64)/i.test(pf) && navigator.maxTouchPoints > 0); })();
const AHEAD_MS = { safe: 340, live: 170, fast: 85, buffered: 140 }, AHEAD_NAME = { safe: 'gig', live: 'live', fast: 'studio', buffered: '' };
function latHint(want) { try { const h = localStorage.getItem('forge.latency'); if (h) return isNaN(+h) ? h : +h; } catch (e) { /* default */ } if (ANDROID) return 'interactive'; return want === 'fast' ? 'interactive' : want === 'safe' ? 0.25 : 'playback'; } // safe: the biggest buffer the browser allows (Chrome caps it near 190 ms) — a late audio callback (other programs, power saving, a worker burst on a weak CPU) no longer reaches the sound card
// the engine (measured on a CPU emulated 3–4× slower, the browser sharing its cores with busy processes — tools/liveset_stress.cjs):
//   live     — the DSP on the browser's REAL-TIME audio thread (other programs cannot starve it) with a playback-size device
//              buffer (~70 ms): 0 dropouts where the worker engine had thousands. The default.
//   fast     — the same, with the smallest device buffer (~30 ms to the controls): for a strong machine.
//   buffered — the DSP in a Worker, rendered ahead. Immune to the page's own stalls, but a Worker is an ordinary-priority thread:
//              on a busy machine it gets starved. Kept as an option.
function engPref() { let v = null; try { v = localStorage.getItem('forge.engine2'); } catch (e) { /* default */ }
  if (v === 'fast' || v === 'buffered' || v === 'safe' || v === 'live') return v; // an explicit choice always wins
  // nothing chosen: a set starts on the gig buffer (v9: a live set must not jump — steadiness first; the start card shows the choice
  // and Live / Studio are one click away). Test browsers keep the plain Live default so the suites measure the same thing everywhere.
  try { if (localStorage.getItem('forge.autoSafe') === '1') return 'safe'; } catch (e) { /* default */ } // (v9.2) a glitchy session said "the next start uses the Safe engine" — and now it does
  return !navigator.webdriver ? 'safe' : 'live'; }
function warmScores() { return ['trance', 'dnb'].map((g) => { const s = composeTrack(g, 7), p = packScore(s).msg; p.cal = cal(g); const sec = s.sections.find((x) => x.type === 'drop') || s.sections[2]; p.from = sec.bar0 * 16; return p; }); }
function spawnEngineWorker(file) { return new Promise((res, rej) => { let w; try { w = file ? new Worker('forge-engine.js') : new Worker(URL.createObjectURL(new Blob([ENGINE_SRC], { type: 'text/javascript' }))); } catch (e) { rej(e); return; }
  const to = setTimeout(() => { w.terminate(); rej(new Error('engine worker did not start')); }, 2500); w.onerror = (e) => { if (e.preventDefault) e.preventDefault(); clearTimeout(to); w.terminate(); rej(new Error('engine worker failed')); };
  w.onmessage = (e) => { if (e.data && e.data.type === 'alive') { clearTimeout(to); w.onerror = null; res(w); } }; w.postMessage({ type: 'ping' }); }); }
async function startStable(ctx, want) { const aMs = ANDROID ? AHEAD_MS[want] || AHEAD_MS.buffered : 0, sr = ctx.sampleRate, ahead = aMs ? Math.max(2048, Math.round(aMs / 1000 * sr / 512) * 512) : 6144;
  let w = null; if (location.protocol !== 'file:') { try { w = await spawnEngineWorker(true); } catch (e) { w = null; } }
  if (!w) w = await spawnEngineWorker(false); // a file next to the page first (strict content policies allow it), a blob otherwise
  const node = new AudioWorkletNode(ctx, 'forge-player', { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2] }), ch = new MessageChannel();
  node.port.postMessage({ type: 'port', port: ch.port2 }, [ch.port2]);
  await new Promise((res) => { const to = setTimeout(res, 20000); w.onmessage = (e) => { if (e.data && e.data.type === 'ready') { clearTimeout(to); res(); } else onEngine(e.data); };
    // floor: the chosen lead is kept (only extra lead grown after a dropout is given back); maxLead: how far it may grow on a phone
    w.postMessage({ type: 'init', sr, lead: ahead, floor: aMs ? ahead : 0, maxLead: aMs ? Math.max(32768, ahead * 2) : 0, port: ch.port1, warm: { scores: warmScores(), blocks: 120 } }, [ch.port1]); });
  w.onmessage = (e) => onEngine(e.data); node.connect(ctx.destination, 0); A.node = node; A.worker = w; A.mode = aMs && AHEAD_NAME[want] ? 'Stable · ' + AHEAD_NAME[want] : 'Stable'; A.leadF = ahead; }
// Apple WebKit (every browser on iOS, Safari on macOS) starts an AudioContext only from inside the tap itself, and a resume after an await no longer counts as one:
// there the context is unlocked in the tap, and the warm-up below still holds it suspended; the other engines keep the plain path, measured to glitch less at the start
const WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent);
function unlockAudio(ctx) {
  try { ctx.resume().catch(() => {}); const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(0); } catch (e) { /* not needed there */ }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* the silent switch stays in charge */ }
}
// a context that still is not running after the start, because the host refused, starts on the next tap
function armUnlock(ctx) {
  const evs = ['pointerdown', 'touchend', 'keydown', 'click'], off = () => evs.forEach((e) => document.removeEventListener(e, go, true));
  const go = () => { if (ctx.state === 'running') { off(); return; } ctx.resume().then(() => { if (ctx.state === 'running') off(); }).catch(() => {}); };
  evs.forEach((e) => document.addEventListener(e, go, true)); toast('Tap the screen once to start the sound', 6000);
}
async function startAudio() {
  if (A.ctx) { if (A.ctx.state !== 'running') await A.ctx.resume(); return; }
  { const pw = $('#power'); if (pw) setText(pw, 'Starting audio…'); } // (v9.2) the first tap answers at once: the engine takes 1–4 s to start while the screen still offered to start it
  const want = engPref(), ctx = new AudioContext({ latencyHint: latHint(want) }); A.ctx = ctx; let worklet = false; if (WEBKIT) unlockAudio(ctx);
  try { try { await ctx.audioWorklet.addModule('forge-worklet.js'); } catch (e) { try { await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' }))); } catch (e2) { /* a page opened straight from disk has no real origin: Chromium refuses a blob module there but loads a data one */ await ctx.audioWorklet.addModule('data:text/javascript;base64,' + btoa(unescape(encodeURIComponent(WORKLET_SRC)))); } } worklet = true; } catch (e) { worklet = false; }
  if (worklet && (want === 'buffered' || ANDROID)) { try { await startStable(ctx, want); } catch (e) { A.worker = null; A.node = null; A.mode = ''; A.degraded = 'the render-ahead (Stable) engine could not start here — ' + ((e && e.message) || 'no worker thread'); } }
  if (!A.mode && worklet) { try {
    A.node = new AudioWorkletNode(ctx, 'forge', { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2] }); // output 1 = headphone cue bus (perform.js routes it)
    A.node.port.onmessage = (e) => onEngine(e.data); A.node.connect(ctx.destination, 0); A.mode = A.degraded ? 'Live (fallback)' : want === 'fast' ? 'Live · fast' : want === 'safe' ? 'Live · safe' : 'Live'; // (v9.2) the name of what really runs (on Android a failed Stable start was labelled Live · safe)
    // JIT warm-up on the audio thread while the context is SUSPENDED: nothing is due at the sound card while it runs
    try { await ctx.suspend(); } catch (e) { /* not allowed: warm while running */ }
    await new Promise((res) => { const to = setTimeout(res, 15000); A.warmDone = () => { clearTimeout(to); res(); }; A.node.port.postMessage({ type: 'warmup', scores: warmScores(), blocks: 120 }); }); A.warmDone = null; } catch (e) { A.node = null; A.mode = ''; } }
  if (!A.mode) { // last resort: the same engine on the main thread through a ScriptProcessor (higher latency, still sample-accurate)
    BANK_SYNC = false; try { warmUp({ scores: warmScores(), blocks: 60 }, ctx.sampleRate); } catch (e) { /* warm-up is an optimisation */ } // same JIT warm-up as the worklet
    // a large buffer: main-thread audio must ride out page stalls (a last resort; the worklet is the real path)
    const E = new Engine(ctx.sampleRate).prealloc(); A.E = E; const sp = ctx.createScriptProcessor(8192, 0, 2); let cnt = 0; const L = new Float32Array(128), R = new Float32Array(128), sL = new Float32Array(128), sR = new Float32Array(128);
    // main-thread audio: every stall of the page is a gap in the sound — measured (late callbacks) and shown in the header
    const per = 8192 / ctx.sampleRate * 1000; let last = 0, busy = 0, nb = 0;
    sp.onaudioprocess = (ev) => { const t = performance.now(); if (last && t - last > per * 1.8) A.spLate = (A.spLate || 0) + 1; last = t; const oL = ev.outputBuffer.getChannelData(0), oR = ev.outputBuffer.getChannelData(1); for (let o = 0; o < oL.length; o += 128) { try { E.render(L, R, 128); } catch (err) { L.fill(0); R.fill(0); E.rescue(err, sL, sR, 128); } oL.set(L, o); oR.set(R, o); } /* (v9.2 review) an exception is caught here too, as in the worklet and the worker */
      const dt = performance.now() - t; busy += dt; nb++; if (++cnt % 1 === 0) { const m = E.meters(); m.blkMax = dt; m.load = busy / (nb * per); if (nb >= 20) { busy = 0; nb = 0; } m.late = A.spLate || 0; onEngine(m); while (E.outbox.length) onEngine(E.outbox.shift()); } };
    sp.connect(ctx.destination); A.mode = 'ScriptProcessor (fallback)'; }
  if (ctx.state !== 'running') { if (WEBKIT) { await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 2500))]); if (ctx.state !== 'running') armUnlock(ctx); } else await ctx.resume(); }
  { const ps = cardStats(ctx); if (ps) { A.ps0 = ps.drops; A.psApi = ps.api; if (!A.worker) A.underKnown = true; } } // glitches the sound card had to fill, counted from here (the Stable engine counts its own player's dry runs; the report shows both)
  A.lat = ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000; if (!worklet && !A.degraded) A.degraded = 'this browser refused the audio worklet';
  A.started = performance.now(); healthStart(); restoreUserSamples(); if (A.degraded) degradedNotice(); if (ANDROID) workerPace(false); /* the tight pace from the start on Android */ setTimeout(() => { const p = offThread({ type: 'compose', gid: 'techno', seed: 1 }); if (p) p.catch(() => {}); }, 300); send({ type: 'level', db: outLevel() }); try { if (localStorage.getItem('forge.wasm') === 'off') send({ type: 'wasm', on: false }); } catch (e) { /* default: on */ } // the composer thread loads and warms up now, not on the first edit
  $('#power').classList.add('on'); $('#power').textContent = 'Audio on'; renderEngineInfo();
}
// (v9.2) a degraded start is said, not hidden: a mark on the header's engine info, a toast, and the Health report
function degradedNotice() { const why = A.degraded, risk = ANDROID && /^Live/.test(A.mode) ? ' On Android this engine can glitch under load —' : A.mode.startsWith('ScriptProcessor') ? ' Every stall of the page is now a gap in the sound —' : '';
  hLog('degraded', `${why} → ${A.mode}`); toast(`Running on the ${A.mode} engine: ${why}.${risk} open DJ-TiTo.html together with its side files (forge-engine.js, forge-worklet.js, forge-analysis.js) for the full engine`, 14000); renderEngineInfo(); }
function outLevel() { try { const v = localStorage.getItem('forge.level'); return v == null ? -2 : +v; } catch (e) { return -2; } }
function bindOutLevel() { const el = $('#outLevel'); if (!el) return; el.value = String(outLevel()); el.onchange = () => { try { localStorage.setItem('forge.level', el.value); } catch (e) { /* this page only */ } send({ type: 'level', db: +el.value }); toast(`Output: ${el.options[el.selectedIndex].text}`); }; }
function bindEngPref() { const el = $('#engPref'); if (!el) return; el.value = engPref();
  el.onchange = () => { try { localStorage.setItem('forge.engine2', el.value); } catch (e) { /* storage blocked: the choice lasts this page only */ }
    if (A.ctx) { toast(`${el.options[el.selectedIndex].text} engine on the next start — reload the page to switch`); } }; }
function renderEngineInfo() { const el = $('#engine'); if (!el) return; const buf = A.worker ? ` · buffer ${Math.round((A.leadF || 4096) / (A.ctx ? A.ctx.sampleRate : 44100) * 1000)} ms` : '';
  setText(el, (A.degraded ? '⚠ ' : '') + (A.mode || 'idle') + (meter && meter.wasm ? ' · WASM' : '') + buf + (A.worker || A.underKnown ? ` · ${A.under || 0} dropouts` : A.spLate ? ` · ${A.spLate} late` : '')); el.title = A.degraded ? 'Degraded: ' + A.degraded : ''; }
// where the ENGINE is now (Stable renders ahead of what is heard): quantised commands are scheduled from here, so a line that is
// still ahead of the listener but already rendered is never targeted
// a Live engine that keeps glitching starts on the big buffer next time (an explicit engine choice is never overridden)
// (v9.5) the sound card's glitch counter: Chrome first shipped it as AudioContext.playoutStats (fallbackFramesEvents, latency in ms) and
// renamed it AudioContext.playbackStats (underrunEvents, latency in seconds) — Chrome 153 has only the new name, and 9.4 read only the old
// one, so on a current Chrome the Live engine counted no glitches at all. Both are read here, in one shape: drops (events), lat/latMax (ms).
function cardStats(ctx) { const p = ctx && ctx.playoutStats; if (p && p.fallbackFramesEvents != null) return { drops: p.fallbackFramesEvents, lat: p.averageLatency, latMax: p.maximumLatency, api: 'playoutStats' };
  const b = ctx && ctx.playbackStats; if (b && b.underrunEvents != null) return { drops: b.underrunEvents, lat: b.averageLatency * 1000, latMax: b.maximumLatency * 1000, api: 'playbackStats' }; return null; }
function glitchWatch() { const u = A.underKnown ? (A.under || 0) : (A.lateGaps || 0); if (A.glitchTold || !/^Live/.test(A.mode) || A.mode === 'Live · safe') return; const sec = (performance.now() - (A.started || 0)) / 1000; if (u < 15 && !(u >= 6 && sec < 120)) return; A.glitchTold = true;
  let explicit = false; try { explicit = localStorage.getItem('forge.engine2') != null; if (!explicit) localStorage.setItem('forge.autoSafe', '1'); } catch (e) { explicit = true; }
  toast(`The audio glitched ${u} times — ${explicit ? 'pick “Live · safe” in the Engine menu' : 'the next start uses the Safe engine'} (a bigger buffer: steadier audio, more delay to the controls — the header shows the output latency). Reload the page to switch now`, 14000); }
// the workers' pace (10_analysis.js PACE): after a glitch they render in 4 ms slices with 4 ms rests for a minute (the audio thread
// gets every other moment of a shared core), then go back to 10 ms / 2 ms
// (v9.1) on Android always the tight pace: a phone's fast cores are few, and the engine's own worker needs one of them
function workerPace(tight) { const now = performance.now(); if (tight) A.paceT = now; const want = ANDROID || tight || (A.paceT && now - A.paceT < 60000) ? 'tight' : 'normal'; if (want === A.pace) return; A.pace = want;
  const msg = want === 'tight' ? { type: 'pace', work: 4, rest: 4 } : { type: 'pace', work: 10, rest: 2 }; for (const w of [composerW, analyser]) if (w && w.postMessage) try { w.postMessage(msg); } catch (e) { /* gone */ } }
function schedPos(D) { return livePos(D) + (A.aheadMs || 0) / 1000 * (D.bpm || 124) / 15; }
function onEngine(m) { if (A.tap) A.tap(m); if (m.type === 'warm' && A.warmDone) { A.warmDone(); return; } if (m.type === 'meter') healthMeter(m);
  if (m.type === 'meter' && A.underKnown && !A.worker) { const ps = cardStats(A.ctx), u = ps ? ps.drops - A.ps0 : 0; if (u > (A.under || 0)) { A.under = u; renderEngineInfo(); glitchWatch(); workerPace(true); } else if (A.pace === 'tight') workerPace(false); }
  if (m.type === 'meter') { meter = m; const now = performance.now(); lead = m.lead;
    // the output latency is often unknown (0) when the context is created and only reported once the device runs: keep the estimate current (it places the playhead where it is heard, and the MIDI clock with it)
    if (A.ctx && now - (A.latT || 0) > 2000) { A.latT = now; const L = ((A.ctx.baseLatency || 0) + (A.ctx.outputLatency || 0)) * 1000; if (L > 0 && Math.abs(L - (A.lat || 0)) > 5) A.lat = L; } // (a new estimate only when it moved more than 5 ms: the reported value wanders by a few ms, and every change now moves the heard position and the MIDI clock)
    // Stable engine: the meter was taken when the audio was RENDERED, `ahead` frames before it is heard — positions shown and
    // extrapolated here are what the listener hears (schedPos adds the lead back for scheduling)
    // (v9.2) where the listener is: what is rendered but not yet played (Stable: the worker's queue — smoothed, because with a big
    // output buffer the player reports in bursts of a whole buffer) PLUS the device's own latency, always. 9.1 dropped one term or the
    // other: with Bluetooth the playhead and the MIDI clock were off by the whole render lead (340 ms on a gig setting)
    const sr = m.sr || 44100; let qS = 0; if (A.worker && m.frame != null && A.ctx) { const q0 = Math.max(0, m.frame - (m.pf + Math.max(0, A.ctx.currentTime - m.pt) * sr)) / sr;
      // a meter that reached the page late reads a queue short by the delay (what was rendered is counted at the meter, what was played
      // at its arrival); 9.2's first version took a jump of over 0.25 s at once — the playhead and the MIDI clock jumped back 2.4 steps
      // (a session on a busy page). A reading far off now counts only when the next ones agree; small ones are smoothed as before
      if (A.qS == null) A.qS = q0; else if (Math.abs(q0 - A.qS) > 0.08) { A.qOut = (A.qOut || 0) + 1; if (A.qOut >= 4) { A.qS = q0; A.qOut = 0; } } else { A.qOut = 0; A.qS += (q0 - A.qS) * 0.15; } qS = A.qS; } else if (A.worker && m.ahead) qS = m.ahead / sr;
    const aheadS = qS + (A.lat || 0) / 1000; A.aheadMs = aheadS * 1000; if (m.bufF != null) A.leadF = m.bufF; if (m.under != null) A.under = m.under; if (A.worker || A.mode === 'Tight') renderEngineInfo();
    m.decks.forEach((d, i) => { const D = decks[i], est = d.playing ? d.pos - aheadS * d.bpm / 15 : d.pos, pred = livePos(D); D.pos = d.playing && D.playing && est < pred && pred - est < 0.3 ? Math.max(D.pos, pred - (pred - est) * 0.25) : est; D.posT = now; /* never a few ms backwards (clock jitter): a real jump is larger. A position that is only a little behind the extrapolation is followed down by a quarter of the gap per update — holding on to the extrapolation made it run ahead of a sound card clock that is slower than the system clock, until it snapped */ D.bpm = d.bpm; D.playing = !!d.playing; if (D.playing) D.fresh = false; D.sec = d.sec; D.ended = !!d.ended; for (let c = 0; c < 11; c++) D.peaks[c] = Math.max(D.peaks[c] * 0.85, d.peaks[c]); });
    tx = m.tx ? Object.assign(tx || {}, m.tx) : (tx && tx.u < 0 && !m.tx && decks[tx.b] && !decks[tx.b].playing && now - (tx.sent || 0) < 2500 ? tx : null); autoTick(); extendTick(); } // (a mix just sent and not yet in a meter is kept for a moment; one the engine never reports is not)
  else if (m.type === 'at') atReport(m); // a command that waited for its step has run (or been settled): the pads and knobs follow
  else if (m.type === 'health') { A.under = m.under; A.leadF = m.bufF; renderEngineInfo(); workerPace(true); if (!m.eco) toast(`Audio dropout on this machine — the engine now renders ${Math.round(m.bufF / (A.ctx ? A.ctx.sampleRate : 44100) * 1000)} ms ahead so it is less likely to happen again`); }
  else if (m.type === 'eco' && m.level === 2) toast('The sound engine is close to the limit of this device — eco 2: supersaw and unison stacks thinned, the shimmer / resonator effects off, until it recovers', 6000);
  else if (m.type === 'eco') toast(!m.on ? 'Eco mode off — the full sound is back' : m.prev > m.level ? 'Eco 1: the supersaw and unison stacks are full again (channel character still off until it recovers)' : 'The sound engine is running short of time on this device — eco mode: channel character (heat / punch) off until it recovers');
  else if (m.type === 'txDone') { const D = decks[m.deck]; toast(`Mix complete — ${D.score.meta.name} leads`); auto.prepared = false;
    // tempo after a mix: the set keeps its tempo (a DJ does not let the next record run off at its own speed). Only if the
    // set tempo is outside the new genre's own window does it drift to the window's edge — at most 1/8 BPM per bar, so it is
    // felt over minutes, never heard as "it suddenly sped up" (it was a 16-bar glide to the track's native tempo: up to 11 BPM)
    // (v9.2) the glide ends before this track's own Auto-DJ mix point and never moves faster than 1/8 BPM per bar — what is left goes on
    // in the next track (measured: up to 848 bars of glide, far beyond the ~96 bars between two mixes, drifting the next mix)
    { const G = GENRE_BY_ID[D.gid], want = G ? clamp(D.bpm, G.bpm[0], G.bpm[1]) : D.bpm, room = Math.max(16, Math.floor((autoMixAt(D.score, auto.len) - livePos(D)) / 16) - 8), d = clamp(want - D.bpm, -room / 8, room / 8);
      if (Math.abs(d) > 0.05) send({ type: 'glide', deck: m.deck, bpm: D.bpm + d, bars: Math.min(room, Math.max(32, Math.ceil(Math.abs(d) * 8))) }); }
    const O = decks[m.deck ^ 1]; O.pendJump = -1; O.loop = 0; renderDeckHead(O.i); }
  // (v9.2) the engine's own reports: a mix called off (by the page, or because the incoming deck stopped or was reloaded), a
  // self-heal after a non-finite value, a command it refused, an exception it survived
  else if (m.type === 'txCancelled') { if (m.why === 'replaced') return; tx = null; auto.prepared = false; if ((m.why === 'ui' || m.why === 'pause') && decks[m.deck]) decks[m.deck].fresh = true; renderDeckHead(0); renderDeckHead(1); /* (a mix called off by hand leaves its incoming track cued: the next mix brings it in) */
    if (m.why !== 'ui' && m.why !== 'load') toast(m.why === 'engine error' ? 'The mix was called off after an engine error' : `Mix called off — deck ${'AB'[m.deck ^ 1]} stays on air`); }
  else if (m.type === 'needBank') requestBank(m.family, m.sr, true);
  else if (m.type === 'healed') { DIAG.heals = (DIAG.heals || 0) + 1; healthNote(`engine self-heal #${m.n}: ${m.why}${m.decks && m.decks.length ? ' (rebuilt deck ' + m.decks.map((d) => 'AB'[d]).join(' + ') + ')' : ''}`); if (m.why !== 'error') toast('The sound engine caught an invalid value and rebuilt itself where it was — the music goes on', 6000); }
  else if (m.type === 'rejected') { DIAG.rejected = (DIAG.rejected || 0) + 1; healthNote(`engine refused a ${m.cmd} command with a non-finite value`); }
  else if (m.type === 'engineError') { healthNote(`engine error #${m.fails}: ${m.msg}`); if (m.fails < 3) toast('The sound engine hit an error and recovered where it was', 6000); }
  else if (m.type === 'deckStopped') { const D = decks[m.deck]; if (D) D.playing = false; renderDeckHead(m.deck); healthNote(`deck ${'AB'[m.deck]} stopped: ${m.msg}`); toast(`Deck ${'AB'[m.deck]} stopped — ${m.msg}. Deck ${'AB'[m.deck ^ 1]} plays on; load another track on deck ${'AB'[m.deck]}`, 8000); } // (review) one broken track no longer stops both decks
  else if (m.type === 'engineReset') { for (const D of decks) D.playing = false; tx = null; auto.prepared = false; renderDeckHead(0); renderDeckHead(1); toast(`The sound engine stopped both decks after repeated errors (${m.msg}) — load a track to go on`, 12000); }
}
function healthNote(t) { try { if (HEALTH.t0) hLog('engine', t); } catch (e) { /* diagnostics only */ } } // (the Health report's event log)
function livePos(D) { if (!D.playing || !D.posT) return D.pos; return D.pos + (performance.now() - D.posT) / 1000 * D.bpm / 15; }

// ---------------------------------------------------------------- per-track auto-gain (Worker renders the peak section)
let analyser = null, anaSeq = 0; const anaWant = [0, 0];
// the analysis worker loads as a file next to the page (works under a strict content policy, e.g. inside Claude); a blob is the fallback
function anaReply(e) { const m = e.data; if (m.type === 'refine') { const D = decks[m.deck]; if (!m.error && D.score && D.score.__refine === m.id) for (const c of m.gains) { const k = D.score.kits[c.slot === 'arp' ? (D.score.kits.hook ? 'hook' : 'arp') : c.slot]; if (k) k.gain = c.gain; send({ type: 'kit', deck: m.deck, slot: c.slot, p: { gain: c.gain } }); } return; }
  if (m.error || anaWant[m.deck] !== m.id) return; const D = decks[m.deck]; D.trim = m.trimDb; send({ type: 'trim', deck: m.deck, db: m.trimDb, now: !D.playing }); renderDeckHead(m.deck); }
function paceNew(w) { if (ANDROID || A.pace === 'tight') try { w.postMessage({ type: 'pace', work: 4, rest: 4 }); } catch (e) { /* gone */ } return w; } // a worker made after the pace was set starts at it
function makeAnalyser(file) { const w = paceNew(file ? new Worker('forge-analysis.js') : new Worker(URL.createObjectURL(new Blob([ANALYSER_SRC], { type: 'text/javascript' })))); w.onmessage = anaReply;
  w.onerror = (e) => { if (e.preventDefault) e.preventDefault(); if (analyser !== w) return; analyser = null;
    if (file) { try { analyser = makeAnalyser(false); for (let i = 0; i < 2; i++) if (decks[i].score && decks[i].trim == null) analyse(i, decks[i].score); return; } catch (x) { analyser = null; } }
    // (v9.2) no analysis thread at all (a strict content policy): the decks say so instead of "analysing…" forever; the engine's loudness servo still levels them
    analyser = false; hLog('degraded', 'no analysis worker: per-track auto-gain off'); for (let i = 0; i < 2; i++) if (decks[i].score && decks[i].trim == null) { decks[i].trim = 0; decks[i].trimNA = true; renderDeckHead(i); } };
  return w; }
// the analysis worker renders the track's peak section (and the exact level of its palette sounds): it waits until the
// engine has had a few seconds with the new track — on a two-core machine the two threads competing at start-up was measured
// as dropouts in the first second of a track (the engine's first renders of new code paths run slow)
function analyse(i, s) { const t = A.ctx && performance.now() - (A.started || 0) < 4000 ? 2500 : 1200; setTimeout(() => { if (decks[i].score === s) analyseNow(i, s); }, t); }
function analyseNow(i, s) { if (analyser === false) { decks[i].trim = 0; decks[i].trimNA = true; renderDeckHead(i); return; } try { if (!analyser) { try { analyser = makeAnalyser(location.protocol !== 'file:'); } catch (e) { analyser = makeAnalyser(false); } }
    const id = ++anaSeq; anaWant[i] = id; analyser.postMessage({ id, deck: i, score: { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: s.ev }, cal: cal(s.meta.gid), sr: A.ctx ? A.ctx.sampleRate : 44100, lite: ANDROID }); }
  catch (e) { analyser = false; decks[i].trim = 0; decks[i].trimNA = true; renderDeckHead(i); /* no worker: the loudness servo in the engine still converges */ } }
// ---------------------------------------------------------------- composition + loading
function cal(gid) { return CALIB[gid] || null; }
// HARMONIC MIXING (v9.2) by key signature — the Camelot wheel: a mode sits on its parent major scale (C dorian has B♭ major's notes),
// and the next track is put on the SAME signature (half the time) or one fifth up or down (a quarter each): all its notes but one
// shared. Before, every minor-ish mode counted as natural minor: a dorian or phrygian track landed two or more steps away.
// Harmonic minor counts as natural minor, phrygian dominant as phrygian (their one raised note is the leading tone).
const MODE_OFF = { major: 0, lydian: 5, mixolydian: 7, minor: 9, harmonic: 9, dorian: 2, phrygian: 4, phrygdom: 4 };
function keySig(key, mode) { return ((key - (MODE_OFF[mode] ?? 9)) % 12 + 12) % 12; }
function camelotSteps(k1, m1, k2, m2) { const d = ((keySig(k2, m2) - keySig(k1, m1)) * 7 % 12 + 12) % 12; return Math.min(d, 12 - d); }
function compatibleKey(fromKey, fromMode, toMode) { const r = Math.random(), sig = (keySig(fromKey, fromMode) + (r < 0.5 ? 0 : r < 0.75 ? 7 : 5)) % 12;
  return (sig + (MODE_OFF[toMode] ?? 9)) % 12; }
// a new track: the genre's own sound for some parts, its palette for others (seeded; each palette sound level-matched in context
// by the compiler, so a new sound never changes the mix balance)
// ---- the composer thread: composing / compiling a track takes 50–400 ms of JavaScript — on the page's thread that froze the
// screen (a knob being dragged jumped). It runs in its own worker (the same composer code as the page); the page waits without
// blocking. If workers are unavailable it falls back to composing here.
let composerW = null, compSeq = 0, compFile = true; const compWait = new Map();
function composerWorker() { if (composerW === false) return null; if (composerW) return composerW;
  const mk = (file) => paceNew(file ? new Worker('forge-analysis.js') : new Worker(URL.createObjectURL(new Blob([ANALYSER_SRC], { type: 'text/javascript' }))));
  // a page whose file worker cannot load (a content policy, a missing file) gets the same code from a blob on the next call; a blob worker that fails ends the attempts
  let file = compFile && location.protocol !== 'file:'; try { try { composerW = mk(file); } catch (e) { file = false; composerW = mk(false); } } catch (e) { composerW = false; return null; }
  composerW.onmessage = (e) => { const m = e.data, w = compWait.get(m.id); if (!w) return; if (m.type === 'bounceProgress' || m.type === 'bouncePart') { if (m.type === 'bounceProgress' && w.progress) w.progress(m.p); if (m.type === 'bouncePart' && w.part) w.part(m.part); clearTimeout(w.to); w.to = setTimeout(() => { compWait.delete(m.id); w.rej(new Error('composer timeout')); }, 60000); return; } compWait.delete(m.id); clearTimeout(w.to); if (m.error) w.rej(Object.assign(new Error(m.error), { validation: m.validation })); else w.res(m.type === 'bounced' ? m.r : m.type === 'drumBank' ? m.bank : m.score); };
  composerW.onerror = () => { for (const w of compWait.values()) { clearTimeout(w.to); w.rej(new Error('composer worker failed')); } compWait.clear(); if (file) { compFile = false; composerW = null; } else composerW = false; };
  return composerW; }
function offThread(msg, progress, part) { const w = composerWorker(); if (!w) return null; return new Promise((res, rej) => { const id = ++compSeq; const to = setTimeout(() => { compWait.delete(id); rej(new Error('composer timeout')); }, 20000); compWait.set(id, { res, rej, to, progress, part }); w.postMessage(Object.assign({ id }, msg)); }); }
// (v9.3) a drum family's one-shots are rendered on the composer thread (~0.3 s, ~1–1.5 s on a phone) and handed to the engine, which
// plays its synthesized voices until they arrive. Asked for when a track of that family is composed, and whenever the engine asks
const bankReq = new Map(); // family@sr → 'busy' | 'sent' | failures (a number)
function requestBank(fam, sr, asked) { sr = sr || (A.ctx && A.ctx.sampleRate); if (!sr || !fam || BANK_FAMILIES.indexOf(fam) < 0) return; const k = fam + '@' + sr, st = bankReq.get(k);
  if (st === 'busy' || (st === 'sent' && !asked) || st >= 2) return; bankReq.set(k, 'busy'); // asked: the engine has not got it (a new engine after a restart)
  const p = offThread({ type: 'drumBank', family: fam, sr }); if (!p) { bankReq.set(k, 2); return; }
  p.then((bank) => { const tr = []; for (const v in bank) for (const b of bank[v]) tr.push(b.buffer); send({ type: 'drumBank', family: fam, sr, bank }, tr); bankReq.set(k, 'sent'); },
    (err) => { bankReq.set(k, (typeof st === 'number' ? st : 0) + 1); healthNote(`the ${fam} drum family could not be rendered (${err.message}) — its synthesized voices play`); }); }
// ---- export: the deck's track rendered on the composer thread (faster than real time), saved as WAV — or the mix + five stems
// in one zip (stored, no compression: WAV does not compress and the browser needs no library)
// (v9.2) the WAV headers and the zip CRCs come from the engine's bounce code (11_bounce.js), which also computes the CRC of every
// exported file on the composer thread: a stems zip is ~0.5 GB, and its CRC on this thread blocked the page for seconds
function wavBlob(pcm, sr) { return [wavHeader(pcm.byteLength, sr, pcm instanceof Float32Array), new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)]; }
const crc32 = crc32Of;
// files: { name, parts: [Uint8Array…] } or { name, blob, crc } (a file already in the browser's blob store, its CRC known)
function zipBlob(files) { const out = [], cen = []; let off = 0; const enc = new TextEncoder();
  for (const f of files) { const name = enc.encode(f.name), size = f.blob ? f.blob.size : f.parts.reduce((a, p) => a + p.length, 0), crc = f.blob ? f.crc : crc32(f.parts), lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    out.push(new Uint8Array(lh.buffer), name); if (f.blob) out.push(f.blob); else out.push(...f.parts); cen.push(new Uint8Array(ch.buffer), name); off += 30 + name.length + size; }
  const cs = cen.reduce((a, p) => a + p.length, 0), end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob(out.concat(cen, [new Uint8Array(end.buffer)]), { type: 'application/zip' }); }
// a file for the person to keep: saveFile (perform.js) uses the viewer's Downloads capability inside a Claude page (a plain <a download> is inert there) and makes an ordinary download everywhere else
function saveBlob(blob, name) { return saveFile(name, blob); }
async function exportTrack(i, stems, format) { format = format || 'wav'; const D = decks[i], s = D.score; if (!s) { toast('Load a track into this deck first'); return null; } if (D.exporting) return null; D.exporting = true;
  try { const base = `DJ-TiTo-${String(s.meta.name).replace(/[^A-Za-z0-9]+/g, '-')}-${PCN[s.meta.key].replace('#', 's')}${s.meta.mode === 'minor' ? 'm' : ''}-${Math.round(s.meta.bpm)}bpm`; // (v9.2: inside the try — a title that broke here left the deck "exporting" for the whole session)
  const ext = format === 'mp3' ? 'mp3' : 'wav', mime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav'; toast(`Rendering ${s.meta.name}${stems ? ' + stems' : ''} as ${format === 'mp3' ? 'MP3 320' : 'WAV 24-bit'}… (in the background — keep playing)`, 60000, true);
  const msg = { type: 'bounce', score: { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: s.ev }, cal: cal(s.meta.gid), sr: 44100, stems: !!stems, levelDb: outLevel(), format };
    // each finished file arrives on its own (the mix, then every stem) and goes straight into the browser's blob store: the page never
    // holds all of a stems export's audio at once
    const files = [], took = (x) => files.push({ name: `${base}-${x.name}.${x.kind === 'mp3' ? 'mp3' : 'wav'}`, blob: new Blob([x.head, new Uint8Array(x.data.buffer, x.data.byteOffset, x.data.byteLength)], { type: x.kind === 'mp3' ? 'audio/mpeg' : 'audio/wav' }), crc: x.crc });
    const p = offThread(msg, (f) => toast(`Rendering ${s.meta.name}${stems ? ' + stems' : ''}: ${Math.round(f * 100)} %`, 60000, true), took); if (!p) { toast('Export needs a worker thread (not available here)'); return null; }
    const r = await p; if (r.mix) { const k = r.mixKind, head = k === 'mp3' ? new Uint8Array(0) : wavHeader(r.mix.byteLength, r.sr, k); took({ name: 'mix', head, kind: k === 'mp3' ? 'mp3' : 'wav', data: r.mix, crc: crc32([head, new Uint8Array(r.mix.buffer, r.mix.byteOffset, r.mix.byteLength)]) }); } if (r.stems) for (const x of r.stems) { const head = x.kind === 'mp3' ? new Uint8Array(0) : wavHeader(x.data.byteLength, r.sr, true); took({ name: x.name, head, kind: x.kind === 'mp3' ? 'mp3' : 'wav', data: x.data, crc: crc32([head, new Uint8Array(x.data.buffer, x.data.byteOffset, x.data.byteLength)]) }); }
    const want = base + (stems ? '-stems.zip' : '.' + ext), mixF = files.find((f) => /-mix\.(wav|mp3)$/.test(f.name));
    if (!mixF || (stems && files.length !== 1 + BOUNCE_STEMS.length)) throw new Error('the render came back incomplete');
    const saved = stems ? await saveBlob(zipBlob(files), want) : await saveBlob(mixF.blob, want);
    // saved = the name it was saved under, false = the person declined, null = it could not be saved (saveFile has said why). A Claude page cannot save a .wav: it comes inside a .zip
    if (saved !== null) toast(`${saved === false ? 'Not saved (declined)' : 'Saved'}: ${saved || want}${saved && saved !== want ? ' — the WAV is inside this zip (a Claude page can only save certain file types)' : ''} · ${Math.floor(r.seconds / 60)}:${String(Math.round(r.seconds % 60)).padStart(2, '0')} · peak ${r.peakDb.toFixed(1)} dBFS`, 6000); return r; }
  catch (e) { toast('Export failed: ' + e.message); return null; } finally { D.exporting = false; } }
async function compileAsync(spec, opts) { const p = offThread({ type: 'compile', spec, opts: opts || {} }); if (!p) return compileSpec(spec, opts); try { return await p; } catch (e) { if (/timeout|failed/.test(e.message) && !e.validation) return compileSpec(spec, opts); throw e; } }
async function composeTrackAsync(gid, seed, opt) { requestBank(BANK_FOR_GENRE[gid]); const p = offThread({ type: 'compose', gid, seed, opt: opt || {} }); if (!p) return composeTrack(gid, seed, opt); try { return await p; } catch (e) { return composeTrack(gid, seed, opt); } }
// (v9.4) how long a new track is: Radio (about half), Club (the default: 6–8 minutes for house and techno), Extended (about 1.4×)
const TRACK_LENS = [['radio', 'Radio', 'about 3–4 minutes'], ['club', 'Club', 'the club length — 6–8 minutes for house and techno'], ['extended', 'Extended', 'longer intros, more acts — 9–11 minutes']];
const TRACK_LEN = { v: (() => { try { const x = localStorage.getItem('forge.len'); return ['radio', 'club', 'extended'].includes(x) ? x : 'club'; } catch (e) { return 'club'; } })() };
// (v9.5) Your sound is on (ui/taste.js; tools that load app.js alone run without it)
function tasteOn() { return typeof TASTE !== 'undefined' && TASTE.on; }
async function composeAsync(gid, opt) { opt = opt || {}; if (!opt.length) opt.length = TRACK_LEN.v; if (opt.mood === undefined && tasteOn() && TASTE.mood) opt.mood = TASTE.mood; /* (v9.5) the mood you picked stays */ const seed = opt.seed || (Math.random() * 2 ** 31) >>> 0, snd = paletteSounds(gid, seed, tasteOn() ? tastePref() : null);
  if (!Object.keys(snd).length || opt.palette === false) return composeTrackAsync(gid, seed, opt);
  const spec = { forge: 1, genre: gid, seed, sound: snd, length: opt.length }; if (opt.key != null) spec.key = PCN[opt.key]; if (opt.mood && MOODS[opt.mood]) spec.mood = opt.mood;
  try { return await compileAsync(spec, { fastLevels: true }); } catch (e) { return composeTrackAsync(gid, seed, opt); } }
// ---- ONE LOAD POLICY (v9.2): a deck on air — playing, or part of a mix that is armed or running — is never replaced. Measured on
// 9.1: the Perform view's "Next track → Load" and the Score tab's "Load as a new track" replaced the only playing deck (the set went
// silent), and Ask during a mix replaced the incoming deck (the outgoing one was left half faded with its bass cut for 16 s).
// deckFree(i): loading it interrupts nothing. loadTarget(i): i when free, else the other deck when that one is free, else −1.
function deckFree(i) { return !decks[i].playing && !(tx && (tx.a === i || tx.b === i)); }
function loadTarget(i) { return deckFree(i) ? i : deckFree(i ^ 1) ? i ^ 1 : -1; }
function onAirMsg(i) { return tx ? 'A mix is running — a new track can load when it has finished (or cancel the mix)' : `Deck ${'AB'[i]} is on air — load to the other deck, or pause it first`; }
async function loadDeck(i, gid, opt) {
  opt = opt || {}; const D = decks[i], other = decks[i ^ 1], otherLive = other.playing && other.score; if (!deckFree(i)) { toast(onAirMsg(i)); return null; } const tk = D.loadSeq = (D.loadSeq || 0) + 1; D.loading = gid; renderDeckHead(i);
  // harmonic mixing (v9.2): the seed is drawn first, so the key is chosen for the mode this track will really have (it was the
  // mode of seed 1: wrong for a genre with several modes — measured, 23 % of mixes two or more steps apart on the Camelot wheel)
  const seed = opt.seed || (Math.random() * 2 ** 31) >>> 0; let plan = {}; if (otherLive && opt.match !== false) { const om = other.score.meta, probe = planTrack(gid, seed); plan.key = compatibleKey(om.key, om.mode, probe.mode); }
  const s = await composeAsync(gid, Object.assign({}, plan, { seed })); if (D.loadSeq !== tk) return null; D.loading = null; // a newer load on this deck won
  if (!deckFree(i)) { renderDeckHead(i); toast(`Deck ${'AB'[i]} went on air while the track was being composed — load skipped`); return null; } // composing takes a moment: never replace a deck that went on air meanwhile
  // palette sounds start from their pre-measured level; the exact in-context match runs a moment later, off the critical path
  const out = installScore(i, s, opt); if (s.levelPending) refineInWorker(i, s); return out; }
function refineInWorker(i, s) { setTimeout(() => refineNow(i, s), 2600); }
function refineNow(i, s) { try { if (decks[i].score !== s || !s.levelPending) return; if (!analyser) analyseNow(i, s); const id = ++anaSeq; s.__refine = id; analyser.postMessage({ type: 'refine', id, deck: i, score: { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: s.ev, levelPending: s.levelPending } }); s.levelPending = null; } catch (e) { /* the table level stays */ } } // dock.js: the deck keeps an editable FORGE score of what it plays
async function playPause(i) { await startAudio(); const D = decks[i]; if (!D.score) { loadDeck(i, i ? 'techno' : 'tech-house', { play: true }); return; }
  if (D.playing) { if (tx && tx.b === i && auto.on) toast('Incoming deck paused' + autoOffByHand()); send({ type: 'pause', deck: i }); } else { const other = decks[i ^ 1];
    if (other.playing) { mixInto(i); return; } // the other deck is running: starting this one means mixing it in on the grid
    send({ type: 'play', deck: i }); } }
// mix deck b into the running deck on the next phrase (16 bars); the engine swaps the bass on the first bar line from the middle on
// where the incoming track plays bass (09_processor swapBar)
// DJ cue point for the incoming track: start it so its first full section (after the intro) arrives exactly as the mix ends —
// a 16-bar mix into a 32-bar intro starts 16 bars in (measured: starting at bar 1 left a 4–5 LU hole while the outgoing faded)
// (v9.3) THE TRANSITION LIBRARY (the engine's automateTx plays them). Smooth styles keep both tracks in the room; hard styles hand
// over on one bar line, with the incoming track's first drop landing on it. Auto picks one per mix: a big tempo jump or a change of
// genre family favours the hard styles (they hide the jump), rising energy favours the riser / drop swap, falling energy the echo /
// filter / breakdown; never one of the last five styles (so ≥ 6 different ones in any 10 mixes, by construction).
const TX_STYLES = [
  { id: 'blend', name: 'Blend + bass swap', bars: 16 }, { id: 'filter', name: 'Filter blend', bars: 16 }, { id: 'echo', name: 'Echo out', bars: 16 },
  { id: 'stems', name: 'Stem handover', bars: 32 }, { id: 'breakdown', name: 'Breakdown overlay', bars: 16 }, { id: 'tease', name: 'Tease', bars: 32 },
  { id: 'cut', name: 'Drop swap', bars: 8, hard: 1 }, { id: 'roll', name: 'Loop-roll out', bars: 8, hard: 1 }, { id: 'brake', name: 'Brake out', bars: 8, hard: 1 }, { id: 'riser', name: 'Riser bridge', bars: 8, hard: 1 }];
const TX_BY_ID = Object.fromEntries(TX_STYLES.map((x) => [x.id, x])), txHist = [];
function pickStyle(Da, Db) { const ga = GENRE_BY_ID[Da.gid] || {}, gb = GENRE_BY_ID[Db.gid] || {}, ea = SET_ENERGY[Da.gid] ?? 0.6, eb = SET_ENERGY[Db.gid] ?? 0.6, jump = Math.abs((Db.score ? Db.score.meta.bpm : Da.bpm) - Da.bpm), fam = ga.family !== gb.family;
  const w = {}; for (const x of TX_STYLES) w[x.id] = 1; const hard = jump > 6 || fam ? 2.2 : 0.6; for (const x of TX_STYLES) if (x.hard) w[x.id] *= hard;
  if (eb > ea + 0.08) { w.riser *= 2; w.cut *= 1.6; w.tease *= 1.4; w.stems *= 1.3; } else if (eb < ea - 0.08) { w.echo *= 1.8; w.filter *= 1.5; w.breakdown *= 1.6; w.brake *= 1.4; } else { w.blend *= 1.4; w.stems *= 1.4; w.filter *= 1.2; }
  if (typeof TASTE !== 'undefined' && TASTE.on) for (const id in w) w[id] *= Math.exp(0.25 * clamp(TASTE.mix[id] || 0, -3, 5)); // (v9.5) the styles you choose lean the mix your way
  for (const id of txHist) w[id] = 0; // never one of the last five: any six mixes in a row are six different styles, so any ten hold at least six
  let tot = 0; for (const id in w) tot += w[id]; let x = Math.random() * tot; for (const id in w) { x -= w[id]; if (x <= 0) return id; } return 'blend'; }
// what a mix sends: its style, its length, where the incoming track starts, where the swap line sits
// maxBars: what is left of the outgoing track — the length is settled first, the incoming cue is computed for that length
function mixPlan(Da, Db, len, want, maxBars) { const id = want && want !== 'auto' && TX_BY_ID[want] ? want : pickStyle(Da, Db), st = TX_BY_ID[id]; let bars = want === 'auto' || !len ? st.bars : len; if (st.hard) bars = Math.min(bars, 16); if (maxBars) bars = Math.max(4, Math.min(bars, maxBars));
  const S = Db.score.sections, drop = S.find((x) => x.type === 'drop') || S.find((x) => x.type !== 'intro'), fromB = st.hard && drop ? Math.max(0, drop.bar0 * 16 - Math.round(bars / 2) * 16) : cueFor(Db.score, bars);
  return { kind: id, bars, fromB, swap: st.hard ? 0.5 : undefined, name: st.name }; }
function noteStyle(id) { txHist.push(id); if (txHist.length > 5) txHist.shift(); }
function cueFor(score, len) { const first = score.sections.find((S) => S.type !== 'intro'), intro = first ? first.bar0 : 0; return Math.max(0, intro - len) * 16; }
// PHRASE LINES (v9.2): a track's phrases start where its sections start and run in q-bar steps from there — not on the absolute
// grid (measured: in 11 of the forms sections start on bar 8, 24, 40 …, and mixes, Auto moves and score swaps landed 8 bars
// into a phrase). In steps; the track's end is the last line.
function phraseLines(score, q) { const out = []; for (const S of score.sections) for (let b = 0; b < S.bars; b += q) out.push((S.bar0 + b) * 16); out.push(score.meta.bars * 16); return out; }
function nextPhrase(score, from, q) { for (const t of phraseLines(score, q)) if (t >= from) return t; return score.meta.bars * 16; }
function mixInto(b, len) { const a = b ^ 1, Da = decks[a], Db = decks[b]; if (!Da.playing || !Db.score) return; if (tx) { toast('A mix is already armed or running — cancel it first'); return; }
  len = len || auto.len; const pos = schedPos(Da), end = Da.score.meta.bars * 16; let at = nextPhrase(Da.score, pos + 32, 16);
  if (at + len * 16 > end) { at = Math.max(nextPhrase(Da.score, pos + 16, 4), end - len * 16); if (at + len * 16 > end) len = Math.max(4, Math.floor((end - at) / 16)); }
  const pl = mixPlan(Da, Db, len, $('#txKind').value, Math.floor((end - at) / 16)); len = pl.bars; noteStyle(pl.kind);
  send({ type: 'transition', from: a, deck: b, atStep: at, bars: len, kind: pl.kind, fromB: pl.fromB, swap: pl.swap });
  tx = { a, b, u: -1, at, len, sent: performance.now(), style: pl.name }; renderDeckHead(0); renderDeckHead(1); toast(`${pl.name}: ${Db.score.meta.name} in at bar ${at / 16 + 1} of deck ${'AB'[a]} — ${len} bars`); }
// CANCEL MIX (v9.2): an armed mix is disarmed; a running one is called off — the outgoing track comes back to full (fader up, EQ
// flat) and the incoming deck stops. Esc / SAFE and Auto-DJ off disarm a mix that has not started (a running mix is music: it
// finishes unless it is cancelled here). A mix called off by hand switches Auto-DJ off (review: with Auto-DJ on, a cancel was undone
// within 4–6 s — it composed another track over the cued one and armed again); the cued track stays, and Auto-DJ on brings it in
function cancelMix(onlyArmed, quiet) { if (!tx) return false; if (onlyArmed && tx.u >= 0) return false; const was = tx; send({ type: 'cancelTx' }); tx = null; auto.prepared = false; renderDeckHead(0); renderDeckHead(1);
  const off = autoOffByHand(); if (!quiet) toast((was.u < 0 ? 'Mix disarmed' : `Mix cancelled — deck ${'AB'[was.a]} back on air`) + off); return true; }
function autoOffByHand() { if (!auto.on) return ''; auto.on = false; auto.prepared = false; $('#autoOn').checked = false; return ' · Auto-DJ off, so it does not arm another mix (Auto-DJ on brings the cued track in)'; }
// Auto-DJ on / off (the switch, MIDI): off disarms a mix Auto-DJ armed and has not started; a running mix finishes
function setAutoDJ(on) { auto.on = !!on; $('#autoOn').checked = auto.on; auto.prepared = false; const dis = !auto.on && tx && tx.auto && cancelMix(true, true);
  toast(auto.on ? 'Auto-DJ on: endless mix, harmonic keys, phrase-aligned' : `Auto-DJ off${dis ? ' — its armed mix is disarmed' : tx ? ' — the running mix finishes (Cancel mix stops it)' : ''}`); }
function reroll(i) { const D = decks[i]; if (!D.spec) return; // new variation: drum/bass/hook choices re-drawn; everything you wrote or edited stays
  D.spec.variation = (Math.random() * 2 ** 31) >>> 0; delete D.spec.melodySeed; return commitSpec(i, { q: 1 }).then((s) => { if (s) toast('New variation from the next bar — your edits and written melodies stay'); renderDockSoon(); return s; }); }
function jumpTo(i, secIdx) { const D = decks[i]; if (!D.score) return; const S = D.score.sections[secIdx]; if (!S) return;
  if (!D.playing) { send({ type: 'seek', deck: i, step: S.bar0 * 16 }); D.pos = S.bar0 * 16; return; }
  const q = 4 * 16, at = Math.ceil((schedPos(D) + 1) / q) * q; send({ type: 'jump', deck: i, atStep: at, step: S.bar0 * 16 }); D.pendJump = at; toast(`Jump to ${S.type} on the next 4-bar line`); }
function setLoop(i, bars) { const D = decks[i]; if (!D.score) return;
  if (!bars || D.loop === bars) { D.loop = 0; send({ type: 'loop', deck: i, from: -1, to: -1 }); renderDeckHead(i); return; }
  const len = bars * 16, from = Math.floor(livePos(D) / len) * len; D.loop = bars; D.loopFrom = from; send({ type: 'loop', deck: i, from, to: from + len }); renderDeckHead(i); }

// ---------------------------------------------------------------- auto-DJ
// the set brain (composer.js planNext) decides; the set remembers what it played, the energy it started at and the track count
function pickNext(gid) { if (!auto.hist || !auto.hist.length || auto.hist[auto.hist.length - 1] !== gid) (auto.hist = auto.hist || []).push(gid); if (auto.home == null) { auto.home = SET_ENERGY[gid] ?? 0.6; auto.homeFam = (GENRE_BY_ID[gid] || {}).family; auto.homeBpm = decks[lead].bpm; }
  const r = planNext(gid, { journey: auto.journey, hist: auto.hist, bpm: decks[lead].bpm, home: auto.home, homeFam: auto.homeFam, homeBpm: auto.homeBpm, step: auto.step = (auto.step || 0) + 1, pref: tasteOn() ? TASTE.genres : null }); auto.why = r.why; auto.hist.push(r.gid); if (auto.hist.length > 12) auto.hist.shift(); return r.gid; }
// where Auto-DJ starts a mix: half of it over the outgoing track's last full section, half over its outro — the room keeps the
// running track's body while the next one arrives (mixing over the bare outro measured a 2–3 LU dip for the whole mix)
function autoMixAt(score, len) { const end = score.meta.bars * 16, out = score.sections[score.sections.length - 1], outAt = out && out.type === 'outro' ? out.bar0 * 16 : end;
  return Math.max(16 * 16, Math.min(end - len * 16, outAt - Math.round(len / 2) * 16)); }
function autoTick() { if (!auto.on) return; const Da = decks[lead], b = lead ^ 1, Db = decks[b]; if (!Da.playing || !Da.score || tx) return;
  const end = Da.score.meta.bars * 16, pos = livePos(Da), at = autoMixAt(Da.score, auto.len);
  if (!auto.prepared && pos > at - 12 * 16 && !Db.playing) { auto.prepared = true; const L = lead;
    // (v9.2 review) a track already waiting on the other deck — loaded by hand, or cued for a mix that was called off (with your edits) —
    // is the one mixed in; Auto-DJ used to compose another one over it
    const waiting = Db.score && Db.fresh && !Db.loading; if (waiting) { auto.why = `${Db.score.meta.name}, waiting on deck ${'AB'[b]}`; const h = auto.hist = auto.hist || []; if (h[h.length - 1] !== Da.gid) h.push(Da.gid); h.push(Db.gid); if (h.length > 12) h.shift(); }
    (waiting ? Promise.resolve(Db.score) : libNext(b) || loadDeck(b, pickNext(Da.gid), { play: false })).then((s) => { if (!s || !auto.on || tx || Db.playing || !Da.playing) { auto.prepared = false; return; }
    // (v9.2) the mix point may have passed meanwhile (a jump to the outro, a slow composition): the mix then starts on the next 4-bar
    // line and is shortened to what is left of the track — it started at once, off the beat, half done (measured: 3 sixteenths off)
    let at2 = at, len2 = auto.len; const now = schedPos(Da); if (at2 < now + 8) { at2 = nextPhrase(Da.score, now + 16, 4); len2 = Math.min(auto.len, Math.max(4, Math.floor((end - at2) / 16))); }
    const pl = mixPlan(Da, Db, len2, $('#txKind').value, Math.floor((end - at2) / 16)); len2 = pl.bars; noteStyle(pl.kind);
    send({ type: 'transition', from: L, deck: b, atStep: at2, bars: len2, kind: pl.kind, fromB: pl.fromB, swap: pl.swap }); tx = { a: L, b, u: -1, at: at2, len: len2, sent: performance.now(), auto: true, style: pl.name };
    toast(`Auto-DJ · ${pl.name} · ${(auto.why || s.meta.name).replace(/ \(the set reaches for [\d.]+\)/, '')} · the mix starts on bar ${at2 / 16 + 1}`); }); } }

// ---------------------------------------------------------------- UI: decks
function deckEl(i) { return $(`.deck[data-d="${i}"]`); }
function renderDeckHead(i) { const D = decks[i], el = deckEl(i); if (!el) return; const s = D.score; el.classList.toggle('empty', !s);
  setText($('.dtitle h2', el), s ? s.meta.name : D.loading ? `Composing ${(GENRE_BY_ID[D.loading] || { name: 'a track' }).name}…` : 'Empty deck'); el.classList.toggle('loading', !!D.loading);
  $('.dmeta', el).innerHTML = s ? `<span><b>${PCN[s.meta.key]} ${esc(s.meta.mode)}</b></span><span><b class="bpmv">${(D.bpm || s.meta.bpm).toFixed(1)}</b> BPM</span><span>${esc(s.meta.prog.join(' – '))}</span><span>${s.meta.bars} bars</span><span>seed ${s.meta.seed.toString(36)}</span><span title="Per-track auto-gain from a pre-render of the peak section">gain ${D.trimNA ? 'calibrated (no analysis here)' : D.trim == null ? 'analysing…' : (D.trim >= 0 ? '+' : '') + D.trim.toFixed(1) + ' dB'}</span>` : '<span>Pick a genre below, or press Play for a default track</span>';
  $('.dna', el).innerHTML = s ? dnaLine(s) : '';
  $$('.loopb', el).forEach((b) => b.classList.toggle('on', +b.dataset.l === D.loop));
  const jr = $('.jumps', el); jr.innerHTML = '<span class="lbl">Jump</span>' + (s ? s.sections.map((S, k) => `<button class="btn jb" data-k="${k}" title="bar ${S.bar0 + 1}, ${S.bars} bars">${esc(S.type)}<span style="color:var(--faint)"> ${S.bar0 + 1}</span></button>`).join('') : '');
  $$('.jb', jr).forEach((b) => b.onclick = () => jumpTo(i, +b.dataset.k));
  if (s) { $('.cmood', el).value = (D.spec && D.spec.mood) || ''; if (document.activeElement !== $('.cb', el)) $('.cb', el).value = (D.bpm || s.meta.bpm).toFixed(1); $('.energy', el).value = D.energy != null ? D.energy : 0.5; }
  $('.ctl', el).hidden = !s; $('.parts', el).hidden = !s; if (typeof renderPerf === 'function') renderPerf(); }
// mood: the feeling picks the harmony (mode, progression, colour) — the explicit harmony is dropped so the mood can choose
function setMood(i, mood) { const D = decks[i]; if (!D.spec) return; tasteMood(mood); const sp = D.spec; if (mood) sp.mood = mood; else delete sp.mood;
  if (sp.harmony) { delete sp.harmony.progression; delete sp.harmony.extension; delete sp.harmony.barsPerChord; delete sp.harmony.breakBarsPerChord; } delete sp.mode; for (const f of sp.form) delete f.progression;
  return commitSpec(i, { q: 4 }).then((s) => { if (s) toast(`${mood ? mood[0].toUpperCase() + mood.slice(1) : 'Genre'} harmony — ${s.meta.prog.join(' – ')} · from bar ${D.swapAt / 16 + 1}`); renderDockSoon(); return s; }); }
function setBpmLive(i, bpm) { const D = decks[i]; if (!D.spec) return; D.spec.bpm = Math.max(60, Math.min(200, Math.round(bpm * 2) / 2)); commitSpec(i, { q: 1 }); renderDock(); }
// one part re-drawn (its own random stream), everything else identical — lands on the next 4-bar line
function regenPart(i, part, q, extra) { const D = decks[i]; if (!D.spec) return; const n = (Math.random() * 2 ** 31) >>> 0; if (extra && extra.complexity != null) D.spec.complexity = Math.round(extra.complexity * 100) / 100;
  if (part === 'lead') D.spec.melodySeed = n; // melodies you wrote as text stay
  else { D.spec.seeds = Object.assign({}, D.spec.seeds || {}, { [part]: n }); }
  return commitSpec(i, { q: q || 4 }).then((s) => { if (s && !q) toast(`New ${part === 'lead' ? 'melody' : part} from bar ${D.swapAt / 16 + 1} — everything else stays`); renderDockSoon(); return s; }); }
function dnaLine(s) { const G = GENRE_BY_ID[s.meta.gid]; const sw = G.swing > 50 ? `swing ${G.swing}%` : 'straight 16ths';
  const k = G.drums.main[0].k || '', kick = k === 'X...X...X...X...' ? 'four-on-the-floor' : k ? 'broken kick' : 'no kick';
  return `<span class="lbl">DNA</span> ${G.bpm[0]}–${G.bpm[1]} BPM · ${sw} · ${kick} · chords: ${G.chords.role} · lead: ${G.lead ? G.lead.role : 'none'} · harmony every ${G.harm.hr} bar${G.harm.hr > 1 ? 's' : ''}`; }
function setMute(i, c, on) { const D = decks[i]; D.mute[c] = !!on; send({ type: 'mute', deck: i, ch: c, on: !!on }); renderStems(i); }
function renderStems(i) { const D = decks[i], el = $('.stems', deckEl(i)); const used = new Array(11).fill(false);
  if (D.score) { const ev = D.score.ev; for (let k = 0; k < ev.n; k++) used[ev.ch[k]] = true; }
  const SLOT = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'arp', 'fx', 'fx'], TAB = { fx: 'fx', chords: 'chords' }; // every part that plays has a way in: its sound (or, for the risers and the texture, the FX page)
  el.innerHTML = STEM_NAMES.map((n, c) => `<div class="stemw"><button class="stem${D.mute[c] ? ' mute' : ''}${used[c] ? '' : ' void'}" data-c="${c}" ${used[c] ? '' : 'disabled'} title="${used[c] ? 'Mute / unmute' : 'Not used by this genre'}"><canvas width="6" height="28"></canvas>${n}</button>${used[c] && SLOT[c] ? `<button class="sted" data-slot="${SLOT[c]}" title="${SLOT[c] === 'fx' ? 'Risers, impacts and the texture: the FX page (sends, rack, throws)' : SLOT[c] === 'chords' ? 'Chords and stabs: role, rhythm, sound, pad, space' : 'Edit the ' + SLOT[c] + ' sound'}" aria-label="Edit ${SLOT[c]}">✎</button>` : ''}</div>`).join('');
  $$('.stem', el).forEach((b) => b.onclick = () => { const c = +b.dataset.c; setMute(i, c, !D.mute[c]); });
  $$('.sted', el).forEach((b) => b.onclick = () => { const sl = b.dataset.slot; if (sl === 'fx') { SHELL.fxDeck = i; go('fx'); renderBeatFx(); return; } DOCK.deck = i; DOCK.tab = Object.keys(PART_SLOTS).find((t) => PART_SLOTS[t].includes(sl)) || 'drums'; DOCK.page = 'mix'; DOCK.slot = sl; DOCK.open = true; renderDock(); go('edit'); }); } // (v9.3) a part's edit button opens its Mix page (level, Delay, Reverb; Sound is one tap away)
function buildDeck(i) {
  const el = document.createElement('section'); el.className = 'deck'; el.dataset.d = i;
  el.innerHTML = `<div class="dhead"><div class="dtag">${'AB'[i]}</div><div class="dtitle"><h2>Empty deck</h2><div class="dmeta"></div></div><span class="dstate">stopped</span></div>
    <div class="dempty"><p>Nothing on this deck yet. Pick a genre — it composes a new track — or choose one in the library below.</p><div class="chips">${['deep-house', 'techno', 'melodic-techno', 'trance', 'dnb', 'progressive-house', 'afro-house', 'downtempo'].map((g) => `<button class="btn" data-quick="${g}">${(GENRE_BY_ID[g] || { name: g }).name}</button>`).join('')}</div></div>
    <canvas class="map" height="118" aria-label="Arrangement map: click a section to jump"></canvas>
    <div class="row"><button class="btn big play" data-act="play">Play</button><button class="btn" data-act="mix" title="Mix this deck into the other one on the next phrase">Mix in</button><button class="btn" data-act="save" title="Save this track — with your edits, Mangle and hot cues — to My library (SET)">Save</button><button class="btn" data-act="reroll" title="New melodies and patterns from the next bar">New variation</button><button class="btn" data-export="mp3" title="Render the whole track to an MP3 (320 kbit/s, joint stereo) — DJ TiTo's own encoder, in the background">MP3</button><button class="btn" data-export="wav" title="Render the whole track to a 24-bit WAV file — in the background, faster than real time">WAV</button><button class="btn" data-export="stems" title="The mix + five stems (drums, bass, chords+pad, lead+arp, fx) as WAV files in one zip — ready for a DAW">Stems</button>
      <span class="loopgrp"><span class="sep"></span><span class="lbl">Loop</span>${[4, 8, 16].map((l) => `<button class="btn loopb" data-l="${l}">${l}</button>`).join('')}</span></div>
    <div class="row jumps"></div>
    <div class="row ctl"><span class="lbl">Mood</span><select class="btn cmood" aria-label="Mood"><option value="">Genre</option>${Object.keys(MOODS).map((m) => `<option value="${m}">${m[0].toUpperCase() + m.slice(1)}</option>`).join('')}</select>
      <span class="lbl" title="Thins hats, perc and arp fills and pulls the melodic parts back (low) or pushes them forward (high) — live, no recompose">Energy</span><input class="energy" type="range" min="0" max="1" step="0.01" value="0.5" aria-label="Energy">
      <span class="lbl">BPM</span><input class="btn cb" id="cb${i}" type="number" min="60" max="200" step="0.5" aria-label="Tempo" style="width:72px"></div>
    <div class="row parts"><span class="lbl">New</span>${[['drums', 'Drums'], ['bass', 'Bass'], ['chords', 'Chords'], ['lead', 'Melody']].map(([k, l]) => `<button class="btn" data-part="${k}" aria-label="New ${l.toLowerCase()}" title="Re-draw only the ${l.toLowerCase()} — same key, chords and form — from the next 4-bar line">${l}</button>`).join('')}
</div>
    <canvas class="steps" height="104" aria-label="Current bar: every event of the score"></canvas>
    <div class="stems"></div><div class="note dna"></div>`;
  $$('[data-quick]', el).forEach((b) => b.onclick = async () => { await startAudio(); loadDeck(i, b.dataset.quick, { play: !decks[i ^ 1].playing }); });
  $('[data-act=play]', el).onclick = () => playPause(i);
  $$('[data-export]', el).forEach((b) => b.onclick = () => exportTrack(i, b.dataset.export === 'stems' || b.dataset.export === 'stems-mp3', /mp3/.test(b.dataset.export) ? 'mp3' : 'wav'));
  $('[data-act=mix]', el).onclick = async () => { await startAudio(); const D = decks[i]; if (!D.score) { toast('Load a genre into this deck first'); return; } if (!decks[i ^ 1].playing) { playPause(i); return; } mixInto(i); };
  $('[data-act=reroll]', el).onclick = () => reroll(i); $('[data-act=save]', el).onclick = () => saveDeckToLib(i);
  $('.cmood', el).onchange = (e) => setMood(i, e.target.value);
  $('.cb', el).onchange = (e) => setBpmLive(i, +e.target.value); $('.cb', el).onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
  $('.energy', el).oninput = (e) => { decks[i].energy = +e.target.value; send({ type: 'energy', deck: i, v: decks[i].energy }); };
  $$('[data-part]', el).forEach((b) => b.onclick = () => regenPart(i, b.dataset.part));
  $$('.loopb', el).forEach((b) => b.onclick = () => setLoop(i, +b.dataset.l));
  $('.map', el).onclick = (e) => { const D = decks[i]; if (!D.score) return; const r = e.currentTarget.getBoundingClientRect(); const bar = (e.clientX - r.left) / r.width * D.score.meta.bars; const k = D.score.sections.findIndex((S) => bar >= S.bar0 && bar < S.bar0 + S.bars); if (k >= 0) jumpTo(i, k); };
  return el; }

// ---------------------------------------------------------------- drawing
function fitCanvas(c) { let r = GEO.get(c); if (!r) { r = c.getBoundingClientRect(); if (GEO_RO) { GEO.set(c, { width: r.width, height: r.height }); GEO_RO.observe(c); } } const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(10, Math.round(r.width * dpr)), h = Math.round(r.height * dpr); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return dpr; }
const ENERGY = { drums0: 0.3, drums1: 0.5, intro: 0.35, groove: 0.75, groove2: 0.85, verse: 0.65, break: 0.45, break2: 0.4, build: 0.7, drop: 1, outro: 0.45, chillA: 0.6, chillB: 0.75, ambA: 0.35, ambB: 0.55 };
// (v9.4) the map's still part — sections, ruler, chord lane — is drawn once per score and size into its own canvas; each frame copies it
// and draws only what moves (measured: drawMap was the main thread's biggest cost in a live set, every bar's chord redrawn 30 times a
// second for both decks, and Club tracks have twice the bars)
const MAPC = [null, null];
function drawMap(i) { const D = decks[i], c = $('.map', deckEl(i)), g = c.getContext('2d'), dpr = fitCanvas(c), W = c.width, H = c.height; g.clearRect(0, 0, W, H); if (!D.score || !W || !H) return; /* (a hidden map has no size: a 0-pixel canvas cannot be copied) */
  const s = D.score, bars = s.meta.bars, x = (bar) => bar / bars * W, laneH = 16 * dpr, top = 14 * dpr, bodyH = H - top - laneH - 4 * dpr;
  const key = (document.documentElement.dataset.theme || '') + (document.fonts ? document.fonts.status : ''); let mc = MAPC[i];
  if (!mc || mc.s !== s || mc.W !== W || mc.H !== H || mc.key !== key) { const oc = (mc && mc.c) || document.createElement('canvas'); oc.width = W; oc.height = H; drawMapStill(oc.getContext('2d'), s, W, H, dpr); MAPC[i] = mc = { c: oc, s, W, H, key }; }
  g.drawImage(mc.c, 0, 0);
  dynMap(g, D, i, x, top, bodyH, H, dpr); }
function drawMapStill(g, s, W, H, dpr) { const bars = s.meta.bars, x = (bar) => bar / bars * W, laneH = 16 * dpr, top = 14 * dpr, bodyH = H - top - laneH - 4 * dpr;
  g.clearRect(0, 0, W, H); g.font = `${10 * dpr}px Azeret Mono, monospace`; g.textBaseline = 'top';
  for (const S of s.sections) { const e = ENERGY[S.layer] ?? 0.6, h = bodyH * (0.25 + 0.75 * e), x0 = x(S.bar0), w = x(S.bar0 + S.bars) - x0;
    g.fillStyle = css(SECTION_COL[S.type] || '--s-intro'); g.fillRect(x0 + 1, top + bodyH - h, w - 2, h);
    if (w > g.measureText(S.type.toUpperCase()).width + 8 * dpr) { g.fillStyle = 'rgba(235,230,220,.85)'; g.fillText(S.type.toUpperCase(), x0 + 4 * dpr, top + bodyH - h + 3 * dpr); } }
  // bar ruler (16-bar phrases)
  g.fillStyle = css('--faint'); for (let b = 0; b <= bars; b += 16) { g.fillRect(x(b), 0, 1, 5 * dpr); if (b < bars && x(b + 16) - x(b) > 22 * dpr) g.fillText(String(b + 1), x(b) + 2 * dpr, 2 * dpr); }
  // chord lane
  const ly = H - laneH; g.fillStyle = css('--panel2'); g.fillRect(0, ly, W, laneH); let last = '';
  for (let b = 0; b < bars; b++) { const ch = s.chords[b]; g.fillStyle = `hsla(${ch.root * 30},38%,${ch.q === 'min' ? 30 : 40}%,0.9)`; g.fillRect(x(b), ly, x(b + 1) - x(b) + 0.5, laneH); } g.fillStyle = css('--text');
  const ch = []; for (let b = 0; b < bars; b++) { const l = s.chords[b].label; if (l !== last) { last = l; ch.push([b, l]); } }
  for (let k = 0; k < ch.length; k++) { const [b, l] = ch[k], nb = k + 1 < ch.length ? ch[k + 1][0] : bars; g.fillRect(x(b), ly, 1, laneH); if (x(nb) - x(b) > g.measureText(l).width + 6 * dpr) g.fillText(l, x(b) + 2 * dpr, ly + 3 * dpr); } } // a label only where it fits its own span
function dynMap(g, D, i, x, top, bodyH, H, dpr) {
  // played shade, loop, pending jump, transition window, playhead
  const p = livePos(D) / 16; g.fillStyle = 'rgba(14,17,21,.45)'; g.fillRect(0, top, x(p), bodyH);
  if (D.loop) { g.fillStyle = 'rgba(235,230,220,.12)'; g.fillRect(x(D.loopFrom / 16), top, x(D.loop), bodyH); }
  if (D.pendJump >= 0 && p < D.pendJump / 16) { g.fillStyle = css('--warn'); g.fillRect(x(D.pendJump / 16), top, 2 * dpr, bodyH); } else D.pendJump = -1;
  if (tx && tx.a === i && tx.at != null) { g.strokeStyle = css(i ? '--a' : '--b'); g.setLineDash([4 * dpr, 3 * dpr]); g.strokeRect(x(tx.at / 16), top + 1, x(tx.len), bodyH - 2); g.setLineDash([]); }
  g.fillStyle = css(i ? '--b' : '--a'); g.fillRect(x(p) - dpr, 0, 2 * dpr, H); }
function drawSteps(i) { const D = decks[i], c = $('.steps', deckEl(i)), g = c.getContext('2d'), dpr = fitCanvas(c), W = c.width, H = c.height; g.clearRect(0, 0, W, H); if (!D.score) return;
  const ev = D.score.ev, pos = livePos(D), bar = Math.floor(pos / 16), t0 = bar * 16, rows = [[0, 'KICK'], [1, 'SNARE'], [2, 'HATS'], [3, 'PERC'], [4, 'BASS'], [7, 'LEAD']], lw = 44 * dpr, rh = (H - 4 * dpr) / rows.length, sw = (W - lw) / 16;
  g.font = `${9 * dpr}px Azeret Mono, monospace`; g.textBaseline = 'middle';
  for (let s = 0; s < 16; s++) { g.fillStyle = s % 4 === 0 ? 'rgba(235,230,220,.06)' : 'rgba(235,230,220,.025)'; g.fillRect(lw + s * sw + 1, 2 * dpr, sw - 2, H - 4 * dpr); }
  const ps = pos - t0; g.fillStyle = decks[i].i ? 'rgba(99,199,230,.18)' : 'rgba(240,162,59,.18)'; g.fillRect(lw + Math.floor(ps) * sw, 0, sw, H);
  rows.forEach(([ch, name], r) => { g.fillStyle = css('--faint'); g.fillText(name, 4 * dpr, 2 * dpr + rh * (r + 0.5)); });
  let lo = 0, hi = ev.n; while (lo < hi) { const m = (lo + hi) >> 1; if (ev.t[m] < t0) lo = m + 1; else hi = m; }
  const col = i ? [99, 199, 230] : [240, 162, 59]; let bassLo = 99, bassHi = 0, leadLo = 127, leadHi = 0;
  for (let k = lo; k < ev.n && ev.t[k] < t0 + 16; k++) { if (ev.ch[k] === 4) { bassLo = Math.min(bassLo, ev.a[k]); bassHi = Math.max(bassHi, ev.a[k]); } if (ev.ch[k] === 7) { leadLo = Math.min(leadLo, ev.a[k]); leadHi = Math.max(leadHi, ev.a[k]); } }
  for (let k = lo; k < ev.n && ev.t[k] < t0 + 16; k++) { const ch = ev.ch[k], r = rows.findIndex((x) => x[0] === ch); if (r < 0) continue; const xx = lw + (ev.t[k] - t0) * sw, y = 2 * dpr + rh * r, a = 0.35 + 0.65 * Math.min(1, ev.v[k]);
    g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
    if (ch === 4 || ch === 7) { const lo2 = ch === 4 ? bassLo : leadLo, hi2 = ch === 4 ? bassHi : leadHi, span = Math.max(1, hi2 - lo2), yy = y + (rh - 5 * dpr) * (1 - (ev.a[k] - lo2) / span) + 1 * dpr; g.fillRect(xx + 1, yy, Math.max(3 * dpr, ev.d[k] * sw - 2), 4 * dpr); }
    else { const w = Math.max(3 * dpr, sw * 0.42), hh = (rh - 6 * dpr) * (ch === 2 ? 0.6 + 0.4 * ev.v[k] : 1); g.fillRect(xx + 1, y + (rh - hh) / 2, w, hh); } } }
function drawStemMeters(i) { const D = decks[i]; $$('.stem canvas', deckEl(i)).forEach((c, k) => { const g = c.getContext('2d'); g.clearRect(0, 0, 6, 28); const v = Math.min(1, Math.sqrt(D.peaks[k])); g.fillStyle = 'rgba(235,230,220,.12)'; g.fillRect(0, 0, 6, 28); g.fillStyle = v > 0.97 ? css('--crit') : (i ? css('--b') : css('--a')); g.fillRect(0, 28 - 28 * v, 6, 28 * v); }); }
function drawTele() { if (!meter) return; const m = meter; const L = $('#lufs'), g = L.getContext('2d'), dpr = fitCanvas(L), W = L.width, H = L.height; g.clearRect(0, 0, W, H);
  const sc = (db) => Math.max(0, Math.min(1, (db + 30) / 30)) * W; g.fillStyle = css('--well'); g.fillRect(0, 0, W, H);
  g.fillStyle = css('--good'); g.fillRect(0, 2 * dpr, sc(m.lufsM), H / 2 - 3 * dpr); g.fillStyle = css('--dim'); g.fillRect(0, H / 2 + 1 * dpr, sc(m.lufsS), H / 2 - 3 * dpr);
  const D = decks[lead]; if (D.score) { const t = D.score.mix.lufs; g.fillStyle = css('--warn'); g.fillRect(sc(t) - dpr, 0, 2 * dpr, H); }
  setText($('#tLufs'), `${m.lufsM.toFixed(1)} / ${m.lufsS.toFixed(1)}`); setText($('#tTp'), `${Math.max(-60, m.tp).toFixed(1)} dBTP`); setText($('#tGr'), `${m.gr.toFixed(1)} dB`); setText($('#tCorr'), (isFinite(m.corr) ? m.corr : 0).toFixed(2));
  setText($('#tBpm'), decks[lead].bpm ? decks[lead].bpm.toFixed(1) : '—'); if (m.load != null) setText($('#tLoad'), Math.round(m.load * 100) + ' %' + (m.eco ? ' · eco' : '')); setText($('#tLat'), A.lat ? A.lat.toFixed(1) + ' ms' : '—');
  if (tx && meter.tx) { tx.u = meter.tx.u; setW($('#txbar'), Math.max(0, tx.u) * 100 + '%'); setText($('#txinfo'), tx.u < 0 ? `Mix armed: starts on bar ${tx.at / 16 + 1} of deck ${'AB'[tx.a]}` : `Mixing ${'AB'[tx.a]} → ${'AB'[tx.b]} · ${Math.round(tx.u * 100)} %${tx.u >= (meter.tx.sw ?? 0.5) ? ' · bass swapped' : ` · bass swaps at ${Math.round((meter.tx.sw ?? 0.5) * 100)} %`}`); }
  else { setW($('#txbar'), '0px'); const Dl = decks[lead]; let msg = 'Press “Mix in” on the idle deck to blend it in on the next phrase. Keys: Space play · M mix · 1–9 jump · D/B/C/N new part · Shift+1–6 FX · [ ] energy · ? all keys';
    if (auto.on && Dl.score && Dl.playing) { const left = (Dl.score.meta.bars - auto.len - 12) * 16 - livePos(Dl), sec = Math.max(0, left / (Dl.bpm / 15)); msg = `Auto-DJ: next track is picked and cued in ${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}, then mixed over ${auto.len} bars`; }
    setText($('#txinfo'), msg); }
  { const tc = $('#txCancel'); if (tc && tc.hidden !== !tx) tc.hidden = !tx; } }
// canvases redraw at ≤ 30 fps and not at all in a hidden tab (idea from a GPT pass over this code): audio timing lives in the
// worklet and never depends on this loop; less main-thread work also protects the ScriptProcessor fallback
let lastVisual = 0;
function frame(now) { if (document.visibilityState === 'hidden' || now - lastVisual < 1000 / 30) { requestAnimationFrame(frame); return; } lastVisual = now;
  for (let i = 0; i < 2; i++) { drawMap(i); drawSteps(i); drawStemMeters(i); const D = decks[i], el = deckEl(i); el.classList.toggle('lead', D.playing && lead === i);
    const st = $('.dstate', el); setText(st, D.loading && !D.playing ? 'loading…' : D.playing ? (tx && tx.b === i && tx.u < 0 ? 'cued' : 'playing') : (D.ended ? 'ended' : D.score ? 'ready' : 'empty')); st.classList.toggle('play', D.playing);
    setText($('[data-act=play]', el), D.playing ? 'Pause' : 'Play'); const bv = $('.bpmv', el); if (bv && D.bpm) setText(bv, D.bpm.toFixed(1)); }
  drawTele(); dockFrame(); shellFrame(now); requestAnimationFrame(frame); }

// ---------------------------------------------------------------- mixer controls
function knob(el, opt) { const c = document.createElement('canvas'); c.className = 'knob'; c.width = 88; c.height = 88; c.tabIndex = 0; c.setAttribute('role', 'slider'); c.setAttribute('aria-label', opt.label);
  let v = opt.value; const draw = () => { const g = c.getContext('2d'); g.clearRect(0, 0, 88, 88); const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, t = (v - opt.min) / (opt.max - opt.min), mid = (0 - opt.min) / (opt.max - opt.min);
    g.lineWidth = 7; g.lineCap = 'round'; g.strokeStyle = css('--line2'); g.beginPath(); g.arc(44, 44, 32, a0, a1); g.stroke();
    g.strokeStyle = opt.color; g.beginPath(); const am = a0 + (a1 - a0) * mid, av = a0 + (a1 - a0) * t; g.arc(44, 44, 32, Math.min(am, av), Math.max(am, av) + 0.0001); g.stroke();
    g.fillStyle = css('--panel2'); g.beginPath(); g.arc(44, 44, 22, 0, 7); g.fill(); g.strokeStyle = css('--text'); g.lineWidth = 4; g.beginPath(); g.moveTo(44 + Math.cos(av) * 8, 44 + Math.sin(av) * 8); g.lineTo(44 + Math.cos(av) * 20, 44 + Math.sin(av) * 20); g.stroke();
    c.setAttribute('aria-valuenow', v.toFixed(2)); };
  const set = (nv, raw) => { v = Math.max(opt.min, Math.min(opt.max, nv)); if (!raw && Math.abs(v) < (opt.max - opt.min) * 0.02) v = 0; draw(); opt.onchange(v); }; // raw: an encoder's step — no snap to the centre
  let y0 = 0, v0 = 0; c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); y0 = e.clientY; v0 = v; });
  c.addEventListener('pointermove', (e) => { if (!c.hasPointerCapture(e.pointerId)) return; set(v0 + (y0 - e.clientY) / 140 * (opt.max - opt.min)); });
  c.addEventListener('dblclick', () => set(0)); c.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') set(v + (opt.max - opt.min) / 40); if (e.key === 'ArrowDown') set(v - (opt.max - opt.min) / 40); if (e.key === '0') set(0); });
  draw(); el.appendChild(c); const l = document.createElement('div'); l.className = 'klbl'; l.textContent = opt.label; el.appendChild(l); return { set }; }
const MK = [{}, {}]; // mixer knobs per deck (the controller layer drives them so the screen follows the hardware)
function buildMixer() { const wrap = $('.chans');
  for (let i = 0; i < 2; i++) { const ch = document.createElement('div'); ch.className = 'chan'; ch.dataset.d = i; ch.innerHTML = `<div class="t">${'AB'[i]}</div><div class="knobs"></div>`; wrap.appendChild(ch); const col = i ? css('--b') : css('--a'), kb = $('.knobs', ch);
    const kn = () => { const w = document.createElement('div'); w.className = 'kn'; kb.appendChild(w); return w; }; // each knob with its label in one cell: the strip can be a column (desktop) or a 2 × 2 block (tablet)
    for (const band of ['high', 'mid', 'low']) MK[i][band] = knob(kn(), { label: band.toUpperCase(), min: -30, max: 6, value: 0, color: col, onchange: (v) => { decks[i].eq[band] = v; send({ type: 'eq', deck: i, [band]: v }); } });
    { const cell = kn(), sel = document.createElement('select'); sel.className = 'btn colorkind'; sel.setAttribute('aria-label', `Deck ${'AB'[i]} Color FX`); sel.innerHTML = [['filter', 'Filter'], ['dub', 'Dub'], ['space', 'Space'], ['noise', 'Noise'], ['crush', 'Crush']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
      sel.onchange = () => { decks[i].colorKind = sel.value; send({ type: 'color', deck: i, kind: sel.value, v: decks[i].filter || 0 }); }; cell.appendChild(sel);
      // (v9.3) COLOR FX: the filter knob with a colour — Filter, Dub echo, Space, Noise, Crush; centre = off (MIX screen)
      MK[i].filter = knob(cell, { label: 'COLOR', min: -1, max: 1, value: 0, color: col, onchange: (v) => { decks[i].filter = v; send({ type: 'color', deck: i, kind: decks[i].colorKind || 'filter', v }); } }); }
    const f = document.createElement('input'); f.type = 'range'; f.min = 0; f.max = 1; f.step = 0.01; f.value = 1; f.className = 'fader'; f.id = 'fader' + i; f.setAttribute('aria-label', `Deck ${'AB'[i]} volume`); f.oninput = () => { decks[i].fader = +f.value; sendGains(); }; ch.appendChild(f); }
  $('#xf').oninput = sendGains; }
// (v9.3) the v9.2 mix strip (a bar that appeared when the mixer scrolled away) is gone: the MIX screen holds the faders, always
function sendGains() { const x = +$('#xf').value; for (let i = 0; i < 2; i++) { const xg = i === 0 ? Math.cos((x + 1) * Math.PI / 4) : Math.sin((x + 1) * Math.PI / 4); send({ type: 'gain', deck: i, v: decks[i].fader * xg * Math.SQRT2 }); } }

// ---------------------------------------------------------------- library
let famFilter = 'all';
function buildLibrary() { const fams = ['all', 'songs', ...new Set(GENRES.map((g) => g.family))]; $('.fams').innerHTML = fams.map((f) => `<button class="fam${f === famFilter ? ' on' : ''}" data-f="${f}">${f === 'all' ? 'All ' + GENRES.length : f === 'songs' ? 'Written songs ' + SONGS.length : FAMILY_NAME[f] || f}</button>`).join('');
  if (famFilter === 'songs') { $$('.fam').forEach((b) => b.onclick = () => { famFilter = b.dataset.f; buildLibrary(); });
    $('.tiles').innerHTML = SONGS.map((sg, k) => { const G = GENRE_BY_ID[sg.genre]; return `<div class="tile song" style="--fc:${FAMILY_COL[G.family] || '#888'}"><span class="n">${esc(sg.title)}</span><span class="m">${esc(G.name)} · ${sg.key} ${sg.mode} · ${sg.bpm} BPM</span><div class="acts"><button data-d="0" data-k="${k}" aria-label="Load ${esc(sg.title)} to deck A">A</button><button data-d="1" data-k="${k}" aria-label="Load ${esc(sg.title)} to deck B">B</button></div></div>`; }).join('');
    $$('.tile .acts button').forEach((b) => b.onclick = async () => { await startAudio(); const i = +b.dataset.d; if (!deckFree(i)) { toast(onAirMsg(i)); return; }
      const s = await compileAsync(JSON.parse(JSON.stringify(SONGS[+b.dataset.k]))); if (deckFree(i)) installScore(i, s, { play: !decks[i ^ 1].playing }); else toast(onAirMsg(i)); }); return; }
  $$('.fam').forEach((b) => b.onclick = () => { famFilter = b.dataset.f; buildLibrary(); });
  const list = GENRES.filter((g) => famFilter === 'all' || g.family === famFilter);
  $('.tiles').innerHTML = list.map((g) => `<div class="tile" style="--fc:${FAMILY_COL[g.family] || '#888'}"><span class="n">${g.name}</span><span class="m">${g.bpm[0] === g.bpm[1] ? g.bpm[0] : g.bpm[0] + '–' + g.bpm[1]} BPM · ${FAMILY_NAME[g.family] || g.family}</span><div class="acts"><button data-d="0" data-g="${g.id}" aria-label="Load ${g.name} to deck A">A</button><button data-d="1" data-g="${g.id}" aria-label="Load ${g.name} to deck B">B</button></div></div>`).join('');
  $$('.tile .acts button').forEach((b) => b.onclick = async () => { await startAudio(); const i = +b.dataset.d; if (!deckFree(i)) { toast(onAirMsg(i)); return; } // (an explicit A / B: refused when on air, never redirected)
    loadDeck(i, b.dataset.g, { play: !decks[i ^ 1].playing }); }); }
// (v9.2) a message that arrives while another is still fresh (under 1.5 s) is shown under it, not instead of it (two lines at most)
// two messages within 1.5 s stack (v9.2: the second one overwrote the first); a message of the same kind (the same words before its
// first number or colon: "Energy 60 %", "Rendering X: 45 %") replaces the last one, and a passing one (progress) never stays on top
let toastT = 0, toastAt = 0, toastLast = '', toastKey = ''; function toast(t, ms, passing) { const el = $('#toast'), now = performance.now(), key = String(t).split(/[:\d]/)[0], fresh = el.classList.contains('show') && now - toastAt < 1500 && toastLast && toastLast !== t && key !== toastKey;
  el.textContent = fresh ? toastLast + '\n' + t : t; toastLast = passing ? '' : t; toastKey = key; toastAt = now; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), Math.max(ms || 3200, fresh ? 4000 : 0)); }

// ---------------------------------------------------------------- boot
function boot() {
  const con = $('.console'); con.insertBefore(buildDeck(0), con.firstChild); con.appendChild(buildDeck(1));
  buildMixer(); buildLibrary(); renderDeckHead(0); renderDeckHead(1); renderStems(0); renderStems(1); buildDock(); buildMidi(); buildPerform(); buildAsk(); buildAuto(); buildShell();
  $('#power').onclick = startAudio; bindEngPref(); bindOutLevel(); { const rb = $('#reportBtn'); if (rb) rb.onclick = saveReport; }
  $('#autoOn').onchange = (e) => setAutoDJ(e.target.checked); $('#txCancel').onclick = () => cancelMix(false);
  $('#journey').onchange = (e) => { auto.journey = e.target.value; }; $('#txLen').onchange = (e) => { auto.len = +e.target.value; };
  if (ANDROID) { // the same three choices, in what they mean on Android: how far ahead the engine renders (see AHEAD_MS)
    const se = $('#startEngine'), ep = $('#engPref'), txt = { safe: `A gig — steadiest (renders ${AHEAD_MS.safe / 1000} s ahead)`, live: `Live — balanced (${AHEAD_MS.live / 1000} s ahead)`, fast: `Studio — fastest response (${AHEAD_MS.fast / 1000} s ahead)` };
    if (se) { for (const o of se.options) if (txt[o.value]) o.textContent = txt[o.value]; se.title = 'On Android the engine always renders ahead in its own thread and the audio thread only plays what is ready — Chrome\'s audio thread skips on Android with a large output buffer, and a small one leaves the sound engine too little time. The choice is how far ahead: more is steadier, the knobs answer that much later.'; }
    if (ep) { for (const o of ep.options) if (txt[o.value]) o.textContent = 'Stable · ' + AHEAD_NAME[o.value]; else if (o.value === 'buffered') o.hidden = true; ep.title = 'On Android every choice runs the Stable engine: it renders ahead in its own thread and the audio thread only plays what is ready. The choice is how far ahead — gig 340 ms, live 170 ms, studio 85 ms: more is steadier, the knobs answer that much later.'; } } // (v9.2: the desktop tooltip described engines Android does not run)
  { const se = $('#startEngine'); if (se) { const cur = engPref(); se.value = cur === 'buffered' ? 'live' : cur; se.onchange = () => { try { localStorage.setItem('forge.engine2', se.value); } catch (e) { /* this page only */ } const ep = $('#engPref'); if (ep) ep.value = se.value; }; } } // the engine for this set, chosen where the set starts (a gig: the steadiest buffer)
  $('#go').onclick = async () => { $('#splash').hidden = true; await startAudio(); const pick = $('#startGenre').value; loadDeck(0, pick, { play: true }); auto.on = $('#startAuto').checked; $('#autoOn').checked = auto.on; };
  $('#skip').onclick = () => { $('#splash').hidden = true; };
  { const j = autoSetSaved(); if (j) { const names = j.decks.map((x) => x && x.spec ? (x.spec.title || (GENRE_BY_ID[x.spec.genre] || { name: x.spec.genre }).name) : null).filter(Boolean), t = new Date(j.saved);
      $('#resumeRow').hidden = false; $('#resumeInfo').textContent = `${names.map((n) => String(n).slice(0, 28)).join(' · ')} — saved ${t.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`;
      $('#resume').onclick = async () => { $('#splash').hidden = true; await startAudio(); resumeSet(j); }; } }
  $('#startGenre').innerHTML = GENRES.map((g) => `<option value="${g.id}"${g.id === 'tech-house' ? ' selected' : ''}>${g.name}</option>`).join('');
  document.addEventListener('keydown', (e) => { if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable || e.metaKey || e.ctrlKey) return; const D = decks[lead];
    if (e.code === 'Space') { e.preventDefault(); playPause(lead); }
    else if (e.key === 'm' || e.key === 'M') { const b = lead ^ 1; if (decks[b].score && !decks[b].playing) mixInto(b); }
    else if (e.key === 'r' || e.key === 'R') reroll(lead);
    else if (e.key === 'l' || e.key === 'L') setLoop(lead, D.loop ? 0 : 8);
    else if (e.shiftKey && /^Digit[1-6]$/.test(e.code)) { const n = +e.code.slice(5) - 1, T = targets()[`${'AB'[lead]}.fx.${FX_RACK[n][0]}`]; if (T) { T.press(); toast(`${FX_RACK[n][1]} ${D.fxOn && D.fxOn[n] ? 'on' : 'off'} · deck ${'AB'[lead]}`); } }
    else if (/^[1-9]$/.test(e.key) && D.score) jumpTo(lead, +e.key - 1);
    else if (e.key === 'd' || e.key === 'D') regenPart(lead, 'drums'); else if (e.key === 'b' || e.key === 'B') regenPart(lead, 'bass');
    else if (e.key === 'c' || e.key === 'C') regenPart(lead, 'chords'); else if (e.key === 'n' || e.key === 'N') regenPart(lead, 'lead');
    else if (e.key === 'e' || e.key === 'E') { targets()[`${'AB'[lead]}.evolve`].press(); toast(`Auto ${autoAny(D) ? 'on (all parts)' : 'off'} · deck ${'AB'[lead]}`); }
    else if (e.key === '[' || e.key === ']') { const T = targets()[`${'AB'[lead]}.energy`]; T.set(clamp(T.get() + (e.key === ']' ? 0.1 : -0.1), 0, 1)); toast(`Energy ${Math.round(T.get() * 100)} %`); }
    else if (e.key === '?') { const h = $('#keysHelp'); h.hidden = !h.hidden; }
    else if (e.key === 'Escape') { if (e.shiftKey) cancelMix(false); else safeAll(); } });
  // diagnostics: main-thread stalls (long tasks) — a stall freezes the screen, and in the ScriptProcessor fallback it is a gap in the audio
  DIAG.t0 = performance.now(); try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { DIAG.long++; if (e.duration > DIAG.longMax) DIAG.longMax = e.duration; DIAG.longs.push([Math.round(e.startTime), Math.round(e.duration)]); if (DIAG.longs.length > 200) DIAG.longs.shift(); } }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* not supported */ }
  requestAnimationFrame(frame); }
const DIAG = { long: 0, longMax: 0, longs: [], t0: 0 };

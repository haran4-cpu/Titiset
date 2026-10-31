/* ===================== ENGINE HOST (Worker) — the Stable engine =====================
   The whole engine runs here, AHEAD of the audio clock, and ships audio chunks to the player processor on the audio thread
   (ForgePlayer) over a direct MessagePort. The player reports how many frames it has played; this host keeps
   (rendered − played) at the target lead. Anything slow here — garbage collection, a JIT recompile, a dense chord, the page
   being busy — is absorbed by that lead instead of being heard as a stall.
   If the player ever runs dry (an underrun), the lead grows by a quarter, at least 2048 frames (up to MAX_LEAD), and the main thread is told:
   the instrument adapts to a slow machine instead of stuttering on it. Commands land on the next chunk (≤ CHUNK frames). */
'use strict';
const CHUNK = 512; let MAX_LEAD = 12288; // (a phone may grow further: init.maxLead)
let SH = [], cmdMax = 0, cmdName = '', gapMax = 0, lastPlayed = 0, rndMax = 0; // diagnostics: slowest command, longest wait for the worker to be scheduled, slowest chunk
let E = null, P = null, SR = 44100, lead = 6144, lead0 = 4096, clean = 0, rendered = 0, played = 0, playedT = 0, under = 0, dryF = 0, mcnt = 0, busy = 0, audio = 0, loadV = 0, cool = 0, blkMax = 0, stallMs = 0, grow = 0, minAhead = 1e9, ecoT = 0;
const sL = new Float32Array(128), sR = new Float32Array(128), bL = new Float32Array(128), bR = new Float32Array(128), bCL = new Float32Array(128), bCR = new Float32Array(128);
// (v9.2) the player sends the buffers of the chunks it has played back: rendering into them again saves ~0.4 MB/s of new arrays here
const POOL = [], take = () => (POOL.length ? new Float32Array(POOL.pop()) : new Float32Array(CHUNK));
// the player re-buffers (after a dropout) until this much is queued: a share of the lead as it is now, not as it was at the start
function setLead(v) { lead = v; if (P) P.postMessage({ type: 'cfg', pre: Math.round(lead * 0.6) }); }
function renderChunk() { const t0 = performance.now(), cue = E.cueOn[0] || E.cueOn[1], oL = take(), oR = take(), oCL = cue ? take() : null, oCR = cue ? take() : null;
  if (stallMs) { const s = performance.now(); while (performance.now() - s < stallMs) { /* test hook: simulate a stall of the DSP thread */ } stallMs = 0; }
  for (let o = 0; o < CHUNK; o += 128) { const b0 = performance.now();
    try { E.render(bL, bR, 128, cue ? bCL : null, cue ? bCR : null); } catch (err) { bL.fill(0); bR.fill(0); bCL.fill(0); bCR.fill(0); E.rescue(err, sL, sR, 128); } // (v9.2) an exception no longer stops the chunks for good
    for (const S of SH) try { S.render(sL, sR, 128); } catch (err) { /* a shadow engine (test hook) */ } const dt = performance.now() - b0; if (dt > blkMax) blkMax = dt;
    oL.set(bL, o); oR.set(bR, o); if (cue) { oCL.set(bCL, o); oCR.set(bCR, o); }
    rendered += 128; if (++mcnt >= Math.round(SR / 128 / 30)) { mcnt = 0; meter(); } }
  const tr = [oL.buffer, oR.buffer]; if (cue) tr.push(oCL.buffer, oCR.buffer);
  P.postMessage({ type: 'chunk', L: oL, R: oR, CL: oCL, CR: oCR }, tr);
  const rt = performance.now() - t0; if (rt > rndMax) rndMax = rt; busy += rt; audio += CHUNK / SR * 1000;
  if (audio >= 1000) { loadV = busy / audio; busy = 0; audio = 0; const now = performance.now(), behind = played > 0 && minAhead < lead * 0.4; minAhead = 1e9;
    // watchdog (v9.1): rendering ahead, this thread can run close to real time without a sound being late, so the engine is thinned
    // only when it would NOT keep up — a second above 88 % of real time, or more than 60 % of the cushion spent (the thread was starved)
    // — one step at a time, at most every 4 s (1: channel character off · 2: unison / supersaw stacks thinned, harmonic FX buses
    // off); one step back after 20 s under 50 %. Before: one step at 75 %, which saved ~10 % and was heard as the punch going away
    if ((loadV > 0.88 || behind) && E.eco < 2 && now - ecoT > 4000) { E.setEco(E.eco + 1); ecoT = now; cool = 0; }
    else if (E.eco && loadV < 0.5 && !behind) { if (++cool >= 20) { E.setEco(E.eco - 1); cool = 0; ecoT = now; } } else cool = 0; } }
function meter() { const m = E.meters(); m.load = loadV; m.eco = E.eco; m.blkMax = blkMax; blkMax = 0; m.ahead = rendered - played; m.frame = rendered; m.pf = played; m.pt = playedT; m.bufF = lead; m.under = under; m.dry = dryF; m.sr = SR; m.wasm = WV.ok && !WV.off ? 1 : 0; m.cmdMax = cmdMax; m.cmdName = cmdName; m.gapMax = gapMax; m.rndMax = rndMax; postMessage(m); while (E.outbox.length) postMessage(E.outbox.shift()); }
function pump() { if (played > 0) { const a = rendered - played; if (a < minAhead) minAhead = a; } let k = 0; /* the cushion when the player reports (its lowest point), once playing — the first fill starts from zero */ while (rendered - played < lead && k++ < 96) renderChunk(); }
function onPlayer(e) { const m = e.data; if (m.type !== 'played') return; played = m.frames; playedT = m.t; dryF = m.dry || 0; if (m.bufs) for (const b of m.bufs) if (b.byteLength === CHUNK * 4 && POOL.length < 96) POOL.push(b); { const now = performance.now(); if (lastPlayed && now - lastPlayed > gapMax) gapMax = now - lastPlayed; lastPlayed = now; }
  if (m.under > under) { const d = m.under - under; under = m.under; clean = 0; if (lead >= MAX_LEAD) { E.setEco(2); postMessage({ type: 'health', under, bufF: lead, grow, eco: 2 }); } if (lead < MAX_LEAD) { setLead(Math.min(MAX_LEAD, lead + Math.max(2048, lead >> 2) * Math.min(2, d))); grow++; postMessage({ type: 'health', under, bufF: lead, grow }); } } // a dropout: a quarter more cushion (at least 43 ms)
  else if (lead > lead0 && (clean += 1024) >= SR * 20) { clean = 0; setLead(Math.max(lead0, lead - 512)); } // 20 s without a dropout: give back latency, 12 ms at a time (never below the lead that was chosen)
  pump(); }
onmessage = (e) => { const m = e.data;
  if (m.type === 'ping') { postMessage({ type: 'alive' }); return; }
  // start with a cushion (the first seconds of a session are the slowest: new code paths), settle to ~93 ms after a clean stretch —
  // or, when the page sets a floor (Android: the lead the person chose), never below it
  if (m.type === 'init') { SR = m.sr; lead = m.lead || lead; lead0 = m.floor || Math.min(lead, 4096); if (m.maxLead) MAX_LEAD = Math.max(lead, m.maxLead); BANK_SYNC = false; E = new Engine(SR).prealloc(); if (m.warm) { try { warmUp(m.warm, SR); } catch (err) { /* warm-up is an optimisation */ } } // JIT warm-up BEFORE the first chunk: nothing is waiting for audio yet
    P = m.port; P.onmessage = onPlayer; P.postMessage({ type: 'cfg', pre: Math.round(lead * 0.6) }); postMessage({ type: 'ready', bufF: lead }); pump(); return; }
  if (!E) return;
  if (m.type === 'warmup') { warmUp(m, SR); postMessage({ type: 'warm', ok: true }); return; }
  if (m.type === 'stall') { stallMs = m.ms; return; }
  if (m.type === 'shadow') { SH = []; for (let k = 0; k < (m.n | 0); k++) SH.push(new Engine(SR)); return; } // test hook: emulate a slower CPU (the same music rendered n more times)
  if (m.type === 'lead') { setLead(Math.max(1024, Math.min(MAX_LEAD, m.frames | 0))); return; }
  if (m.type === 'batch') { const c0 = performance.now(); for (const x of m.list) { E.cmd(x); for (const S of SH) S.cmd(x); } const dt = performance.now() - c0; if (dt > cmdMax) { cmdMax = dt; cmdName = 'batch'; } return; }
  if (m.type === 'diag') { cmdMax = 0; gapMax = 0; rndMax = 0; cmdName = ''; return; }
  const c0 = performance.now(); E.cmd(m); for (const S of SH) S.cmd(m); const dt = performance.now() - c0; if (dt > cmdMax) { cmdMax = dt; cmdName = m.type; } };

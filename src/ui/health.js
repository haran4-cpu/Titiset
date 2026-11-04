// ---------------------------------------------------------------- HEALTH: the instrument's black box
// Everything needed to diagnose a glitch on the player's own machine, recorded while playing and saved as one JSON file
// ("Report" in the header): the machine and browser, the engine and its latencies, the sound card's own glitch count
// (Chrome playoutStats, where available), DSP load, main-thread stalls, power and visibility changes — and a timeline of
// every command sent to the engine, so each glitch can be lined up with what was done just before it.
// Also keeps the machine fit for a gig: a screen wake lock while audio runs (a sleeping screen / power saving can throttle
// the audio), a warning when the laptop runs on battery, and a resume if the audio context is suspended behind our back.
const HEALTH = { t0: 0, ev: [], samples: [], glitches: [], env: null, lastUnder: 0, lastCmd: {}, wake: null, wakeState: 'off', battery: null, sampleT: 0, worstLoad: 0 };
const HEALTH_QUIET = { kit: 1, filter: 1, eq: 1, fader: 1, gain: 1, trim: 1, sends: 1, partfx: 1, energy: 1, cue: 1 }; // continuous controls: coalesced
function hNow() { return Math.round(performance.now() - HEALTH.t0); }
function hLog(kind, detail) { HEALTH.ev.push([hNow(), kind, detail == null ? '' : detail]); if (HEALTH.ev.length > 4000) HEALTH.ev.splice(0, 1000); }
function healthCmd(m) { if (!HEALTH.t0) return; const k = m.type; if (k === 'shadow' || k === 'diag') return;
  if (HEALTH_QUIET[k]) { const t = performance.now(); if (t - (HEALTH.lastCmd[k] || 0) < 400) return; HEALTH.lastCmd[k] = t; }
  let d = ''; if (m.deck != null) d += 'deck ' + 'AB'[m.deck]; if (k === 'load' || k === 'swapScore') d += ' ' + (m.score && m.score.meta ? m.score.meta.gid + ' seed ' + m.score.meta.seed : ''); else if (k === 'fx' || k === 'fill') d += ` ${m.name || m.kind} ${m.on ? 'on' : 'off'}`; else if (k === 'kit') d += ' ' + m.slot; else if (k === 'batch') d += ' ' + m.list.length + ' cmds';
  hLog('cmd:' + k, d.trim()); }
function healthMeter(m) { if (!HEALTH.t0) return; const u = A.under || 0;
  if (m.slow) for (const x of m.slow) { hLog('slow', `${x.what} ${x.ms} ms`); HEALTH.slowMax = Math.max(HEALTH.slowMax || 0, x.ms);
    // a callback later than the output buffer plus 40 ms is a glitch the browser does not count for us (no playoutStats): the glitch watch uses it when that counter is missing
    if (/^gap/.test(x.what) && x.ms > (A.lat || 25) + 40) { A.lateGaps = (A.lateGaps || 0) + 1; if (!A.underKnown) glitchWatch(); workerPace(true); } }
  if (u > HEALTH.lastUnder) { const recent = HEALTH.ev.filter((e) => e[0] > hNow() - 3000 && (e[1].startsWith('cmd:') || e[1] === 'slow')).map((e) => e[1].slice(4) + (e[2] ? ' (' + e[2] + ')' : ''));
    HEALTH.glitches.push({ t: hNow(), n: u - HEALTH.lastUnder, total: u, load: +(m.load || 0).toFixed(2), eco: m.eco || 0, before: recent.slice(-8) }); hLog('glitch', `${u - HEALTH.lastUnder} (total ${u})`); HEALTH.lastUnder = u; }
  if ((m.load || 0) > HEALTH.worstLoad) HEALTH.worstLoad = m.load;
  const t = performance.now(); if (t - HEALTH.sampleT < 2000) return; HEALTH.sampleT = t; const ps = cardStats(A.ctx);
  HEALTH.samples.push({ t: hNow(), load: +(m.load || 0).toFixed(3), eco: m.eco || 0, under: u, lufsS: m.lufsS != null ? +m.lufsS.toFixed(1) : null, tp: m.tp != null ? +m.tp.toFixed(1) : null, gr: m.gr != null ? +m.gr.toFixed(1) : null,
    lat: ps ? +ps.lat.toFixed(1) : null, latMax: ps ? +ps.latMax.toFixed(1) : null, buf: A.leadF || null, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
    decks: [0, 1].map((i) => decks[i].playing ? (decks[i].gid || '') + '@' + Math.round(decks[i].pos || 0) : '-'), long: DIAG.long });
  if (HEALTH.samples.length > 1800) HEALTH.samples.splice(0, 300); }
const FORGE_VER = 'v__FORGE_VERSION__ · build __FORGE_BUILD__';
function healthEnv() { const c = A.ctx, n = navigator; return { app: 'DJ TiTo', version: FORGE_VER, when: new Date().toISOString(), ua: n.userAgent, platform: (n.userAgentData && n.userAgentData.platform) || n.platform, cores: n.hardwareConcurrency, memoryGB: n.deviceMemory || null,
  screen: `${screen.width}×${screen.height} @${devicePixelRatio}`, engine: A.mode, enginePref: engPref(), android: ANDROID, renderAheadMs: A.worker && c ? Math.round((A.leadF || 0) / c.sampleRate * 1000) : null, sampleRate: c ? c.sampleRate : null, baseLatencyMs: c ? +(c.baseLatency * 1000).toFixed(1) : null, outputLatencyMs: c && c.outputLatency ? +(c.outputLatency * 1000).toFixed(1) : null,
  glitchCounter: A.worker ? 'player underruns (buffered engine)' : A.underKnown ? `sound card (${A.psApi || 'playoutStats'})` : 'not available in this browser', crossOriginIsolated: !!window.crossOriginIsolated, dspVoices: meter && meter.wasm ? 'WebAssembly' : 'JavaScript' }; }
function healthSummary() { const g = HEALTH.glitches, d = HEALTH.samples, mins = hNow() / 60000; const loads = d.map((s) => s.load).sort((a, b) => a - b);
  const psC = cardStats(A.ctx), psN = psC && A.ps0 != null ? psC.drops - A.ps0 : null;
  return { minutes: +mins.toFixed(1), glitches: A.under || 0, glitchEvents: g.length, soundCardGlitches: psN, eco: meter ? meter.eco || 0 : null, worstLoad: +HEALTH.worstLoad.toFixed(2), slowestAudioCallMs: HEALTH.slowMax || 0, medianLoad: loads.length ? loads[loads.length >> 1] : null, longTasks: DIAG.long, longestTaskMs: Math.round(DIAG.longMax), engineHeals: DIAG.heals || 0, refusedCommands: DIAG.rejected || 0,
    wakeLock: HEALTH.wakeState, battery: HEALTH.battery ? (HEALTH.battery.charging ? 'charging' : `on battery ${Math.round(HEALTH.battery.level * 100)} %`) : 'unknown' }; }
// saveFile (perform.js): the viewer's Downloads capability inside a Claude page — a plain <a download> is inert there — and an ordinary download everywhere else
async function saveReport() { const rep = { summary: healthSummary(), env: healthEnv(), glitches: HEALTH.glitches, longTasks: DIAG.longs.slice(-200), samples: HEALTH.samples, timeline: HEALTH.ev.slice(-3000) };
  const b = new Blob([JSON.stringify(rep, null, 1)], { type: 'application/json' }), d = new Date();
  const saved = await saveFile(`forge-report-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.json`, b);
  const s = rep.summary; if (saved !== null) toast(`Report ${saved === false ? 'not saved (declined)' : 'saved'}: ${s.minutes} min · ${s.glitches} glitches · DSP load worst ${Math.round(s.worstLoad * 100)} % · ${s.longTasks} screen stalls${saved === false ? '' : ' — send the file to get it analysed'}`); return rep; }
async function wakeOn() { if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return; try { HEALTH.wake = await navigator.wakeLock.request('screen'); HEALTH.wakeState = 'on'; hLog('wakelock', 'on'); HEALTH.wake.addEventListener('release', () => { HEALTH.wakeState = 'released'; hLog('wakelock', 'released'); }); } catch (e) { HEALTH.wakeState = 'denied'; hLog('wakelock', 'denied: ' + e.name); } }
function batteryWarn(b) { HEALTH.battery = b; hLog('power', b.charging ? 'charging' : `battery ${Math.round(b.level * 100)} %`); if (!b.charging && A.ctx) toast(`Running on battery — plug the ${ANDROID || /iPhone|iPad|Mobile/.test(navigator.userAgent) ? 'device' : 'laptop'} in for a gig: power saving can slow the audio thread`, 6000); }
// called once the audio is running
function healthStart() { if (HEALTH.t0) return; HEALTH.t0 = performance.now(); HEALTH.lastUnder = A.under || 0; HEALTH.env = healthEnv(); hLog('start', `${A.mode} · ${A.ctx.sampleRate} Hz · base latency ${(A.ctx.baseLatency * 1000).toFixed(0)} ms`);
  wakeOn(); document.addEventListener('visibilitychange', () => { hLog('visibility', document.visibilityState); if (document.visibilityState === 'visible' && HEALTH.wakeState !== 'on') wakeOn(); });
  if (navigator.getBattery) navigator.getBattery().then((b) => { batteryWarn(b); b.addEventListener('chargingchange', () => batteryWarn(b)); }).catch(() => {});
  A.ctx.addEventListener('statechange', () => { const st = A.ctx.state; hLog('audio', st); if (st !== 'running' && st !== 'closed' && (decks[0].playing || decks[1].playing)) { A.ctx.resume().then(() => hLog('audio', 'resumed')).catch(() => {}); } });
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', () => hLog('devices', 'changed'));
  const b = $('#reportBtn'); if (b) b.disabled = false; }

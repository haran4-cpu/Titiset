/* FORGE hardware check — a panel for the machine you actually play on.
   Open dist/selfcheck.html through a local server (python3 -m http.server in the dist folder, then http://localhost:8000/selfcheck.html), choose a track, press Run and listen.
   It plays one track on the real sound card for 1, 3 or 10 minutes and records what only your hardware can tell: the engine and its latency, dropouts, DSP load, page stalls, power state,
   and — if you have a MIDI loopback (IAC Driver on a Mac, loopMIDI on Windows, or a cable from a MIDI out to a MIDI in) — the MIDI clock as the receiving end sees it.
   At the end it asks what you HEARD, and saves everything as one text report (and a JSON file) that can be sent for analysis.
   Nothing leaves the machine by itself. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const q = (v, p) => { if (!v.length) return null; const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; }, mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
  const ST = { access: null, ticks: [], run: null, ear: null, result: null };
  const css = `#hwc{position:fixed;z-index:99999;right:12px;top:12px;width:min(420px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#14161b;color:#e8e9ee;border:1px solid #3a3f4b;border-radius:12px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 8px 40px #000a;padding:14px 16px}
#hwc h2{margin:0 0 2px;font-size:16px}#hwc .sub{color:#9aa0ad;margin:0 0 10px}#hwc label{display:block;margin:8px 0 2px;color:#b9bec9}#hwc select,#hwc button{font:inherit;border-radius:8px;border:1px solid #444a58;background:#1e222a;color:inherit;padding:6px 9px}
#hwc select{width:100%}#hwc button{cursor:pointer;margin:8px 6px 0 0}#hwc button.go{background:#2f6df6;border-color:#2f6df6;font-weight:600}#hwc button:disabled{opacity:.45;cursor:default}
#hwc .row{display:flex;gap:8px}#hwc .row>div{flex:1}#hwc .bar{height:6px;background:#2a2e38;border-radius:4px;margin:10px 0;overflow:hidden}#hwc .bar i{display:block;height:100%;background:#2f6df6;width:0}
#hwc table{width:100%;border-collapse:collapse;margin-top:8px}#hwc td{padding:4px 6px;border-top:1px solid #2a2e38;vertical-align:top}#hwc td:first-child{width:22px}
#hwc .ok{color:#4fd08a}#hwc .warn{color:#f0b94a}#hwc .bad{color:#ff6b6b}#hwc .dim{color:#9aa0ad}#hwc pre{white-space:pre-wrap;background:#0d0f13;border-radius:8px;padding:8px;max-height:220px;overflow:auto;font-size:12px}
#hwc .x{float:right;margin:0;padding:2px 8px}`;
  function boot() {
    const F = window.__forge; if (!F) { setTimeout(boot, 100); return; }
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); { const sp = document.getElementById('splash'); if (sp) sp.hidden = true; }
    const P = document.createElement('div'); P.id = 'hwc'; document.body.appendChild(P);
    const genres = (F.auto && F.auto.GENRES) || [], engine = (() => { try { return localStorage.getItem('forge.engine2') || 'live'; } catch (e) { return 'live'; } })();
    P.innerHTML = `<button class="x" id="hwcx" title="hide">×</button><h2>DJ TiTo hardware check</h2><p class="sub">Plays one track on this machine's sound card and measures it. Turn the volume to a comfortable level and listen.</p>
      <label>Engine</label><select id="hwcEng"><option value="live"${engine === 'live' ? ' selected' : ''}>Live (default)</option><option value="fast"${engine === 'fast' ? ' selected' : ''}>Live · fast</option><option value="buffered"${engine === 'buffered' ? ' selected' : ''}>Stable (renders ahead)</option></select>
      <div class="row"><div><label>Track</label><select id="hwcGen">${genres.map((g) => `<option value="${g.id}"${g.id === 'techno' ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
      <div><label>Length</label><select id="hwcDur"><option value="60">1 minute</option><option value="180" selected>3 minutes</option><option value="600">10 minutes</option></select></div></div>
      <label>MIDI loopback <span class="dim">(optional: send DJ TiTo's clock out of one port and read it back on another)</span></label>
      <div class="row"><div><select id="hwcOut"><option value="">output: none</option></select></div><div><select id="hwcIn"><option value="">input: none</option></select></div></div>
      <button id="hwcScan">Scan MIDI ports</button><button class="go" id="hwcRun">Run the check</button><div class="bar"><i id="hwcBar"></i></div><div id="hwcMsg" class="dim">${location.protocol === 'file:' ? '<span class="warn">Opened from a file: the browser then runs the slower fallback engine. For a real check serve this folder (python3 -m http.server 8000) and open http://localhost:8000/selfcheck.html.</span>' : 'Ready.'}</div><div id="hwcRes"></div>`;
    $('#hwcx', P).onclick = () => { P.style.display = 'none'; };
    $('#hwcScan', P).onclick = scan; $('#hwcRun', P).onclick = run;
    // ---- MIDI: list the ports
    async function scan() { const m = $('#hwcMsg', P); if (!navigator.requestMIDIAccess) { m.textContent = 'This browser has no Web MIDI (use Chrome or Edge).'; return; }
      try { ST.access = await navigator.requestMIDIAccess({ sysex: false }); } catch (e) { m.textContent = 'MIDI access was not granted: ' + e.message; return; }
      const outs = [...ST.access.outputs.values()], ins = [...ST.access.inputs.values()];
      $('#hwcOut', P).innerHTML = '<option value="">output: none</option>' + outs.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join(''); $('#hwcIn', P).innerHTML = '<option value="">input: none</option>' + ins.map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');
      m.textContent = `${outs.length} MIDI output(s), ${ins.length} input(s) found.${outs.length && ins.length ? ' Pick a loopback pair to measure the clock.' : ''}`; }
    // ---- one run
    async function run() {
      if (ST.run) return; const eng = $('#hwcEng', P).value, gid = $('#hwcGen', P).value, dur = +$('#hwcDur', P).value, outId = $('#hwcOut', P).value, inId = $('#hwcIn', P).value, msg = $('#hwcMsg', P), bar = $('#hwcBar', P), res = $('#hwcRes', P); res.innerHTML = '';
      try { localStorage.setItem('forge.engine2', eng); } catch (e) { /* storage blocked: the engine stays as it is */ }
      if (F.A.ctx && F.A.mode && ((eng === 'buffered' && F.A.mode !== 'Stable') || (eng === 'fast' && F.A.mode !== 'Live · fast') || (eng === 'live' && F.A.mode !== 'Live'))) { msg.innerHTML = '<span class="warn">The audio is already running in another engine mode — reload this page to switch (your choice is saved), then press Run.</span>'; return; }
      ST.run = { t0: performance.now(), samples: [], stalls: 0, lastTick: performance.now(), maxLate: 0, vis: [], ots: [], dur, gid, eng }; $('#hwcRun', P).disabled = true; ST.ticks = []; ST.ear = null;
      try { msg.textContent = 'Starting the audio…'; await F.startAudio(); await F.loadDeck(0, gid, { play: true }); await new Promise((ok, no) => { const t0 = performance.now(), iv = setInterval(() => { if (F.meter && F.meter.decks[0].playing) { clearInterval(iv); ok(); } else if (performance.now() - t0 > 60000) { clearInterval(iv); no(new Error('the track did not start in 60 s')); } }, 100); });
      } catch (e) { msg.innerHTML = `<span class="bad">Could not start: ${esc(e.message)}</span>`; ST.run = null; $('#hwcRun', P).disabled = false; return; }
      // MIDI: the app's own MIDI layer sends the clock to the chosen output; a listener on the chosen input timestamps every tick the way the receiving device would
      let midiOn = false, inp = null, onmsg = null; if (ST.access && outId) { try { await F.midi.connectMidi(ST.access); F.midi.MIDI.outId = outId; F.midi.MIDI.clockIn = false; F.midi.MIDI.clockOut = true; midiOn = F.midi.MIDI.state === 'on'; } catch (e) { /* the app's MIDI layer refused: no clock test */ } }
      if (ST.access && inId && midiOn) { inp = ST.access.inputs.get(inId); if (inp) { onmsg = (e) => { if (e.data && e.data[0] === 0xf8) ST.ticks.push(e.timeStamp); }; inp.addEventListener('midimessage', onmsg); try { await inp.open(); } catch (e) { /* the port opens by itself when the app listens to it */ } } }
      const c = F.A.ctx, under0 = F.A.under || 0, long0 = F.DIAG.long; ST.run.under0 = under0; ST.run.state0 = c.state; ST.run.stateChanges = []; c.addEventListener('statechange', () => ST.run && ST.run.stateChanges.push([Math.round(performance.now() - ST.run.t0), c.state]));
      const vis = () => ST.run && ST.run.vis.push([Math.round(performance.now() - ST.run.t0), document.visibilityState]); document.addEventListener('visibilitychange', vis);
      msg.textContent = 'Listening… keep this tab in front and leave the machine alone.'; const T0 = performance.now();
      await new Promise((done) => { const iv = setInterval(() => { const now = performance.now(), R = ST.run; R.maxLate = Math.max(R.maxLate, now - R.lastTick - 250); R.lastTick = now; const m = F.meter || {};
        { const ts = c.getOutputTimestamp ? c.getOutputTimestamp() : null; if (ts && ts.performanceTime > 0) R.ots.push([ts.contextTime, ts.performanceTime]); }
        R.samples.push({ t: Math.round(now - T0), load: m.load || 0, under: (F.A.under || 0) - under0, state: c.state, aheadMs: F.A.aheadMs || null, lufsS: m.lufsS != null ? +m.lufsS.toFixed(1) : null, bpm: m.decks ? m.decks[0].bpm : null });
        const el = (now - T0) / 1000; bar.style.width = Math.min(100, el / dur * 100) + '%'; msg.textContent = `Listening… ${Math.round(el)} s of ${dur} s · DSP load ${Math.round((m.load || 0) * 100)} % · dropouts ${(F.A.under || 0) - under0}`; if (el >= dur) { clearInterval(iv); done(); } }, 250); });
      document.removeEventListener('visibilitychange', vis); if (inp && onmsg) inp.removeEventListener('midimessage', onmsg); if (midiOn) F.midi.MIDI.clockOut = false;
      const R = ST.run, endBpm = F.meter.decks[0].bpm; R.long = F.DIAG.long - long0; R.longMax = F.DIAG.longMax; R.endBpm = endBpm; R.midiOn = midiOn; R.midiIn = !!inp; R.under = (F.A.under || 0) - under0; ST.result = analyse(R); ST.run = null; $('#hwcRun', P).disabled = false; bar.style.width = '100%'; msg.textContent = 'Done. One last question:'; ask(); }
    // the sound card's clock against the computer's: the slope of the audio clock over the run (a few tens of ppm is normal; a jumpy or steep one is a poor driver)
    function drift(o) { if (o.length < 20) return null; const n = o.length, a = o[Math.floor(n * 0.1)], b = o[n - 1], dc = (b[0] - a[0]) * 1000, dp = b[1] - a[1]; return dp > 5000 ? +((dc / dp - 1) * 1e6).toFixed(0) : null; }
    function receiver(t) { const iv = []; let back = 0; for (let i = 1; i < t.length; i++) { const d = t[i] - t[i - 1]; if (d < -0.01) back++; iv.push(d); }
      const res = iv.map((d, i) => d - q(iv.slice(Math.max(0, i - 12), Math.min(iv.length, i + 13)), 0.5)), beats = []; for (let i = 0; i + 24 < t.length; i += 24) beats.push(60000 / (t[i + 24] - t[i]));
      return { n: t.length, back, rms: Math.sqrt(mean(res.map((r) => r * r))), p99: q(res.map(Math.abs), 0.99), worst: Math.max(...res.map(Math.abs)), maxGap: Math.max(...iv), bpm: beats.length ? q(beats, 0.5) : null, bpmSpread: beats.length > 2 ? Math.sqrt(mean(beats.map((b) => (b - mean(beats)) ** 2))) : null }; }
    function analyse(R) { const A = F.A, c = A.ctx, loads = R.samples.map((s) => s.load); const out = { when: new Date().toISOString(), ua: navigator.userAgent, platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform, cores: navigator.hardwareConcurrency, memoryGB: navigator.deviceMemory || null,
        engine: A.mode, requestedEngine: R.eng, sampleRate: c.sampleRate, baseLatencyMs: +(c.baseLatency * 1000).toFixed(1), outputLatencyMs: c.outputLatency != null ? +(c.outputLatency * 1000).toFixed(1) : null, appLatencyEstimateMs: A.lat != null ? +A.lat.toFixed(1) : null, track: R.gid, seconds: R.dur,
        dropouts: R.under, dropoutCounter: A.worker ? 'player under-runs (Stable engine)' : A.underKnown ? `sound card (${A.psApi || 'playoutStats'})` : 'not available in this browser', loadMean: +mean(loads).toFixed(3), loadP95: +(q(loads, 0.95) || 0).toFixed(3), loadMax: +Math.max(...loads).toFixed(3),
        pageStalls: R.long, longestStallMs: Math.round(R.longMax), timerLateMaxMs: Math.round(R.maxLate), contextStates: R.stateChanges, visibility: R.vis, clockDriftPpm: drift(R.ots), wasm: !!(F.meter && F.meter.wasm), battery: F.health.HEALTH.battery ? (F.health.HEALTH.battery.charging ? 'charging' : `on battery ${Math.round(F.health.HEALTH.battery.level * 100)} %`) : 'unknown' };
      if (R.midiOn && R.midiIn) { const rcv = ST.ticks.length > 30 ? receiver(ST.ticks) : null; out.midi = rcv ? { ticks: rcv.n, expected: Math.round(R.dur * R.endBpm / 60 * 24), outOfOrder: rcv.back, jitterRmsMs: +rcv.rms.toFixed(2), jitterP99Ms: +rcv.p99.toFixed(1), jitterWorstMs: +rcv.worst.toFixed(1), longestGapMs: Math.round(rcv.maxGap), tempoMeasured: +rcv.bpm.toFixed(2), tempoSpread: rcv.bpmSpread != null ? +rcv.bpmSpread.toFixed(2) : null, deckBpm: +R.endBpm.toFixed(2) } : { ticks: ST.ticks.length, note: 'too few ticks arrived: is the output wired to that input?' }; }
      else if (R.midiOn) out.midi = { note: 'clock was sent, no input chosen to read it back' };
      out.verdicts = verdicts(out); return out; }
    function verdicts(o) { const v = [], add = (lvl, what, detail) => v.push({ lvl, what, detail });
      add(o.dropouts === 0 ? (o.dropoutCounter.startsWith('not') ? 'warn' : 'ok') : 'bad', 'dropouts', o.dropoutCounter.startsWith('not') ? 'this browser does not count sound-card dropouts: judge by ear' : `${o.dropouts} (${o.dropoutCounter})`);
      add(o.loadP95 < 0.6 ? 'ok' : o.loadP95 < 0.85 ? 'warn' : 'bad', 'DSP load', `mean ${Math.round(o.loadMean * 100)} %, 95th percentile ${Math.round(o.loadP95 * 100)} %, worst ${Math.round(o.loadMax * 100)} %`);
      add(o.longestStallMs < 100 ? 'ok' : o.longestStallMs < 250 ? 'warn' : 'bad', 'page stalls', `${o.pageStalls} over 50 ms, longest ${o.longestStallMs} ms`);
      if (o.clockDriftPpm != null) add(Math.abs(o.clockDriftPpm) <= 500 ? 'ok' : 'warn', 'sound-card clock', `runs ${o.clockDriftPpm} ppm against the computer clock (normal: within a few hundred)`);
      add(o.contextStates.length === 0 ? 'ok' : 'bad', 'audio context', o.contextStates.length ? 'changed state: ' + JSON.stringify(o.contextStates) : 'stayed running');
      add(o.visibility.length === 0 ? 'ok' : 'warn', 'tab visibility', o.visibility.length ? 'the tab was hidden or shown during the run: ' + JSON.stringify(o.visibility) : 'tab stayed in front');
      if (o.battery.startsWith('on battery')) add('warn', 'power', o.battery + ': plug in for a gig (power saving can slow the audio thread)');
      if (o.midi && o.midi.jitterRmsMs != null) { const m = o.midi; add(m.outOfOrder === 0 ? 'ok' : 'bad', 'MIDI clock order', `${m.outOfOrder} tick(s) arrived earlier than the one before`); add(m.jitterRmsMs <= 2 ? 'ok' : m.jitterRmsMs <= 5 ? 'warn' : 'bad', 'MIDI clock jitter', `rms ${m.jitterRmsMs} ms, 99th percentile ${m.jitterP99Ms} ms, worst ${m.jitterWorstMs} ms (a USB or loopback driver adds ~1 ms)`);
        add(Math.abs(m.tempoMeasured - m.deckBpm) <= 0.5 ? 'ok' : 'warn', 'MIDI tempo', `a receiver measures ${m.tempoMeasured} BPM (±${m.tempoSpread}), the deck plays ${m.deckBpm}; ${m.ticks} of ≈${m.expected} ticks arrived, longest gap ${m.longestGapMs} ms`); }
      else if (o.midi && o.midi.note) add('warn', 'MIDI clock', o.midi.note); return v; }
    function ask() { const res = $('#hwcRes', P); res.innerHTML = `<div style="margin-top:6px">What did you hear?</div>` + ['clean', 'a few clicks', 'dropouts / stutter', 'distortion', 'other'].map((k) => `<button data-ear="${k}">${k}</button>`).join('');
      res.querySelectorAll('[data-ear]').forEach((b) => { b.onclick = () => { ST.ear = b.dataset.ear; if (ST.ear === 'other') { const t = prompt('Describe what you heard:'); if (t) ST.ear = 'other: ' + t; } finish(); }; }); }
    function text() { const o = ST.result; const L = ['DJ TiTo hardware check · ' + o.when, `machine: ${o.platform}, ${o.cores} cores${o.memoryGB ? ', ≥ ' + o.memoryGB + ' GB' : ''} · ${o.ua}`, `engine: ${o.engine} (requested ${o.requestedEngine}) · ${o.sampleRate} Hz · base latency ${o.baseLatencyMs} ms · output latency ${o.outputLatencyMs} ms · app estimate ${o.appLatencyEstimateMs} ms · DSP voices ${o.wasm ? 'WebAssembly' : 'JavaScript'}`,
        `track: ${o.track}, ${o.seconds} s`, `heard: ${ST.ear}`, ''];
      for (const x of o.verdicts) L.push(`${x.lvl === 'ok' ? '✓' : x.lvl === 'warn' ? '!' : '✗'} ${x.what}: ${x.detail}`); return L.join('\n'); }
    function finish() { const o = ST.result; if (ST.ear && ST.ear !== 'clean') o.verdicts.push({ lvl: 'bad', what: 'what you heard', detail: ST.ear }); else o.verdicts.push({ lvl: 'ok', what: 'what you heard', detail: ST.ear }); o.heard = ST.ear;
      const rows = o.verdicts.map((x) => `<tr><td class="${x.lvl}">${x.lvl === 'ok' ? '✓' : x.lvl === 'warn' ? '!' : '✗'}</td><td><b>${esc(x.what)}</b><br><span class="dim">${esc(x.detail)}</span></td></tr>`).join('');
      const bad = o.verdicts.some((x) => x.lvl === 'bad'), warn = o.verdicts.some((x) => x.lvl === 'warn'); $('#hwcMsg', P).innerHTML = bad ? '<span class="bad">Something needs attention.</span>' : warn ? '<span class="warn">Works, with notes.</span>' : '<span class="ok">All clear on this machine.</span>';
      $('#hwcRes', P).innerHTML = `<table>${rows}</table><button id="hwcCopy">Copy report</button><button id="hwcDl">Download report</button><pre id="hwcTxt">${esc(text())}</pre>`;
      $('#hwcCopy', P).onclick = () => { navigator.clipboard.writeText(text() + '\n\n' + JSON.stringify(o)).then(() => { $('#hwcCopy', P).textContent = 'Copied'; }, () => { const r = document.createRange(); r.selectNode($('#hwcTxt', P)); getSelection().removeAllRanges(); getSelection().addRange(r); }); };
      $('#hwcDl', P).onclick = () => { const b = new Blob([text() + '\n\n' + JSON.stringify(o, null, 1)], { type: 'text/plain' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `forge-hardware-check-${o.when.slice(0, 16).replace(/[:T]/g, '-')}.txt`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
      window.__hwcheck = o; }
    window.__hwc = { run, scan, state: ST, analyse, receiver, verdicts };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

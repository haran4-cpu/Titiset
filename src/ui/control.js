/* ===================== DJ TiTo · CONTROL OF EVERYTHING THAT PLAYS (v10.1) =====================
   CHANNELS (MIX): a mixer for each deck — every part that plays (and the FX and the atmosphere) with Mute, Solo and a level fader,
   quick solo groups (Drums · Bass · Music · FX · Atmos) and Clear. Solo is additive (several parts at once); "only" solos one part alone.
   A part's level is the same one EDIT · Mix shows. On the PLAY deck a tap still mutes; a long press solos that part alone.
   EAR CANDY (FX): which kinds of ear candy may play (a kind switched off is replaced by one you kept, in the same place), their level
   and density, and the risers and impacts on or off with their level — for both decks, remembered in this browser.
   ATMOSPHERE (FX): the background under the track — the track's own, none, vinyl, air, dark, psy or rain — its level and its tone;
   kept in the track (spec.fx.atmos), so a library track brings it back. */
const CH_LABEL = ['Kick', 'Snare', 'Hats', 'Perc', 'Bass', 'Chords', 'Pad', 'Lead', 'Arp', 'FX', 'Atmos'], CH_SLOT = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'arp', null, null];
const CH_GROUPS = [['Drums', [0, 1, 2, 3]], ['Bass', [4]], ['Music', [5, 6, 7, 8]], ['FX', [9]], ['Atmos', [10]]];
const CTL = { deck: 0 };
// ---- mute and solo: what the engine plays is your mutes, unless something is soloed — then only the soloed parts
function chSolo(D) { if (!D.solo) D.solo = new Set(); return D.solo; }
function chEffMuted(D, c) { const S = chSolo(D); return !!D.mute[c] || (S.size > 0 && !S.has(c)); }
function chApply(i) { const D = decks[i]; if (!D.emute) D.emute = new Array(11).fill(false); for (let c = 0; c < 11; c++) { const m = chEffMuted(D, c); if (m !== D.emute[c]) { D.emute[c] = m; send({ type: 'mute', deck: i, ch: c, on: m }); } } renderStems(i); if (CTL.deck === i) renderChannels(); }
function chSoloSet(i, chs, only) { const S = chSolo(decks[i]); if (only) { const same = S.size === chs.length && chs.every((c) => S.has(c)); S.clear(); if (!same) for (const c of chs) S.add(c); } else for (const c of chs) { if (S.has(c)) S.delete(c); else S.add(c); } chApply(i); }
function chLevelOf(D, c) { const sl = CH_SLOT[c]; if (sl) return (D.partMix && D.partMix[sl] && D.partMix[sl].level) || 1; return (D.chLvl && D.chLvl[c]) || 1; }
function chLevelSet(i, c, v) { const D = decks[i], sl = CH_SLOT[c]; if (sl) { const M = D.partMix || (D.partMix = {}), st = M[sl] || (M[sl] = { level: 1, echo: 0, verb: 0 }); st.level = v; st.touched = true; clearTimeout(st.tl); st.tl = setTimeout(() => tastePartLevel(sl, v), 700); } else { (D.chLvl || (D.chLvl = {}))[c] = v; } send({ type: 'partGain', deck: i, ch: c, v }); }
function chUsed(D) { const used = new Array(11).fill(false); if (D.score) { const ev = D.score.ev; for (let k = 0; k < ev.n; k++) if (ev.ch[k] < 11) used[ev.ch[k]] = true; } if (D.atK > 0) used[10] = true; return used; }
function buildChannels(el) { el.innerHTML = `<div class="ml-head"><h3>Channels</h3><div class="seg ch-deck" role="group" aria-label="Deck"><button data-chd="0">Deck A</button><button data-chd="1">Deck B</button></div></div>
    <div class="ch-groups" role="group" aria-label="Solo a group"><span class="lbl">Solo</span>${CH_GROUPS.map(([l], k) => `<button class="btn" data-chg="${k}">${l}</button>`).join('')}<button class="btn" data-chclr>Clear solo</button></div>
    <div class="ch-rows"></div><p class="dk-legend">M mutes a part, S adds it to the solo (several at once), ◎ solos it alone. A long press on a part on the PLAY deck solos it alone too.</p>`;
  $$('[data-chd]', el).forEach((b) => b.onclick = () => { CTL.deck = +b.dataset.chd; renderChannels(); });
  $$('[data-chg]', el).forEach((b) => b.onclick = () => chSoloSet(CTL.deck, CH_GROUPS[+b.dataset.chg][1], true));
  $('[data-chclr]', el).onclick = () => { chSolo(decks[CTL.deck]).clear(); chApply(CTL.deck); };
  renderChannels(); }
function renderChannels() { const el = $('.chmix'); if (!el) return; const i = CTL.deck, D = decks[i], used = chUsed(D), S = chSolo(D), box = $('.ch-rows', el);
  $$('[data-chd]', el).forEach((b) => { const on = +b.dataset.chd === i; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  $$('[data-chg]', el).forEach((b) => { const g = CH_GROUPS[+b.dataset.chg][1], on = S.size === g.length && g.every((c) => S.has(c)); b.classList.toggle('on', on); });
  if (!D.score) { box.innerHTML = '<div class="dk-empty">Load a track on this deck first.</div>'; return; }
  box.innerHTML = CH_LABEL.map((l, c) => { if (!used[c]) return ''; const lv = chLevelOf(D, c), db = 20 * Math.log10(Math.max(1e-4, lv)), m = !!D.mute[c], s = S.has(c), eff = chEffMuted(D, c);
    return `<div class="ch-row${eff ? ' off' : ''}" data-ch="${c}"><button class="ch-m${m ? ' on' : ''}" data-chm="${c}" aria-pressed="${m}" aria-label="Mute ${l}">M</button><button class="ch-s${s ? ' on' : ''}" data-chs="${c}" aria-pressed="${s}" aria-label="Solo ${l}">S</button><button class="ch-o" data-cho="${c}" aria-label="Solo ${l} alone" title="Solo alone">◎</button>
      <span class="ch-n">${l}</span><input type="range" id="chl${i}-${c}" min="0" max="2" step="0.01" value="${lv}" data-chl="${c}" aria-label="${l} level"><span class="ch-db">${db > 0 ? '+' : ''}${db.toFixed(1)} dB</span></div>`; }).join('');
  $$('[data-chm]', box).forEach((b) => b.onclick = () => { const c = +b.dataset.chm; D.mute[c] = !D.mute[c]; chApply(i); });
  $$('[data-chs]', box).forEach((b) => b.onclick = () => chSoloSet(i, [+b.dataset.chs], false));
  $$('[data-cho]', box).forEach((b) => b.onclick = () => chSoloSet(i, [+b.dataset.cho], true));
  $$('[data-chl]', box).forEach((r) => { r.oninput = () => { const c = +r.dataset.chl, v = +r.value; chLevelSet(i, c, v); const db = 20 * Math.log10(Math.max(1e-4, v)); setText(r.nextElementSibling, `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`); }; r.ondblclick = () => { r.value = 1; r.oninput(); }; }); }
// ---- EAR CANDY and TRANSITIONS: one setting for both decks
const CANDY_UI = [[9, 'Bubbles'], [14, 'Blip'], [15, 'Sonar'], [16, 'Click'], [17, 'Dub stab'], [18, 'Drop'], [19, 'Glitch'], [7, 'Glass'], [8, 'Harp'], [10, 'Wind'], [11, 'Acid'], [12, 'Ping']];
const CANDY_DEF = { allow: (1 << 9) | (1 << 14) | (1 << 15) | (1 << 16) | (1 << 17) | (1 << 18) | (1 << 19), level: 1, density: 1, tx: 1, txLevel: 1 };
const CANDY = (() => { try { const j = JSON.parse(localStorage.getItem('tito.candy') || 'null'); if (j && typeof j.allow === 'number') return Object.assign({}, CANDY_DEF, j); } catch (e) { /* no storage: the defaults */ } return Object.assign({}, CANDY_DEF); })();
function candySend() { for (let i = 0; i < 2; i++) send({ type: 'candy', deck: i, allow: CANDY.allow, level: CANDY.level, density: CANDY.density, tx: CANDY.tx, txLevel: CANDY.txLevel }); try { localStorage.setItem('tito.candy', JSON.stringify(CANDY)); } catch (e) { /* the session still has it */ } }
function buildCandy(el) { el.innerHTML = `<h4>Ear candy and transitions — both decks</h4>
    <div class="dk-chips cd-kinds" role="group" aria-label="Ear candy that may play">${CANDY_UI.map(([k, l]) => `<button class="dk-chip" data-cdk="${k}">${l}</button>`).join('')}</div>
    <p class="dk-legend">Lit kinds may play; a kind you switch off is replaced by one you kept, in the same place. Tap ▶ to hear the last one you touched.</p>
    <div class="cd-knobs"><label class="mg-k"><span class="lbl">Candy level</span><input type="range" id="cdLvl" min="0" max="2" step="0.01" data-cd="level"></label><label class="mg-k"><span class="lbl">Candy density</span><input type="range" id="cdDen" min="0" max="1" step="0.01" data-cd="density"></label>
      <button class="btn" data-cdtry>▶ Hear it</button></div>
    <div class="cd-knobs"><button class="btn cd-tx" data-cdtx aria-pressed="true">Risers and impacts ON</button><label class="mg-k"><span class="lbl">Transition level</span><input type="range" id="cdTx" min="0" max="2" step="0.01" data-cd="txLevel"></label><button class="btn" data-cdreset>Defaults</button></div>`;
  let last = 9;
  $$('[data-cdk]', el).forEach((b) => b.onclick = () => { const k = +b.dataset.cdk; last = k; CANDY.allow ^= 1 << k; if (!(CANDY.allow & 0xffffff80)) { CANDY.allow |= 1 << k; toast('At least one kind stays on — lower the density to hear less candy'); } candySend(); renderCandy(); });
  $$('[data-cd]', el).forEach((r) => r.oninput = () => { CANDY[r.dataset.cd] = +r.value; candySend(); });
  $('[data-cdtx]', el).onclick = () => { CANDY.tx = CANDY.tx ? 0 : 1; candySend(); renderCandy(); };
  $('[data-cdreset]', el).onclick = () => { Object.assign(CANDY, CANDY_DEF); candySend(); renderCandy(); };
  $('[data-cdtry]', el).onclick = async () => { await startAudio(); const i = SHELL.fxDeck, D = decks[i]; if (!D.playing) { toast(`Deck ${'AB'[i]} is not playing — the candy plays in key with the track`); } send({ type: 'fxNow', deck: i, kind: last, v: 0.8 * CANDY.level, steps: last === 9 ? 4 : 3, note: 72 }); };
  renderCandy(); }
function renderCandy() { const el = $('.candy'); if (!el) return; $$('[data-cdk]', el).forEach((b) => { const on = !!(CANDY.allow & (1 << +b.dataset.cdk)); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  for (const r of $$('[data-cd]', el)) if (document.activeElement !== r) r.value = CANDY[r.dataset.cd]; const t = $('[data-cdtx]', el); t.classList.toggle('on', !!CANDY.tx); t.setAttribute('aria-pressed', CANDY.tx ? 'true' : 'false'); t.textContent = `Risers and impacts ${CANDY.tx ? 'ON' : 'OFF'}`; }
// ---- ATMOSPHERE: per deck, kept in the track
const ATMOS_UI = [[-1, 'Track\'s own'], [0, 'None'], [1, 'Vinyl'], [2, 'Air'], [3, 'Dark'], [4, 'Psy'], [5, 'Rain']], TEX_LABEL = { none: 'none', vinyl: 'vinyl', air: 'air', dark: 'dark', psyfx: 'psy', rain: 'rain' };
function atmosOf(i) { const D = decks[i], x = D.spec && D.spec.fx && D.spec.fx.atmos; return { kind: x && Number.isInteger(x.kind) ? x.kind : -1, level: x && typeof x.level === 'number' ? x.level : 1, tone: x && typeof x.tone === 'number' ? x.tone : 0 }; }
function atmosSend(i) { const D = decks[i], a = atmosOf(i); D.atK = a.kind; send({ type: 'atmos', deck: i, kind: a.kind, level: a.level, tone: a.tone }); }
function atmosSet(i, k, v) { const D = decks[i]; if (!D.spec) { toast(`Deck ${'AB'[i]} is empty`); return; } const a = atmosOf(i); a[k] = v; D.spec.fx = Object.assign({}, D.spec.fx || {}, { atmos: a }); if (D.score && D.score.spec) D.score.spec.fx = D.spec.fx; atmosSend(i); if (CTL.deck === i) renderChannels(); }
function buildAtmos(el) { el.innerHTML = `<h4>Atmosphere — the background of deck <span class="os-d">A</span></h4>
    <div class="dk-chips at-kinds" role="group" aria-label="Atmosphere">${ATMOS_UI.map(([k, l]) => `<button class="dk-chip" data-atk="${k}">${l}</button>`).join('')}</div>
    <div class="cd-knobs"><label class="mg-k"><span class="lbl">Level</span><input type="range" id="atLvl" min="0" max="2" step="0.01" data-at="level"></label><label class="mg-k"><span class="lbl">Tone · dark ↔ bright</span><input type="range" id="atTone" min="-1" max="1" step="0.01" data-at="tone"></label></div>
    <p class="dk-legend at-info"></p>`;
  $$('[data-atk]', el).forEach((b) => b.onclick = async () => { await startAudio(); atmosSet(SHELL.fxDeck, 'kind', +b.dataset.atk); renderAtmos(); });
  $$('[data-at]', el).forEach((r) => r.oninput = () => atmosSet(SHELL.fxDeck, r.dataset.at, +r.value));
  renderAtmos(); }
function renderAtmos() { const el = $('.atmos'); if (!el) return; const i = SHELL.fxDeck, D = decks[i], a = atmosOf(i), G = GENRE_BY_ID[D.gid];
  $$('[data-atk]', el).forEach((b) => { const on = +b.dataset.atk === a.kind; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  for (const r of $$('[data-at]', el)) if (document.activeElement !== r) r.value = a[r.dataset.at];
  setText($('.at-info', el), !D.score ? 'Load a track on this deck first.' : `This track's own: ${TEX_LABEL[(G && G.texture) || 'none'] || 'none'}. The choice is kept in the track — a library track brings it back.`); }
// a new track on a deck: its solo is cleared, its atmosphere (its own, or the one it was saved with) is sent
function ctlOnInstall(i) { const D = decks[i]; D.solo = null; D.emute = new Array(11).fill(false); D.chLvl = null; atmosSend(i); send({ type: 'candy', deck: i, allow: CANDY.allow, level: CANDY.level, density: CANDY.density, tx: CANDY.tx, txLevel: CANDY.txLevel }); if (CTL.deck === i) renderChannels(); if (SHELL.fxDeck === i) renderAtmos(); }

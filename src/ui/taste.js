/* ===================== DJ TiTo · YOUR SOUND — learning the user (v9.5; v10: the mix, part levels, More / Less) =====================
   FORGE watches what you choose and keeps going in that direction instead of starting from the genre's defaults every time:
   · the mood you pick stays picked (it is pinned until you pick another or Genre) — every new track, yours or Auto-DJ's, has it;
   · the sounds you choose, and the way you turn the knobs (brighter or darker, cleaner or dirtier), become weights on the sound
     bank's tags (warm, dark, glassy, punchy…) and on the sounds themselves: a new track's palette leans that way, in any genre;
   · the tracks you keep (saved, or played most of the way) and the ones you skip pull Auto-DJ's next genre toward or away;
   · the mix styles you choose by hand, the Mangle recipes and Beat FX you use, lean the mixes and the FX screen your way.
   Every weight decays a little with each new lesson (the recent ones count most), stays in bounds, and is shown on SET · Your
   sound, where any of it can be forgotten, learning switched off, or all of it reset. Kept in this browser only (localStorage). */
const TASTE_KEY = 'forge.taste';
function tasteFresh() { return { v: 1, on: true, mood: null, moods: {}, genres: {}, tags: {}, names: {}, mix: {}, fx: {}, mixAdj: {}, parts: {}, n: 0 }; }
let TASTE = (() => { try { const j = JSON.parse(localStorage.getItem(TASTE_KEY) || 'null'); if (j && j.v === 1) return Object.assign(tasteFresh(), j); } catch (e) { /* no storage: start fresh */ } return tasteFresh(); })();
let tasteT = 0; function tasteSave() { clearTimeout(tasteT); tasteT = setTimeout(() => { try { localStorage.setItem(TASTE_KEY, JSON.stringify(TASTE)); } catch (e) { /* storage full or blocked: the session still learns */ } }, 400); renderTaste(); }
// one lesson: every weight of the maps it touches decays 2 %, then the lesson's own weights move (each kept within −3 … +5)
function tasteBump(map, k, d) { if (!TASTE.on || !k) return; for (const x in map) { map[x] *= 0.98; if (Math.abs(map[x]) < 0.02) delete map[x]; } map[k] = clamp((map[k] || 0) + d, -3, 5); TASTE.n++; }
const TASTE_TAGS = (slot, name) => (SOUND_BANK[slot] && SOUND_BANK[slot][name] && SOUND_BANK[slot][name].tags) || [];
function tasteMood(mood) { if (!TASTE.on) return; TASTE.mood = mood || null; if (mood) tasteBump(TASTE.moods, mood, 1); tasteSave(); }
function tastePreset(slot, name) { if (!name || !TASTE.on) return; tasteBump(TASTE.names, slot + '/' + name, 1); for (const t of TASTE_TAGS(slot, name)) tasteBump(TASTE.tags, t, 0.6); tasteSave(); }
// knob moves: how far a gesture takes Cutoff / Tone up or down teaches bright or dark; Drive teaches gritty or clean
const tasteLast = {};
function tasteKnob(slot, k, v) { if (!TASTE.on || typeof v !== 'number') return; const id = slot + '/' + k, was = tasteLast[id]; tasteLast[id] = v; if (was == null) return;
  const rel = k === 'cut' ? Math.log2(Math.max(20, v) / Math.max(20, was)) / 3 : k === 'tone' || k === 'uTone' ? (v - was) / 2 : k === 'drive' || k === 'uDrive' ? (v - was) / (k === 'drive' ? 3 : 1) : 0; if (!rel) return;
  const pairs = k === 'drive' || k === 'uDrive' ? ['gritty', 'soft'] : ['bright', 'dark'], d = clamp(rel, -0.25, 0.25) * 0.8; tasteBump(TASTE.tags, pairs[d > 0 ? 0 : 1], Math.abs(d)); tasteBump(TASTE.tags, pairs[d > 0 ? 1 : 0], -Math.abs(d) * 0.5); tasteSave(); }
// a track kept (w = 2: saved to the library; 1: played most of the way) or skipped (replaced early, after a hearing)
function tasteTrack(s, w) { if (!TASTE.on || !s) return; tasteBump(TASTE.genres, s.meta.gid, 0.5 * w); const sp = s.spec && s.spec.sound || {}; for (const slot of ['lead', 'chords', 'pad', 'bass', 'arp']) if (sp[slot] && sp[slot].preset) { tasteBump(TASTE.names, slot + '/' + sp[slot].preset, 0.3 * w); for (const t of TASTE_TAGS(slot, sp[slot].preset)) tasteBump(TASTE.tags, t, 0.15 * w); } tasteSave(); }
function tasteKeep(i, w) { tasteTrack(decks[i].score, w || 1); }
// installScore asks: was the track it replaces kept (played past 60 %) or skipped (heard for 8 bars, replaced before a quarter)?
function tasteOnReplace(D) { const s = D.score; if (!s || !TASTE.on) return; const bars = s.meta.bars, at = (D.pos || 0) / 16; if (at >= bars * 0.6) tasteTrack(s, 1); else if (at >= 8 && at < bars * 0.25) tasteTrack(s, -1); }
// (v10) the deck sound (MIX · Deck sound): how far you move a knob from the genre's own setting is remembered (a running average, recent
// moves count most) and new tracks start that far over, at 70 % — so a reverb you always pull down stays down in the next track
const TASTE_MIXK = { verb: [0, 1, 'Reverb'], delay: [0, 1, 'Delay'], sidechain: [0, 0.9, 'Pump'], heat: [0, 2, 'Heat'], punch: [0, 2, 'Punch'], carve: [0, 1, 'Space'] };
function tasteMixKnob(key, v, def) { if (!TASTE.on || !TASTE_MIXK[key] || typeof v !== 'number' || typeof def !== 'number') return; const A = TASTE.mixAdj; A[key] = (A[key] || 0) * 0.6 + (v - def) * 0.4; if (Math.abs(A[key]) < 0.01) delete A[key]; TASTE.n++; tasteSave(); }
function tasteMixFor(gid) { const G = GENRE_BY_ID[gid]; if (!G || !G.mix || !TASTE.mixAdj || !Object.keys(TASTE.mixAdj).length) return null; const M = G.mix, base = { verb: M.verb, delay: M.delay, sidechain: M.sc, heat: M.heat != null ? M.heat : 1, punch: M.punch != null ? M.punch : 1, carve: M.carve != null ? M.carve : 1 };
  const o = { lufs: M.lufs }; for (const k in TASTE_MIXK) { const [lo, hi] = TASTE_MIXK[k], a = TASTE.mixAdj[k] || 0; if (base[k] == null) continue; o[k] = +clamp(base[k] + 0.7 * a, lo, hi).toFixed(3); } return o; }
// part levels (EDIT · Mix · Level): the same, in dB — a bass you keep turning up comes up in the next track
function tastePartLevel(part, v) { if (!TASTE.on || !(v > 0)) return; const d = 20 * Math.log10(v), P = TASTE.parts; P[part] = (P[part] || 0) * 0.6 + d * 0.4; if (Math.abs(P[part]) < 0.2) delete P[part]; TASTE.n++; tasteSave(); }
function tasteApplyParts(i) { if (!TASTE.on || !TASTE.parts) return; const D = decks[i], M = D.partMix || (D.partMix = {}); for (const part in TASTE.parts) { const ch = SLOT_CH[part]; if (ch == null) continue; const st = M[part] || (M[part] = { level: 1, echo: 0, verb: 0 }); if (st.touched) continue; const v = +Math.pow(10, 0.7 * TASTE.parts[part] / 20).toFixed(3); st.level = v; send({ type: 'partGain', deck: i, ch, v }); } }
// More / Less like this (the deck's ♥ More and Less): a strong lesson on the track that is playing — its genre, its sounds, its mood
function tasteLike(i, s) { const D = decks[i]; if (!D.score) { toast(`Deck ${'AB'[i]} is empty`); return; } if (!TASTE.on) { toast('Learning is paused (SET · Your sound)'); return; } tasteTrack(D.score, 2 * s); const md = D.score.spec && D.score.spec.mood; if (md) tasteBump(TASTE.moods, md, s); tasteSave();
  toast(s > 0 ? `More like this — new tracks lean toward ${D.score.meta.name}` : `Less like this — new tracks lean away from ${D.score.meta.name}`); }
function tasteMix(id) { if (id && id !== 'auto') { tasteBump(TASTE.mix, id, 1); tasteSave(); } }
function tasteFx(id) { if (id) { tasteBump(TASTE.fx, id, 1); tasteSave(); } }
// what the composer, Auto-DJ and the mix read
function tastePref() { if (!TASTE.on || TASTE.n < 1) return null; return { tags: TASTE.tags, names: TASTE.names }; }
function tasteFav(prefix) { let best = null, bw = 0.9; for (const k in TASTE.fx) if (k.startsWith(prefix) && TASTE.fx[k] > bw) { bw = TASTE.fx[k]; best = k.slice(prefix.length); } return best; }
// ---- SET · Your sound
const tasteTop = (m, n, min) => Object.entries(m).filter(([, w]) => w > (min ?? 0.3)).sort((a, b) => b[1] - a[1]).slice(0, n);
function renderTaste() { const el = $('.taste'); if (!el) return; const T = TASTE, chip = (kind, k, label, w) => `<span class="ts-chip" title="weight ${w.toFixed(1)}">${esc(label)}<button data-tforget="${kind}|${esc(k)}" aria-label="Forget ${esc(label)}">✕</button></span>`;
  const G = tasteTop(T.genres, 6).map(([k, w]) => chip('genres', k, (GENRE_BY_ID[k] || { name: k }).name, w)), Tg = tasteTop(T.tags, 8).map(([k, w]) => chip('tags', k, k, w)), N = tasteTop(T.names, 6).map(([k, w]) => { const [slot, n] = k.split('/'); return chip('names', k, `${(SOUND_BANK[slot] && SOUND_BANK[slot][n] && SOUND_BANK[slot][n].label) || n} (${slot})`, w); });
  const Mx = tasteTop(T.mix, 4).map(([k, w]) => chip('mix', k, (TX_BY_ID[k] || { name: k }).name, w)), Fx = tasteTop(T.fx, 5).map(([k, w]) => chip('fx', k, k.replace(/^\w+:/, ''), w)), Dis = Object.entries(T.genres).filter(([, w]) => w < -0.4).map(([k, w]) => chip('genres', k, (GENRE_BY_ID[k] || { name: k }).name, w));
  const row = (l, a, empty) => `<div class="ts-row"><span class="lbl">${l}</span><div class="ts-chips">${a.length ? a.join('') : `<span class="dk-legend">${empty}</span>`}</div></div>`;
  el.innerHTML = `<div class="ml-head"><h3>Your sound</h3><span class="ml-sp"></span><label class="rz-hit"><input type="checkbox" id="tasteOn" ${T.on ? 'checked' : ''}> learning</label><button class="btn${LIB.sure === 'taste' ? ' warn' : ''}" data-treset>${LIB.sure === 'taste' ? 'Forget everything?' : 'Reset'}</button></div>
    <p class="dk-legend">What DJ TiTo has learned from your choices — new tracks, Auto-DJ and the mixes lean this way (with room for surprises). ✕ forgets one thing.</p>
    ${row('Mood', T.mood ? [`<span class="ts-chip on">${esc(T.mood)} — stays on every new track<button data-tmood aria-label="Unpin the mood">✕</button></span>`] : [], 'none pinned: pick one on a deck and it stays')}
    ${row('Genres you keep', G, 'save tracks, or play them most of the way')}${Dis.length ? row('Genres you skip', Dis, '') : ''}${row('Sound', Tg, 'choose sounds and turn knobs: brighter or darker, cleaner or dirtier')}${row('Sounds you pick', N, 'pick sounds on EDIT · Sound')}${row('Mix styles', Mx, 'choose a mix style by hand')}${row('Deck sound', Object.entries(T.mixAdj || {}).map(([k, w]) => chip('mixAdj', k, `${TASTE_MIXK[k] ? TASTE_MIXK[k][2] : k} ${w > 0 ? '+' : ''}${w.toFixed(2)}`, Math.abs(w))), 'set Reverb, Pump, Heat, Space… on MIX · Deck sound')}${row('Part levels', Object.entries(T.parts || {}).map(([k, w]) => chip('parts', k, `${k} ${w > 0 ? '+' : ''}${w.toFixed(1)} dB`, Math.abs(w))), 'set a part\'s Level on EDIT · Mix')}${row('Effects', Fx, 'use Mangle recipes and Beat FX')}`;
  $('#tasteOn', el).onchange = (e) => { TASTE.on = e.target.checked; tasteSave(); toast(TASTE.on ? 'DJ TiTo learns your sound again' : 'Learning paused — what it knows stays until you reset it'); };
  $('[data-treset]', el).onclick = () => { if (LIB.sure !== 'taste') { LIB.sure = 'taste'; renderTaste(); return; } LIB.sure = null; const on = TASTE.on; TASTE = tasteFresh(); TASTE.on = on; tasteSave(); toast('Your sound reset — DJ TiTo starts from the genres again'); };
  const um = $('[data-tmood]', el); if (um) um.onclick = () => { TASTE.mood = null; tasteSave(); };
  $$('[data-tforget]', el).forEach((b) => b.onclick = () => { const [kind, k] = b.dataset.tforget.split('|'); delete TASTE[kind][k]; tasteSave(); }); }
function buildTaste() { const set = $('.screen[data-screen="set"] .scr-in'), nw = $('.set-new'); if (!set || $('.taste')) return; const el = document.createElement('section'); el.className = 'taste'; el.setAttribute('aria-label', 'Your sound'); if (nw && nw.nextSibling) set.insertBefore(el, nw.nextSibling); else set.appendChild(el); renderTaste(); }

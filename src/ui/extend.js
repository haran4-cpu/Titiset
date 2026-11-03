// ---------------------------------------------------------------- (v9.4) EXTEND · RIDE · ENDLESS
// The deck keeps playing the same track, longer — no transition, no second track. EXTEND puts one more act (a breakdown and a build
// into a new drop, a lift out of the groove, a false drop…) in the track's own style right after the drop that is playing or coming
// (after the section that is playing when no drop is ahead); in the outro, the outro is cut at its next 4-bar line and the new act
// and a fresh outro follow. RIDE carries the playing section on for 16–32 more bars (in a build: the drop it leads to). ENDLESS presses Extend for you whenever the track reaches its last drop (until you switch it off or start a mix).
// The continuation is composed from the track's own seed, sounds and ideas; nothing that has played changes; the new form swaps in on
// the next 4-bar line (commitSpec). The form stays written in the score, so a saved set keeps the longer track.
const EXT = { endless: [false, false], at: [-1, -1] };
function extSection(D) { const S = D.score.sections, bar = Math.floor(schedPos(D) / 16); for (let k = 0; k < S.length; k++) if (bar < S[k].bar0 + S[k].bars) return { k, rel: bar - S[k].bar0 }; return { k: S.length - 1, rel: 0 }; }
function extendDeck(i, how, quiet) { const D = decks[i]; if (!D.score || !D.spec) { if (!quiet) toast('Load a track into this deck first'); return false; } if (!Array.isArray(D.spec.form)) { if (!quiet) toast('This track has no written form to extend'); return false; }
  const G = GENRE_BY_ID[D.gid]; if (!G) return false; const pos = extSection(D), rel = pos.rel, form = D.spec.form.map((f) => Object.assign({}, f)), S = D.score.sections;
  // (before a drop — in the intro, a groove, a breakdown or a build — the new act follows the drop that is coming: a build is never cut off from its drop)
  let k = pos.k; if ((how !== 'ride' && S[k].type !== 'drop' && S[k].type !== 'outro') || (how === 'ride' && S[k].type === 'build')) { const nd = S.findIndex((x, j) => j > k && x.type === 'drop'); if (nd > 0) k = nd; } const cur = S[k];
  const n = (D.spec.ext = (D.spec.ext || 0) + 1), r = rng(hashStr('extend/' + D.gid + '/' + (D.spec.seed >>> 0) + '/' + n));
  const act = extensionAct(G, r, how, cur).map(([t, b, l]) => { const f = { section: t, bars: b }; if (l && l !== SPEC_DEFAULT_LAYER[t]) f.layer = l; return f; });
  if (!act.length) return false; snap(D);
  let tail = form.slice(k + 1); if (cur.type === 'outro') { form[k].bars = Math.min(cur.bars, Math.max(4, Math.ceil((rel + 2) / 4) * 4)); if (how !== 'ride') tail = [{ section: 'outro', bars: G.form === 'bass' ? 16 : 32 }]; else tail = form.slice(k, k + 1).map((f) => Object.assign({}, f, { bars: cur.bars })); } // (in the outro: cut it short, then the act and a fresh outro)
  if (how === 'ride' && cur.type === 'outro') act.length = 0, act.push({ section: 'groove', bars: 32, layer: 'groove2' });
  D.spec.form = form.slice(0, k + 1).concat(act, tail); const bars = D.spec.form.reduce((a, f) => a + f.bars, 0), added = act.reduce((a, f) => a + f.bars, 0);
  commitSpec(i, { q: 4 }).then((s) => { if (s && !quiet) toast(`${'AB'[i]}: ${how === 'ride' ? 'riding on' : 'extended'} — ${added} more bars (${act.map((f) => f.layer === 'tease' ? 'false drop' : f.section).join(' → ')}), ${Math.round(bars * 4 / (s.meta.bpm || 124))} min in all`); renderExtend(); });
  return true; }
// Endless: before the last drop ends (or as the outro begins), one more act
function extendTick() { for (let i = 0; i < 2; i++) { if (!EXT.endless[i]) continue; const D = decks[i]; if (!D.playing || !D.score || (tx && (tx.a === i || tx.b === i))) continue;
    const S = D.score.sections, { k } = extSection(D), last = S.map((x) => x.type).lastIndexOf('drop'), bar = Math.floor(schedPos(D) / 16); if (last < 0) continue;
    const near = k > last || (k === last && bar >= S[last].bar0 + S[last].bars - 8); if (near && EXT.at[i] !== S.length) { EXT.at[i] = S.length; extendDeck(i, 'extend', true); toast(`${'AB'[i]}: Endless — one more act`); } } }
function renderExtend() { const box = $('.tp-ext'); if (!box) return; const i = decks[lead].playing ? lead : decks[lead ^ 1].playing ? lead ^ 1 : lead;
  setText($('[data-ext=extend]', box), `+ Extend ${'AB'[i]}`); setText($('[data-ext=ride]', box), `Ride ${'AB'[i]}`); const e = $('[data-ext=endless]', box); setText(e, `∞ ${EXT.endless[i] ? 'On' : 'Endless'}`); e.classList.toggle('on', !!EXT.endless[i]); e.setAttribute('aria-pressed', EXT.endless[i] ? 'true' : 'false'); box.dataset.deck = i; }
function wireExtend(box) { const deckOf = () => +box.dataset.deck || 0;
  $('[data-ext=extend]', box).onclick = () => extendDeck(deckOf(), 'extend'); $('[data-ext=ride]', box).onclick = () => extendDeck(deckOf(), 'ride');
  $('[data-ext=endless]', box).onclick = () => { const i = deckOf(); EXT.endless[i] = !EXT.endless[i]; EXT.at[i] = -1; toast(EXT.endless[i] ? `${'AB'[i]}: Endless — the track keeps growing until you switch it off or start a mix` : `${'AB'[i]}: Endless off — the track ends as written`); renderExtend(); }; renderExtend(); }

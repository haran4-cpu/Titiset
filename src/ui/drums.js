/* ===================== FORGE · DRUMS editor additions (v9.5) =====================
   A brush for the step grid (accent, hit, ghost, ratchets of 2 / 3 / 4, a hit on about half the bars, a flam), the selected
   lane's tools (shift, reverse, mutate, a Euclidean fill, a rhythm from the library, double, clear) and its own feel (Swing,
   Nudge, Chance, Human), and the six knobs every drum has (Tune, Decay, Tone, Snap, Drive, Level) with each voice's own knobs
   — the kick designer — under them. */
const DR_BRUSH = [['X', 'Accent', 'Accent'], ['x', 'Hit', 'Hit'], ['g', 'Ghost', 'Ghost'], ['2', '×2', 'Ratchet: 2 hits in the step'], ['3', '×3', 'Ratchet: 3 hits in the step'], ['4', '×4', 'Ratchet: 4 hits in the step'], ['?', '50 %', 'Chance: a hit on about half the bars'], ['f', 'Flam', 'Flam: a soft grace hit just before']];
const DR_CELL = { X: 'cX', x: 'cx', o: 'co', g: 'cg', r: 'cr', z: 'cz', q: 'cq', 2: 'cr2', 3: 'cr3', 4: 'cr4', '?': 'cch', f: 'cfl' };
const DR_GLYPH = { 2: '2', 3: '3', 4: '4', r: '2', z: '3', q: '4', '?': '?', f: 'f' };
const DR_U = [['uTune', 'Tune', -12, 12, 'lin', 'st', 0], ['uDecay', 'Decay', -1, 1, 'lin', '', 0], ['uTone', 'Tone', -1, 1, 'lin', '', 0], ['uSnap', 'Snap', 0, 1, 'lin', '', 0], ['uDrive', 'Drive', 0, 1, 'lin', '', 0], ['uLevel', 'Level', -18, 6, 'lin', 'dB', 0]];
const DR_KICK_MORE = [['fStart', 'Sweep from', 80, 500, 'log', 'Hz'], ['pDec', 'Sweep time', 0.008, 0.15, 'log', 's'], ['clickF', 'Click tone', 1000, 9000, 'log', 'Hz'], ['sub', 'Sub', 0, 1]];
const DR_LANE_P = [['swing', 'Swing', 0, 1, 'Its odd 16ths later (up to a third of a step), on top of the track\'s swing'], ['nudge', 'Nudge', -1, 1, 'All of it earlier (−) or later (+), up to a quarter step: a laid-back snare, a pushed hat'], ['chance', 'Chance', 0, 1, 'Each hit plays with this probability (the same every play)'], ['human', 'Human', 0, 1, 'Timing and level wander a little, hit by hit']];
// a rhythm library per kind of lane (16 steps each)
const DR_LIB = {
  kick: [['Four on the floor', 'X...X...X...X...'], ['Four + push', 'X...X...X...X.x.'], ['Two-step', 'X.........X.....'], ['Broken', 'X.....X...X.....'], ['Half-time', 'X...............'], ['Breakbeat', 'X.........X..x..'], ['Rolling', 'X..x..x.X..x....'], ['Trap', 'X......x..X.....'], ['Gallop', 'X..xX..xX..xX..x'], ['Dembow', 'X...X...X...X...']],
  snare: [['Backbeat', '....X.......X...'], ['Half-time', '........X.......'], ['Backbeat + ghosts', '....X..g.g..X...'], ['Shuffle', '....X..g....X.g.'], ['Breakbeat', '....X.....g.X..g'], ['Dembow', '...X..X....X..X.'], ['Flam backbeat', '....f.......f...'], ['Roll out', '....X.......X.23']],
  closed: [['8ths', 'x.x.x.x.x.x.x.x.'], ['Offbeat 8ths', '..x...x...x...x.'], ['16ths', 'xgxgxgxgxgxgxgxg'], ['Shuffled 16ths', 'x.xgx.xgx.xgx.xg'], ['Trap rolls', 'x.x.x.x2x.x.x3x.'], ['Gallop', 'x.xxx.xxx.xxx.xx'], ['Chance 16ths', 'x?x?x?x?x?x?x?x?']],
  open: [['Offbeat', '..x...x...x...x.'], ['Last 8th', '..............x.'], ['Every bar end', '..........x.....']],
  ride: [['Quarters', 'x...x...x...x...'], ['8ths', 'x.x.x.x.x.x.x.x.'], ['Jazz', 'x...x.xgx...x.xg']],
  shaker: [['16ths', 'xgxgxgxgxgxgxgxg'], ['8ths', 'x.x.x.x.x.x.x.x.'], ['Samba', 'x.xxx.xxx.xxx.xx']],
  rim: [['Clave 3-2', 'x..x..x...x.x...'], ['Clave 2-3', '..x.x...x..x..x.'], ['Offbeat', '..x...x...x...x.'], ['Tresillo', 'x..x..x.x..x..x.']],
  perc: [['Clave 3-2', 'x..x..x...x.x...'], ['Tumbao', '...x..xx...x..x.'], ['Cowbell', 'x.x..x.x..x.x..x'], ['Tresillo', 'x..x..x.x..x..x.'], ['Afro 12', 'x.xx.x.xx.x.x.xx'], ['Sparse', '......x.......x.']] };
function drEuclid(k, n, rot) { let s = ''; for (let i = 0; i < n; i++) { const j = (i + n - (rot || 0)) % n; s += Math.floor((j + 1) * k / n) !== Math.floor(j * k / n) ? 'x' : '.'; } return s; }
// small random changes that keep a lane's character: a ghost added or dropped, a hit moved by one step, an accent swapped
function drMutate(s, r) { const a = s.split(''), n = a.length; for (let t = 0; t < Math.max(2, n / 8); t++) { const i = Math.floor(r() * n), c = a[i], u = r();
    if (c === '.') { if (u < 0.55 && (i & 1)) a[i] = 'g'; } else if (c === 'g' && u < 0.5) a[i] = '.'; else if (u < 0.3 && a[(i + 1) % n] === '.' && i % 4) { a[(i + 1) % n] = c; a[i] = '.'; } else if (u < 0.45 && c === 'x') a[i] = 'X'; else if (u < 0.6 && c === 'X' && i % 4) a[i] = 'x'; else if (u < 0.7 && (c === 'x' || c === 'g')) a[i] = '2'; }
  return a.join(''); }
// the lane the tools and the feel work on (a row key: kick, snare, … or p0, p1 for percussion rows)
function drLaneKey(id) { return /^p\d+$/.test(id) ? 'perc' : id; }
function drumLaneTools(f, pat, len) { const ids = LANE_ORDER.filter((l) => pat[l] != null).concat((pat.perc || []).map((p, k) => 'p' + k)); if (!ids.includes(DOCK.dlane)) DOCK.dlane = ids[0] || 'kick'; const id = DOCK.dlane, key = drLaneKey(id), lib = DR_LIB[key] || DR_LIB.perc, lp = (f.D.spec.drums.lanes || {})[key] || {};
  const rows = LANE_ORDER.filter((l) => pat[l] != null).map((l) => [l, l]).concat((pat.perc || []).map((p, k) => ['p' + k, p.kind]));
  return `<div class="dk-lanebar"><label class="dk-field"><span class="lbl">Lane</span><select class="btn" data-lsel aria-label="The lane the tools and the feel work on">${rows.map(([v, l]) => `<option value="${v}"${v === id ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <button class="btn" data-lop="left" title="Shift one step earlier">◀</button><button class="btn" data-lop="right" title="Shift one step later">▶</button><button class="btn" data-lop="rev" title="Reverse">Reverse</button><button class="btn" data-lop="mut" title="Small changes that keep its character">Mutate</button><button class="btn" data-lop="dbl" title="Every hit doubled into a ratchet">Ratchet all</button><button class="btn" data-lop="clr" title="Clear this bar">Clear</button><button class="btn" data-lans title="Add a bar that answers this one — every lane in its own idiom (call and response)">Answer bar</button>
    <select class="btn" data-leuc aria-label="Euclidean fill"><option value="">Euclid…</option>${[3, 4, 5, 6, 7, 9, 11, 13].map((k) => `<option value="${k}">${k} in 16</option>`).join('')}</select>
    <select class="btn" data-llib aria-label="Rhythm library"><option value="">Rhythm…</option>${lib.map(([n], k) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
    <div class="dk-lanefeel">${DR_LANE_P.map(([k, l, mn, mx, tip]) => `<label class="dk-field" title="${esc(tip)}"><span class="lbl">${l}</span><input type="range" min="${mn}" max="${mx}" step="0.05" value="${lp[k] != null ? lp[k] : k === 'chance' ? 1 : 0}" data-lfeel="${k}" aria-label="${l} of the ${esc(key)} lane"><b>${lp[k] != null ? (+lp[k]).toFixed(2) : k === 'chance' ? '1.00' : '0.00'}</b></label>`).join('')}</div>`; }
function wireDrumLaneTools(body, f, pat, len, pg) { const id = DOCK.dlane || 'kick', key = drLaneKey(id);
  const get = () => (/^p\d+$/.test(id) ? pat.perc && pat.perc[+id.slice(1)] && clean(pat.perc[+id.slice(1)].steps) : pat[id] != null ? clean(pat[id]) : null);
  const put = (fn) => edit(() => { let s = get(); if (s == null) return; if (s.length < len) s = s.repeat(len / s.length); s = fn(s); if (/^p\d+$/.test(id)) pat.perc[+id.slice(1)].steps = groupBars(s); else pat[id] = groupBars(s); });
  const bar = (fn) => put((s) => { const nb = s.length / 16, k = pg % nb; return s.slice(0, k * 16) + fn(s.slice(k * 16, k * 16 + 16)) + s.slice(k * 16 + 16); });
  $$('[data-lop]', body).forEach((b) => b.onclick = () => { const op = b.dataset.lop; let seed = (Date.now() & 0xffff) + 1; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    if (op === 'left') put((s) => s.slice(1) + s[0]); else if (op === 'right') put((s) => s[s.length - 1] + s.slice(0, -1)); else if (op === 'rev') bar((s) => s.split('').reverse().join(''));
    else if (op === 'mut') bar((s) => drMutate(s, r)); else if (op === 'dbl') bar((s) => s.replace(/[Xxog]/g, '2')); else bar(() => '.'.repeat(16)); });
  const an = $('[data-lans]', body); if (an) an.onclick = () => edit(() => { const all = LANE_ORDER.filter((l) => pat[l] != null), nb = len / 16; if (nb >= 4) { toast('A pattern holds 4 bars at most'); return; } const k = pg % nb;
    const grow = (str, lane) => { let x = clean(str); if (x.length < len) x = x.repeat(len / x.length); return groupBars(x + answerBar(x.slice(k * 16, k * 16 + 16), lane)); };
    for (const l of all) pat[l] = grow(pat[l], l); for (const p of pat.perc || []) p.steps = grow(p.steps, 'perc'); DOCK.dpage = nb; });
  const eu = $('[data-leuc]', body); if (eu) eu.onchange = () => { const k = +eu.value; if (k) bar(() => drEuclid(k, 16, 0)); };
  const lb = $('[data-llib]', body); if (lb) lb.onchange = () => { const L = DR_LIB[key] || DR_LIB.perc, x = L[+lb.value]; if (x) bar(() => x[1]); };
  $$('[data-lfeel]', body).forEach((r) => { r.oninput = () => { r.nextElementSibling.textContent = (+r.value).toFixed(2); }; r.onchange = () => edit((s) => { const L = s.drums.lanes || (s.drums.lanes = {}), o = L[key] || (L[key] = {}), k = r.dataset.lfeel, v = +r.value;
    if ((k === 'chance' && v >= 1) || (k !== 'chance' && v === 0)) delete o[k]; else o[k] = v; if (!Object.keys(o).length) delete L[key]; if (!Object.keys(L).length) delete s.drums.lanes; }); }); }
// the six knobs every drum has, then the voice's own knobs (open for the kick: the kick designer); note: shown in place of those
// knobs when the part plays a kit family's one-shot (its own knobs would do nothing there)
function drumVoicePanel(box, slot, own, note) { const row = document.createElement('div'); row.className = 'dk-knobs dk-uknobs'; box.appendChild(row);
  for (const [k, l, mn, mx, cv, u, def] of DR_U) { const v = kitVal(slot, k); dknob(row, { label: l, min: mn, max: mx, curve: cv, unit: u, value: v == null ? def : v, def, onchange: (x) => liveKit(slot, k, Math.abs(x) < 0.02 * (mx - mn) && def === 0 ? 0 : x) }); }
  if (note) { box.insertAdjacentHTML('beforeend', `<p class="dk-legend">${esc(note)}</p>`); return; }
  const det = document.createElement('details'); det.className = 'dk-more'; if (slot === 'kick') det.open = DOCK.kickOpen !== false; det.innerHTML = `<summary>${slot === 'kick' ? 'Kick designer' : 'This voice\'s own knobs'}</summary>`; box.appendChild(det);
  if (slot === 'kick') { det.ontoggle = () => { DOCK.kickOpen = det.open; }; const kt = kitVal('kick', 'keyTrack') ? 1 : 0; det.insertAdjacentHTML('beforeend', `<button class="btn dk-keytrack${kt ? ' on' : ''}" aria-pressed="${kt ? 'true' : 'false'}" title="Tune the kick's body to the track's key (the root nearest its own tuning)">Key track</button>`); $('.dk-keytrack', det).onclick = () => { liveKit('kick', 'keyTrack', kt ? 0 : 1); renderDock(); }; }
  knobRow(det, slot, own); }
// (v9.5) the parts with a register (Octave −2 … +2): see Deck.setReg
const REG_PARTS = { bass: 1, chords: 1, pad: 1, lead: 1, arp: 1 };
const REG_TIP = 'Play the part lower or higher: notes that would fall under its floor (the bass\'s room) fold back up, so lowered chords open up instead of muddying the bass; a lowered part is brightened and lifted a little so it keeps its timbre and level';
// ---- (v9.5) BASS: a brush of the chord-relative tokens, an accent lane, the line's tools and a library of styles (all chord-relative:
// a style survives any key or progression)
const BS_BRUSH = [['R', 'Root'], ['O', 'Octave'], ['F', 'Fifth'], ['T', 'Third'], ['S', 'Seventh'], ['A', 'Approach'], ['N', 'Next root'], ['P', 'Passing'], ['-', 'Hold'], ['.', 'Rest']];
const BS_LIB = [['Rolling (psy)', '.RRR.RRR.RRR.RRR'], ['Offbeat', '..R...R...R...R.'], ['Offbeat 16ths', '..RR..RR..RR..RR'], ['Gallop', '.R.R.RR..R.R.RR.'], ['Octave bounce', 'R.O.R.O.R.O.R.O.'], ['Acid', 'R.rORtR.R.fOR.oA'],
  ['Techno pulse', 'R.R.R.R.R.R.R.R.'], ['Syncopated', 'R..R..R...R.R...'], ['Dembow', 'R..R..R.R..R..R.'], ['Funk', 'R..O.R.TR..F.RA.'], ['Walking', 'R...T...F...A...'], ['Sub drone', 'R---------------'], ['Reese', 'R-------F-------'], ['808 glide', 'R-------..r--F--']];
function bassMutate(s, r) { const a = s.split(''), n = a.length, T = ['R', 'O', 'F', 'R', 'T', 'A'];
  for (let t = 0; t < Math.max(2, n / 8); t++) { const i = Math.floor(r() * n), c = a[i], u = r(); if (c === '.' && u < 0.5 && i % 4) a[i] = T[Math.floor(r() * T.length)]; else if (/[A-Za-z]/.test(c) && u < 0.35 && i % 4) a[i] = '.'; else if (/[A-Za-z]/.test(c) && u < 0.75) { const x = T[Math.floor(r() * T.length)]; a[i] = c === c.toLowerCase() ? x.toLowerCase() : x; } }
  return a.join(''); }
// ---- (v9.5) SMARTER PATTERNS: a bar that ANSWERS the one before it (call and response), the bass LOCKED around the kick, and chord
// rhythms that can be shifted, mutated and answered. A 16-step bar in, a 16-step bar out; each lane answers in its own idiom.
function rot(s, k) { const n = s.length; k = ((k % n) + n) % n; return s.slice(n - k) + s.slice(0, n - k); }
function answerBar(b, lane) { const a = b.split(''), hits = a.filter((c) => c !== '.' && c !== '-').length, four = hits === 4 && [0, 4, 8, 12].every((i) => a[i] !== '.');
  if (lane === 'kick' && four) { if (a[14] === '.') a[14] = 'g'; return a.join(''); } // a four-on-the-floor kick answers with a ghost into the next bar
  if (lane === 'snare') { if (a[14] === '.') a[14] = 'g'; if (a[15] === '.') a[15] = 'x'; else a[15] = '2'; return a.join(''); } // a pickup into the next phrase
  if (HAT_LANES.has(lane)) { const i = a[15] !== '.' ? 15 : a[14] !== '.' ? 14 : 15; a[i] = lane === 'open' ? 'x' : '3'; return a.join(''); }
  // anything else (a broken kick, a rim, percussion, a chord rhythm): the first half stays, the second answers it two steps later
  const h = b.slice(0, 8), r = rot(h, 2), out = b.slice(0, 8) + (r === b.slice(8) ? rot(h, 3) : r); return /[^.]/.test(out.slice(8)) ? out : b; }
// a bass bar's answer: the second half's contour turned (root ↔ fifth, octave ↔ root) and an approach note into the next bar
function answerBass(b) { const M = { R: 'F', F: 'R', O: 'R', T: 'F', N: 'R' }; const a = b.split(''); for (let i = 8; i < 16; i++) { const c = a[i], u = c.toUpperCase(); if (M[u]) a[i] = c === u ? M[u] : M[u].toLowerCase(); } if (a[15] === '.' && a[14] === '.') a[15] = 'A'; return a.join(''); }
// the bass around the kick: a note on a kick step moves to the next free 16th (the sidechain would swallow it), or rests
function lockToKick(b, kick) { const a = b.split(''), K = kick.split(''); for (let i = 0; i < 16; i++) { if (K[i] === '.' || !/[A-Za-z]/.test(a[i])) continue; const c = a[i]; a[i] = '.'; if (i + 1 < 16 && a[i + 1] === '.' && K[i + 1] === '.') a[i + 1] = c; else if (i + 1 < 16 && a[i + 1] === '-') a[i + 1] = c; } return a.join(''); }

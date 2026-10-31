// v9.3 Auto-DJ transition variety: the page's own style picker (src/ui/app.js), 5000 simulated sets of 10 mixes over changing
// genres and tempo jumps — never the same style twice in a row, at least 6 different styles in every 10 mixes. Usage: node tools/tx_variety_test.cjs
const fs = require('fs'), path = require('path'); const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'app.js'), 'utf8'), a = src.indexOf('const TX_STYLES = ['), b = src.indexOf('// what a mix sends');
const { load } = require('./load.cjs'); const E = load(); const GENRE_BY_ID = E.GENRE_BY_ID, SET_ENERGY = E.SET_ENERGY; // eslint-disable-line no-unused-vars
const api = new Function('GENRE_BY_ID', 'SET_ENERGY', src.slice(a, b) + '\nreturn { pickStyle, txHist, TX_STYLES };')(GENRE_BY_ID, SET_ENERGY);
const gs = ['house', 'techno', 'trance', 'deep-house', 'dnb', 'tech-house', 'melodic-techno', 'ukg', 'ambient', 'hardstyle']; let minD = 99, tot = 0, rep = 0; const used = new Set();
for (let run = 0; run < 5000; run++) { api.txHist.length = 0; const seen = new Set(); let last = '';
  for (let k = 0; k < 10; k++) { const Da = { gid: gs[(k + run) % gs.length], bpm: 124 }, Db = { gid: gs[(k * 3 + run + 1) % gs.length], bpm: 124, score: { meta: { bpm: 124 + ((k + run) % 4) * 4 } } };
    const id = api.pickStyle(Da, Db); if (id === last) rep++; last = id; seen.add(id); used.add(id); api.txHist.push(id); if (api.txHist.length > 5) api.txHist.shift(); }
  minD = Math.min(minD, seen.size); tot += seen.size; }
const ok = minD >= 6 && rep === 0 && used.size === api.TX_STYLES.length;
console.log(`${ok ? '✓' : '✗'} Auto-DJ styles: ${(tot / 5000).toFixed(2)} different ones per 10 mixes on average, ${minD} in the least varied set (≥ 6), ${rep} repeats in a row, ${used.size}/${api.TX_STYLES.length} styles used`);
process.exit(ok ? 0 : 1);

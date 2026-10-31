// the FORGE score guide for AI models: docs/FORGE-SCORE.md with the genre table generated from the live contracts
// (so the guide can never drift from what the validator and composer actually accept)
const fs = require('fs'), path = require('path');
function cardText(X) {
  const md = fs.readFileSync(path.join(__dirname, '..', 'docs', 'FORGE-SCORE.md'), 'utf8');
  const rows = X.GENRES.map((G) => `| \`${G.id}\` | ${G.bpm[0] === G.bpm[1] ? G.bpm[0] : G.bpm[0] + '–' + G.bpm[1]} | ${G.swing} | ${G.modes.join(' ')} | ${G.harm.hr} · ${G.harm.ext} | ${G.chords.role} | ${G.lead ? G.lead.role : 'none'} | \`${G.drums.main[0].k || '—'}\` | \`${G.bass.pats[0].n}\` ${G.bass.kit.model} |`);
  const table = '| id | BPM | swing | modes | bars/chord · colour | chords | lead | kick (pattern A) | bass (A) · model |\n|---|---|---|---|---|---|---|---|---|\n' + rows.join('\n');
  const bank = Object.entries(X.SOUND_BANK).map(([slot, b]) => `- **${slot}**: ` + Object.entries(b).map(([k, p]) => `\`${k}\` (${p.d})`).join(' · ')).join('\n');
  return md.replace('<!--GENRES-->', table).replace('<!--PRESETS-->', bank);
}
module.exports = { cardText };
if (require.main === module) { const { load } = require('./load.cjs'); process.stdout.write(cardText(load())); }

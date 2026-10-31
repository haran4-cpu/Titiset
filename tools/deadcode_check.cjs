// no code hidden inside a // comment: a statement accidentally typed after a trailing comment parses fine and never runs
// (this cost the app its startup output level in v8.2). Every line comment (found by the real tokenizer, not a regex — so
// '//' inside strings and URLs is ignored) is checked: if any tail of it, starting at a word, parses as JavaScript that calls
// something or assigns something, the build fails. Usage: node tools/deadcode_check.cjs (also run by build.cjs)
const acorn = require('./lib/dep.cjs')('acorn'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'); const hits = [];
const codeLike = (s) => { let ast; try { ast = acorn.parse(s, { ecmaVersion: 'latest', allowReturnOutsideFunction: true }); } catch (e) { return false; }
  let found = false; const walk = (n) => { if (!n || typeof n !== 'object' || found) return; if (n.type === 'CallExpression' || n.type === 'AssignmentExpression' || n.type === 'VariableDeclaration' || n.type === 'UpdateExpression') { found = true; return; } for (const k in n) if (k !== 'parent') { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); } };
  walk(ast); return found; };
for (const [dir, base] of [['engine', 'src'], ['compose', 'src'], ['ui', 'src'], ['host', 'src'], ['tools', '.']]) for (const f of fs.readdirSync(path.join(ROOT, base, dir)).filter((x) => /\.c?js$/.test(x) && x !== '03w_voice_wasm.js')) {
  const file = path.join(ROOT, base, dir, f), src = fs.readFileSync(file, 'utf8'); const comments = [];
  try { acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true, onComment: (block, text, start) => { if (!block) comments.push([text, start]); } }); } catch (e) { continue; } // a parse error is build.cjs's job
  for (const [text, start] of comments) { if (!/[;)}]\s*$/.test(text) && !/\)\s*;/.test(text)) continue; // only comments that END like code can hide code
    const words = [...text.matchAll(/(^|\s)([A-Za-z_$][\w$]*)(?=[.(\[=\s])/g)];
    for (const w of words) { const tail = text.slice(w.index + w[1].length); if (tail.length < 6 || !/[(=]/.test(tail) || !/;/.test(tail)) continue; // a statement ends in ';' — prose like "chorus (pads)" does not
      if (codeLike(tail)) { const line = src.slice(0, start).split('\n').length; hits.push(`${path.relative(ROOT, file)}:${line}  …${tail.slice(0, 90)}`); break; } } } }
if (hits.length) { console.error('✗ code hidden in a // comment (it never runs):\n  ' + hits.join('\n  ')); process.exit(1); } else console.log('deadcode: no code hidden in comments');

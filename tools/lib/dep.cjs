// finds a dev dependency such as playwright or acorn: this project's own node_modules first (after npm install), then the old
// fixed folder /opt/node-tools, and when neither has it stops with a clear message instead of a stack trace
const path = require('path');
module.exports = (name) => {
  for (const dir of [null, '/opt/node-tools/node_modules']) {
    try { return require(dir ? path.join(dir, name) : name); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND' || !String(e.message).includes(name)) throw e; }
  }
  console.error(`missing dev dependency "${name}" — run "npm install" in the project folder (see package.json)`); process.exit(2);
};

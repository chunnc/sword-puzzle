// Load the production TypeScript engine for headless tools; never use a second rules implementation.
const fs = require('node:fs');
const path = require('node:path');
let ts;
try { ts = require('../client/node_modules/typescript'); } catch { ts = require('../server/node_modules/typescript'); }
const root = path.resolve(__dirname, '../client/src/game');
const original = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  if (!filename.startsWith(root + path.sep)) {
    if (original) return original(module, filename);
    throw new Error(`Unexpected runtime dependency: ${filename}`);
  }
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(outputText, filename);
};
module.exports = {
  ...require('../client/src/game/domain.ts'),
  ...require('../client/src/game/BoardEngine.ts')
};

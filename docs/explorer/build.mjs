// Rebuild explorer/index.html by injecting data/model.json into template.html.
// Usage: node explorer/build.mjs   (or: npm run build)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const model = JSON.parse(fs.readFileSync(path.join(root, 'data', 'model.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(root, 'explorer', 'template.html'), 'utf8');

const lines = tpl.split('\n');
const i = lines.findIndex((l) => l.includes('__MODEL_JSON__'));
if (i < 0) { console.error('ERROR: __MODEL_JSON__ placeholder not found in template.html'); process.exit(1); }
lines[i] = 'const DATA = ' + JSON.stringify(model) + ';';

fs.writeFileSync(path.join(root, 'explorer', 'index.html'), lines.join('\n'));

let nO = 0, nSM = 0;
for (const d of model.drivers) for (const u of d.uncertainties) for (const o of u.outcomes) { nO++; if (o.strategicMove && o.strategicMove.trim()) nSM++; }
console.log(`Built explorer/index.html  |  ${model.drivers.length} drivers, ${nO} outcomes, ${nSM} with a strategic move`);

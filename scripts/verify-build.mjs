import { readdirSync, readFileSync } from 'node:fs';

const distIndex = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
if (distIndex.includes('/src/main.tsx')) {
  throw new Error('Production index still references the TypeScript source entry');
}

const assetsDir = new URL('../dist/assets/', import.meta.url);
const jsFiles = readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
if (jsFiles.length === 0) throw new Error('No production JavaScript asset found');

const bundle = jsFiles.map((name) => readFileSync(new URL(name, assetsDir), 'utf8')).join('\n');
const required = [
  'Swap discard · 1 token',
  'ACTION BLOCKED',
  'Copy incident report',
  '2026.07.27-pipeline-fix-3',
];

for (const marker of required) {
  if (!bundle.includes(marker)) throw new Error(`Production bundle is missing current marker: ${marker}`);
}
if (bundle.includes('Take discard')) {
  throw new Error('Production bundle still contains the obsolete Take discard UI');
}

console.log(`Verified ${jsFiles.length} production JavaScript asset(s) contain the current source build.`);

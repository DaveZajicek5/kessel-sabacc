import { copyFileSync, readFileSync } from 'node:fs';

const sourcePath = new URL('../index.source.html', import.meta.url);
const targetPath = new URL('../index.html', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');

if (!source.includes('/src/main.tsx')) {
  throw new Error('index.source.html does not contain the Vite source entry');
}

copyFileSync(sourcePath, targetPath);
console.log('Restored index.html from index.source.html');

import { readFile } from 'node:fs/promises';

const requiredFiles = [
  'public/index.html',
  'wrangler.jsonc',
  'README.md',
  'docs/PLAN.md',
  'docs/HYPOTHESES.md',
];

for (const file of requiredFiles) {
  await readFile(file, 'utf8');
}

const index = await readFile('public/index.html', 'utf8');
const requiredSnippets = [
  '<canvas id="cv"></canvas>',
  'const CFG=',
  'function enterFloor',
  'function newPlayer',
  'localStorage',
];

const missing = requiredSnippets.filter((snippet) => !index.includes(snippet));
if (missing.length) {
  throw new Error(`public/index.html is missing expected game hooks: ${missing.join(', ')}`);
}

const wrangler = await readFile('wrangler.jsonc', 'utf8');
if (!wrangler.includes('"directory": "./public"')) {
  throw new Error('wrangler.jsonc must keep assets.directory set to ./public');
}

console.log('Prototype is readable: public/index.html and deployment config checks passed.');

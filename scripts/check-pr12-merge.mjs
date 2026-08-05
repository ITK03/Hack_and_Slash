import { readFile } from 'node:fs/promises';

const requiredFiles = [
  'public/index.html',
  'README.md',
  'docs/AI_COLLABORATION.md',
  'docs/CODEX_HANDOFF.md',
  'docs/PLAN.md',
  'docs/HYPOTHESES.md',
  'scripts/check-prototype.mjs',
  'package.json',
];

const contents = Object.fromEntries(
  await Promise.all(requiredFiles.map(async (file) => [file, await readFile(file, 'utf8')]))
);

const expectations = [
  ['README.md', 'ブランチ統合メモ（PR #12 → 最新ベース）'],
  ['README.md', 'npm run check:pr12'],
  ['docs/AI_COLLABORATION.md', 'PR #12 のハンドオフ内容'],
  ['docs/CODEX_HANDOFF.md', 'PR #12 反映範囲'],
  ['public/index.html', 'data-base-branch="claude/diablo-style-hackslash-game-khlbrr"'],
  ['package.json', '"check:pr12"'],
];

const missing = expectations.filter(([file, snippet]) => !contents[file].includes(snippet));
if (missing.length) {
  throw new Error(
    `PR #12 merge markers are missing:\n${missing.map(([file, snippet]) => `- ${file}: ${snippet}`).join('\n')}`
  );
}

const conflictMarkers = ['<<<<<<<', '=======', '>>>>>>>'];
const conflicted = Object.entries(contents).flatMap(([file, body]) =>
  body.split(/\r?\n/).flatMap((line, index) =>
    conflictMarkers.includes(line.trim()) ? [`${file}:${index + 1}: ${line.trim()}`] : []
  )
);
if (conflicted.length) {
  throw new Error(`Conflict markers remain:\n${conflicted.join('\n')}`);
}

console.log('PR #12 merge metadata is present and no conflict markers were found.');

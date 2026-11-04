#!/usr/bin/env node
/**
 * Switch the active visual design pack.
 *
 *   npm run design:swiss
 *   npm run design:kairos
 *
 * Only `src/styles/index.css` is rewritten; both packs stay in the repo so the
 * change is reviewable and reversible without touching component code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packs = {
  swiss: 'Swiss International Style — flat, terracotta, 2px geometry.',
  kairos: 'Kairos — warm graphite editorial skin (previous design).',
};
const target = process.argv[2];

if (!packs[target]) {
  console.error(`Usage: node scripts/design.mjs <${Object.keys(packs).join('|')}>`);
  process.exit(1);
}

const entry = path.join(root, 'src', 'styles', 'index.css');
const content = `/* Active design pack.
 *
 * ${packs[target]}
 * Switch with \`npm run design:swiss\` / \`npm run design:kairos\`, then rebuild.
 */
@import './${target}/global.css';
`;

fs.writeFileSync(entry, content, 'utf8');
console.log(`Active design pack: ${target}`);

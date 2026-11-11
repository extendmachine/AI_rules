import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Usage: node scripts/sync-docs-version.mjs [--check]');
}
const check = args[0] === '--check';
const versionPath = join(root, 'VERSION');
if (lstatSync(versionPath).isSymbolicLink() || lstatSync(join(root, 'docs')).isSymbolicLink()) {
  throw new Error('VERSION and docs must be project-local, not symbolic links.');
}
const version = readFileSync(versionPath, 'utf8').trim();
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('VERSION must contain MAJOR.MINOR.PATCH, without leading zeros.');
}
const start = '<!-- project-version:start -->';
const end = '<!-- project-version:end -->';
const footer = `${start}\n  <footer style="max-width:1100px;margin:0 auto;padding:16px 20px 32px;color:#555;text-align:center">版本 ${version}</footer>\n  ${end}`;
const files = ['index.html', 'api-interfaces.html', 'references.html'];

// Validate every generated region before writing any of the pages.
const updates = files.map((name) => {
  const path = join(root, 'docs', name);
  if (lstatSync(path).isSymbolicLink()) throw new Error(`Refusing symbolic link: ${name}`);
  const original = readFileSync(path, 'utf8');
  const starts = original.split(start);
  const ends = original.split(end);
  if (starts.length !== 2 || ends.length !== 2 || original.indexOf(start) >= original.indexOf(end)) {
    throw new Error(`Expected one ordered version marker pair in ${name}`);
  }
  return { name, path, original, updated: starts[0] + footer + ends[1] };
});
const changed = updates.filter(({ original, updated }) => original !== updated);
if (check) {
  if (changed.length) {
    console.error(`Version footer mismatch: ${changed.map(({ name }) => name).join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(`Version ${version}: ${files.length} HTML footers verified.`);
  }
} else {
  for (const { path, updated } of changed) writeFileSync(path, updated, 'utf8');
  console.log(`Version ${version}: synchronized ${changed.length} HTML footers.`);
}

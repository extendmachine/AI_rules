import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (name) => readFileSync(join(root, name), 'utf8');
const manifest = JSON.parse(read('rules/source.json'));
const source = execFileSync('git', ['merge-base', 'HEAD', 'main'], { cwd: root, encoding: 'utf8' }).trim();
console.log(`Source-Main-Commit: ${source}`);

test('test-only checks run on test_main without business differences', () => {
  assert.equal(execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(), 'test_main');
  const diff = execFileSync('git', ['diff', '--name-only', source, 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.ok(!diff || diff.split('\n').every((p) => p.startsWith('.checks/')));
});

test('manifest matches the complete public rules directory', () => {
  const actual = readdirSync(join(root, 'rules')).filter((f) => !f.startsWith('.')).map((f) => `rules/${f}`).sort();
  assert.deepEqual(actual, [...manifest.managed_files].sort());
  assert.equal(new Set(manifest.managed_files).size, manifest.managed_files.length);
  assert.ok(manifest.managed_files.every((p) => p.startsWith('rules/') && !p.includes('..')));
  assert.equal(manifest.repository, 'https://github.com/extendmachine/AI_rules.git');
  assert.equal(manifest.branch, 'main');
  assert.equal(manifest.check_interval_days, 7);
  for (const p of manifest.retired_files) assert.equal(existsSync(join(root, p)), false);
});

test('version, routing and source metadata agree', () => {
  const version = read('VERSION').trim();
  assert.equal(version, manifest.version);
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(read('rules/README.md').includes(`规范版本：\`${version}\``));
  const routes = [...read('rules/README.md').matchAll(/`(\d{2}-[^`]+\.md)`/g)].map((m) => m[1]);
  assert.equal(routes.length, 18);
  for (const route of routes) assert.ok(existsSync(join(root, 'rules', route)));
  assert.ok(read('CHANGELOG.md').includes(`## ${version}`));
});

test('Markdown fences and HTML local links are valid', () => {
  const files = [...manifest.managed_files.filter((p) => p.endsWith('.md')), 'AGENTS.md', 'CLAUDE.md', 'README.md', 'FINAL_GOAL.md', 'TODO.md', 'AI_TASKS.md'];
  for (const name of files) assert.equal((read(name).match(/^\s*```/gm) || []).length % 2, 0, name);
  for (const name of ['index.html', 'api-interfaces.html', 'references.html']) {
    const html = read(`docs/${name}`);
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      if (!/^(https?:|#)/.test(match[1])) assert.ok(existsSync(resolve(root, 'docs', match[1])), match[1]);
    }
    assert.ok(html.includes(`版本 ${manifest.version}`), name);
    assert.equal((html.match(/<footer\b/g) || []).length, 1, name);
    assert.ok(html.indexOf('<footer') > html.indexOf('</main>'), name);
    assert.ok(!html.includes('Deployed with Clawtask'));
  }
});

test('active workflow excludes obsolete branch and reading requirements', () => {
  const active = ['AGENTS.md', 'README.md', 'FINAL_GOAL.md', ...manifest.managed_files.filter((p) => p.endsWith('.md'))].map(read).join('\n');
  for (const phrase of ['不得直接在 `main` 开发', '每个微服务使用自己的分支和提交', '每次修改代码前，必须先阅读', '必须先完整读取']) assert.ok(!active.includes(phrase), phrase);
  for (const branch of ['main', 'test_main', 'release']) assert.ok(read('rules/04-git-branching-by-service.md').includes(branch));
  assert.ok(read('rules/12-frontend-backend-api-docs.md').includes('自主判定'));
  assert.ok(read('rules/05-local-secrets-security.md').includes('只有登录凭据、密钥、token、密码等访问控制信息属于敏感内容'));
});

test('sensitive directories and generated archives remain excluded', () => {
  for (const p of ['local-secrets/x.json', 'logs/a.log', 'rules.zip', '.rules-sync.json', '.worktrees/test_main/x', '.cache/x']) {
    assert.equal(spawnSync('git', ['check-ignore', '-q', p], { cwd: root }).status, 0, p);
  }
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  assert.ok(!tracked.some((p) => /^(local-secrets|logs|\.cache|\.worktrees)\//.test(p)));
});

function fixture(run) {
  const cache = join(root, '.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'version-check-'));
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, 'docs'));
  cpSync(join(root, 'scripts/sync-docs-version.mjs'), join(dir, 'scripts/sync-docs-version.mjs'));
  writeFileSync(join(dir, 'VERSION'), '0.1.2\n');
  for (const name of ['index.html', 'api-interfaces.html', 'references.html']) {
    writeFileSync(join(dir, 'docs', name), '<body>keep<!-- project-version:start -->old<!-- project-version:end -->tail</body>');
  }
  const exec = (...args) => spawnSync(process.execPath, [join(dir, 'scripts/sync-docs-version.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  try { run(dir, exec); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('footer sync is read-only in check mode and idempotent in write mode', () => fixture((dir, exec) => {
  const p = join(dir, 'docs/index.html');
  const before = readFileSync(p, 'utf8');
  assert.equal(exec('--check').status, 1);
  assert.equal(readFileSync(p, 'utf8'), before);
  assert.equal(exec().status, 0);
  const after = readFileSync(p, 'utf8');
  assert.ok(after.includes('版本 0.1.2'));
  assert.ok(after.startsWith('<body>keep'));
  assert.ok(after.endsWith('tail</body>'));
  assert.equal(exec('--check').status, 0);
  assert.equal(exec().status, 0);
  assert.equal(readFileSync(p, 'utf8'), after);
}));

test('invalid versions and arguments fail without changing pages', () => fixture((dir, exec) => {
  const p = join(dir, 'docs/index.html');
  const before = readFileSync(p, 'utf8');
  for (const version of ['01.2.3', '0.1', '<script>', '1.2.3-extra']) {
    writeFileSync(join(dir, 'VERSION'), version);
    assert.notEqual(exec().status, 0);
    assert.equal(readFileSync(p, 'utf8'), before);
  }
  assert.notEqual(exec('--unknown').status, 0);
}));

test('malformed later page fails preflight before any earlier writes', () => fixture((dir, exec) => {
  const first = join(dir, 'docs/index.html');
  const before = readFileSync(first, 'utf8');
  writeFileSync(join(dir, 'docs/references.html'), '<body>missing markers</body>');
  assert.notEqual(exec().status, 0);
  assert.equal(readFileSync(first, 'utf8'), before);
}));

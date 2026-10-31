import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { audit, inspectContent, privatePath } from '../tools/public-safety.mjs';

test('runtime data, backups, credentials and generated files are rejected', () => {
  for (const file of [
    'data.db',
    'data.db-wal',
    'copy.sqlite3',
    'copy.sqlite-shm',
    'uploads/a.png',
    '.private/session-secret',
    '.env',
    '.env.production',
    'apps/web/.env.local',
    'logs/server.log',
    'backups/export.json',
    'key.pem',
    'release.p12',
    'dump.sql.gz',
    '.DS_Store',
    'docs/._banner.svg',
    'shops-test-out.txt',
    'data/users.json',
    'apps/web/dist/index.html',
    'szzx-menu.skill',
  ]) {
    assert.equal(privatePath(file), true, file);
  }
  for (const file of [
    '.env.example',
    'data.json',
    'data/menu-bootstrap.json',
    'data/shops-config.json',
    'packages/db/migrations/0000_existing_schema.sql',
    'tests/fixtures/review-shot.png',
    'docs/public-release.md',
  ]) {
    assert.equal(privatePath(file), false, file);
  }
});

test('secrets and disguised SQLite exports are detected without including values', () => {
  const samples = [
    ['google-api-key', 'AIza' + 'A'.repeat(35)],
    ['github-token', 'ghp_' + 'A'.repeat(36)],
    ['aws-access-key', 'AKIA' + 'A'.repeat(16)],
    ['slack-token', 'xoxb-' + '1'.repeat(24)],
    ['service-token', 'sk-' + 'A'.repeat(40)],
    ['private-key', '-----BEGIN ' + 'PRIVATE KEY-----'],
    ['password-hash', '$2b$' + '10$' + 'a'.repeat(53)],
    ['map-key', 'AMAP_SERVICE_KEY=' + 'a'.repeat(32)],
    ['jwt', 'eyJ' + 'A'.repeat(15) + '.eyJ' + 'A'.repeat(15) + '.' + 'A'.repeat(25)],
    ['credential-url', 'postgres' + '://admin:secret-password@localhost/db'],
    ['personal-home-path', '/Users/' + 'example/private/config'],
  ];
  for (const [rule, secret] of samples) {
    const findings = inspectContent(Buffer.from('\n' + secret));
    assert.ok(
      findings.some((f) => f.rule === rule && f.line === 2),
      rule,
    );
    assert.ok(!JSON.stringify(findings).includes(secret));
  }
  assert.equal(inspectContent(Buffer.from('SQLite format 3\0payload'))[0].rule, 'sqlite-database');
  assert.deepEqual(
    inspectContent(Buffer.from('JWT_SECRET=replace_with_a_long_random_secret\nGEMINI_API_KEY=\n')),
    [],
  );
});

test('a removed ignored database still blocks history; ignored local data stays untouched', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sytime-public-safety-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    git('init', '--quiet');
    fs.writeFileSync(path.join(root, 'data.db'), 'SQLite format 3\0private');
    git('add', 'data.db');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    );
    git('rm', '--cached', 'data.db');
    fs.writeFileSync(path.join(root, '.gitignore'), '*.db\n.env\n');
    fs.writeFileSync(path.join(root, '.env'), 'private local configuration');
    assert.deepEqual(audit(root).findings, []);
    const result = audit(root, true);
    assert.ok(result.findings.some((f) => f.rule === 'historical-private-path'));
    assert.ok(result.findings.some((f) => f.rule === 'sqlite-database'));
    assert.equal(fs.readFileSync(path.join(root, 'data.db'), 'utf8'), 'SQLite format 3\0private');
    // Force adding ignored files must not bypass the tracked-file gate.
    git('add', '-f', '.env');
    assert.ok(audit(root).findings.some((f) => f.file === '.env' && f.rule === 'private-path'));
    git('rm', '--cached', '.env');
    fs.writeFileSync(path.join(root, 'config.txt'), 'AMAP_JS_KEY=' + 'a'.repeat(32));
    assert.ok(audit(root).findings.some((f) => f.rule === 'map-key'));
    git('add', 'config.txt');
    fs.writeFileSync(path.join(root, 'config.txt'), 'safe worktree content');
    assert.ok(audit(root).findings.some((f) => f.source === 'index' && f.rule === 'map-key'));
    git('rm', '--cached', '-f', 'config.txt');
    fs.unlinkSync(path.join(root, 'config.txt'));
    assert.deepEqual(audit(root).findings, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

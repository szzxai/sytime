import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// This gate never prints matched values. Use a dedicated secret scanner as well.
export function privatePath(filename) {
  const name = filename.replaceAll('\\', '/');
  if (
    /(^|\/)(\.private|uploads|backups?|tmp|temp|node_modules|output|coverage|playwright-report|test-results)(\/|$)/i.test(
      name,
    )
  )
    return true;
  if (/(^|\/)\.env(?:\..*)?$/i.test(name) && name !== '.env.example') return true;
  if (/(^|\/)(\.DS_Store|Thumbs\.db|\._[^/]+)$/i.test(name)) return true;
  if (
    /\.(db(?:-.*)?|sqlite3?(?:-.*)?|log|bak|backup|dump|pem|key|p12|pfx|jks|keystore|tmp|temp|swp|swo|orig|rej)$/i.test(
      name,
    )
  )
    return true;
  if (/(?:-out\.txt|\.sql\.gz|~)$/.test(name)) return true;
  if (/^apps\/[^/]+\/dist\//.test(name) || name === 'szzx-menu.skill') return true;
  // Only these reviewed public source datasets belong in this directory.
  return (
    name.startsWith('data/') &&
    !['data/menu-bootstrap.json', 'data/shops-config.json'].includes(name)
  );
}

const secretRules = [
  ['private-key', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g],
  ['google-api-key', /AIza[0-9A-Za-z_-]{35}/g],
  ['github-token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g],
  ['aws-access-key', /(?:AKIA|ASIA)[A-Z0-9]{16}/g],
  ['slack-token', /xox[baprs]-[A-Za-z0-9-]{20,}/g],
  ['service-token', /\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{32,}/g],
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/g],
  ['password-hash', /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g],
  ['credential-url', /\b[a-z]+:\/\/[^\s/:]+:[^\s/@]{4,}@/g],
  ['map-key', /\bAMAP_(?:SERVICE_KEY|JS_KEY|SECURITY_CODE)\s*[=:]\s*["']?([a-fA-F0-9]{32})\b/g],
  ['personal-home-path', /(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)[^\s"'<>`]+/g],
];

export function inspectContent(bytes) {
  if (bytes.subarray(0, 16).toString() === 'SQLite format 3\0')
    return [{ rule: 'sqlite-database', line: 1 }];
  const text = bytes.toString('utf8');
  const findings = [];
  for (const [rule, pattern] of secretRules) {
    for (const match of text.matchAll(pattern)) {
      findings.push({ rule, line: text.slice(0, match.index).split('\n').length });
    }
  }
  return findings;
}

export function audit(root, history = false) {
  const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  const findings = [];
  const files = new Set(
    git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
      .toString()
      .split('\0')
      .filter(Boolean),
  );
  let checked = 0;
  for (const filename of files) {
    const absolute = path.join(root, filename);
    // A staged deletion is absent from ls-files; a worktree-only deletion is not.
    if (privatePath(filename)) findings.push({ file: filename, rule: 'private-path' });
    if (!fs.existsSync(absolute)) continue;
    const bytes = fs.lstatSync(absolute).isSymbolicLink()
      ? Buffer.from(fs.readlinkSync(absolute))
      : fs.readFileSync(absolute);
    checked++;
    for (const finding of inspectContent(bytes)) findings.push({ file: filename, ...finding });
  }
  // A safe worktree must not hide a different secret already stored in the index.
  const changed = git('diff', '--name-only', '--diff-filter=DM', '-z')
    .toString()
    .split('\0')
    .filter(Boolean);
  for (const filename of changed) {
    for (const finding of inspectContent(git('cat-file', 'blob', `:${filename}`))) {
      findings.push({ file: filename, source: 'index', ...finding });
    }
  }
  let blobs = 0;
  if (history) {
    const paths = new Set(
      git('log', '--all', '--format=', '--name-only', '-z')
        .toString()
        .split(/[\0\n]/)
        .filter(Boolean),
    );
    for (const filename of paths) {
      if (privatePath(filename)) findings.push({ file: filename, rule: 'historical-private-path' });
    }
    const objects = git('rev-list', '--objects', '--all')
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean);
    const types = execFileSync('git', ['cat-file', '--batch-check=%(objecttype)'], {
      cwd: root,
      input: objects.map((line) => line.split(' ')[0]).join('\n') + '\n',
    })
      .toString()
      .trim()
      .split('\n');
    objects.forEach((entry, index) => {
      if (types[index] !== 'blob') return;
      const [object, ...name] = entry.split(' ');
      blobs++;
      for (const finding of inspectContent(git('cat-file', 'blob', object))) {
        findings.push({
          file: name.join(' ') || '(historical blob)',
          object: object.slice(0, 12),
          ...finding,
        });
      }
    });
  }
  return { checked, blobs, findings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--history'))
      throw new Error('Usage: node tools/public-safety.mjs [--history]');
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const result = audit(root, process.argv.includes('--history'));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.findings.length ? 1 : 0;
  } catch {
    console.error(
      'Public safety scan could not finish. Check Git availability, arguments and file access.',
    );
    process.exitCode = 2;
  }
}

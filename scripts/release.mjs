#!/usr/bin/env node
// Builds the bundled @env-spec language server and publishes it as a GitHub
// release asset that the Zed extension downloads at runtime.
//
// Usage:
//   node scripts/release.mjs            # tag = v<server/package.json version>
//   node scripts/release.mjs 0.1.1      # explicit version (also bumps package.json)
//
// Requires: gh CLI authenticated, repo `petercr/varlock-zed-extension` to exist.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const REPO = 'petercr/varlock-zed-extension';
const ASSET_NAME = 'env-spec-language-server.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = join(root, 'server');
const pkgPath = join(serverDir, 'package.json');

function run(cmd, opts = {}) {
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: root, ...opts });
  if (r.status !== 0) {
    console.error(`\n✖ command failed: ${cmd}`);
    process.exit(r.status ?? 1);
  }
}

function capture(cmd) {
  const r = spawnSync(cmd, { shell: true, cwd: root, encoding: 'utf8' });
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const argVersion = process.argv[2];
if (argVersion) {
  pkg.version = argVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`• bumped server version to ${argVersion}`);
}
const version = pkg.version;
const tag = `v${version}`;

console.log(`• building bundled language server (${tag})`);
run('npm --prefix server run build');

const stageDir = mkdtempSync(join(tmpdir(), 'envspec-release-'));
const assetPath = join(stageDir, ASSET_NAME);
copyFileSync(join(serverDir, 'out', 'server.js'), assetPath);

const exists = capture(`gh release view ${tag} --repo ${REPO}`).status === 0;
if (exists) {
  console.log(`• release ${tag} exists — replacing asset`);
  run(`gh release upload ${tag} "${assetPath}" --repo ${REPO} --clobber`);
} else {
  console.log(`• creating release ${tag}`);
  run(
    `gh release create ${tag} "${assetPath}" --repo ${REPO} ` +
      `--title "@env-spec language server ${tag}" ` +
      `--notes "Bundled language server for the Varlock Schema Zed extension."`,
  );
}

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n✔ published ${ASSET_NAME} to ${REPO} @ ${tag}`);
console.log('  Now rebuild the dev extension in Zed (Extensions → Rebuild) so it re-syncs to the remote.');

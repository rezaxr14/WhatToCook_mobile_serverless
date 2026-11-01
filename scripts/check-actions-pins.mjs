#!/usr/bin/env node
/**
 * Fail when a workflow uses an action by tag, a branch, or a short SHA.
 *
 * Every `uses: owner/repo@ref` must name a full 40-character commit and end
 * with the tag that ref came from (`# vX.Y.Z`), matching the main repo's rule.
 * Docker actions (`docker://...`) and local actions (`./...`) are exempt.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKFLOW_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows');
const SHA = /^[0-9a-f]{40}$/;
const USE = /^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/;

const failures = [];
const entitlements = new Map();

async function main() {
  const entries = await readdir(WORKFLOW_DIR, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name));

  for (const file of files) {
    const text = await readFile(join(WORKFLOW_DIR, file.name), 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = USE.exec(line);
      if (!match) return;
      const target = match[1];
      if (target.startsWith('./') || target.startsWith('docker://')) return;

      const at = target.lastIndexOf('@');
      if (at === -1) {
        failures.push(`${file.name}:${index + 1}: action has no @ref: ${target}`);
        return;
      }
      const ref = target.slice(at + 1);
      if (!SHA.test(ref)) {
        failures.push(`${file.name}:${index + 1}: pin ${target} to a full commit SHA`);
        return;
      }
      if (!/#\s*v?\d+(\.\d+){0,2}\b/.test(match[2])) {
        failures.push(`${file.name}:${index + 1}: ${target} is missing a "# vX.Y.Z" comment`);
      }
      const repo = target.slice(0, at);
      if (entitlements.has(repo) && entitlements.get(repo) !== ref) {
        failures.push(`${file.name}:${index + 1}: ${repo} is pinned to two commits`);
      }
      entitlements.set(repo, ref);
    });
  }

  if (failures.length) {
    console.error('Unpinned GitHub Actions:\n' + failures.map((line) => `  - ${line}`).join('\n'));
    process.exit(1);
  }
  console.log(`All ${files.length} workflow files pin every action to a full commit SHA.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

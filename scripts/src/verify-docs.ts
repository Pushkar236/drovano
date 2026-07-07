/**
 * verify-docs — documentation consistency checker (TASK-0004).
 *
 * Checks, across every tracked Markdown file:
 *   1. Relative links resolve to existing files.
 *   2. Every `ADR-NNNN` reference has a matching file in docs/decisions/
 *      and is indexed in DECISIONS.md; no ADR file is orphaned.
 *   3. Every `TASK-NNNN` reference exists in docs/tasks/BACKLOG.md.
 *   4. Every ADR carries an explicit status header (docs/README.md rule 4).
 *
 * Exit code 0 = consistent, 1 = defects found, 2 = usage error.
 * Idempotent and read-only (scripts/README.md contract).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface Defect {
  file: string;
  problem: string;
}

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.turbo', 'dist']);

export function collectMarkdownFiles(root: string): string[] {
  const results: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (SKIPPED_DIRECTORIES.has(entry)) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.toLowerCase().endsWith('.md')) {
        results.push(full);
      }
    }
  };
  walk(root);
  return results;
}

/** Extract link targets from `[text](target)` markdown links. */
export function extractLinkTargets(markdown: string): string[] {
  const targets: string[] = [];
  // Non-greedy label, target up to the first closing paren; markdown links
  // in this repo do not use nested parens or angle-bracket targets.
  const linkPattern = /\[[^\]]*\]\(([^)\s]+)\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const target = match[1];
    if (target !== undefined) targets.push(target);
  }
  return targets;
}

export function isCheckableTarget(target: string): boolean {
  if (target.startsWith('#')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false; // http:, https:, mailto:, …
  return true;
}

export function checkLinks(root: string, files: readonly string[]): Defect[] {
  const defects: Defect[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const rawTarget of extractLinkTargets(content)) {
      if (!isCheckableTarget(rawTarget)) continue;
      const target = decodeURI(rawTarget.split('#')[0] ?? '');
      if (target === '') continue;
      const resolved = path.resolve(path.dirname(file), target);
      if (!existsSync(resolved)) {
        defects.push({
          file: path.relative(root, file),
          problem: `broken link: ${rawTarget}`,
        });
      }
    }
  }
  return defects;
}

export function checkAdrReferences(root: string, files: readonly string[]): Defect[] {
  const defects: Defect[] = [];
  const decisionsDir = path.join(root, 'docs', 'decisions');
  const adrFiles = existsSync(decisionsDir)
    ? readdirSync(decisionsDir).filter((f) => /^adr-\d{4}-.+\.md$/.test(f))
    : [];
  const existingNumbers = new Set(adrFiles.map((f) => f.slice(4, 8)));

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(/ADR-(\d{4})/g)) {
      const number = match[1];
      if (number !== undefined && !existingNumbers.has(number)) {
        defects.push({
          file: path.relative(root, file),
          problem: `references ADR-${number} but docs/decisions/adr-${number}-*.md does not exist`,
        });
      }
    }
  }

  const decisionsIndex = path.join(root, 'DECISIONS.md');
  const indexContent = existsSync(decisionsIndex) ? readFileSync(decisionsIndex, 'utf8') : '';
  for (const adrFile of adrFiles) {
    if (!indexContent.includes(adrFile)) {
      defects.push({
        file: path.join('docs', 'decisions', adrFile),
        problem: 'ADR file is not indexed in DECISIONS.md',
      });
    }
  }
  return defects;
}

export function checkTaskReferences(root: string, files: readonly string[]): Defect[] {
  const defects: Defect[] = [];
  const backlogPath = path.join(root, 'docs', 'tasks', 'BACKLOG.md');
  if (!existsSync(backlogPath)) {
    return [{ file: 'docs/tasks/BACKLOG.md', problem: 'backlog file is missing' }];
  }
  const backlogIds = new Set(
    [...readFileSync(backlogPath, 'utf8').matchAll(/TASK-(\d{4})/g)].map((m) => m[1]),
  );
  for (const file of files) {
    if (path.resolve(file) === path.resolve(backlogPath)) continue;
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(/TASK-(\d{4})/g)) {
      const number = match[1];
      if (number !== undefined && !backlogIds.has(number)) {
        defects.push({
          file: path.relative(root, file),
          problem: `references TASK-${number}, which is not in docs/tasks/BACKLOG.md`,
        });
      }
    }
  }
  return defects;
}

const ADR_STATUSES = ['Proposed', 'Accepted', 'Superseded by ADR-', 'Deprecated'] as const;

export function checkAdrStatusHeaders(root: string, files: readonly string[]): Defect[] {
  const defects: Defect[] = [];
  const decisionsDir = path.join(root, 'docs', 'decisions');
  for (const file of files) {
    if (path.dirname(path.resolve(file)) !== path.resolve(decisionsDir)) continue;
    if (!/adr-\d{4}-.+\.md$/.test(path.basename(file))) continue;
    const content = readFileSync(file, 'utf8');
    const statusLine = content.split('\n').find((line) => line.includes('**Status:**'));
    if (statusLine === undefined || !ADR_STATUSES.some((s) => statusLine.includes(s))) {
      defects.push({
        file: path.relative(root, file),
        problem:
          'ADR is missing a valid status header (Proposed | Accepted | Superseded by ADR-NNNN | Deprecated)',
      });
    }
  }
  return defects;
}

export function verifyDocs(root: string): Defect[] {
  const files = collectMarkdownFiles(root);
  return [
    ...checkLinks(root, files),
    ...checkAdrReferences(root, files),
    ...checkTaskReferences(root, files),
    ...checkAdrStatusHeaders(root, files),
  ];
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      [
        'verify-docs — documentation consistency checker',
        '',
        'Usage: pnpm verify-docs [--help]',
        '',
        'Checks all tracked Markdown files for broken relative links,',
        'dangling ADR-NNNN references (and unindexed ADR files),',
        'TASK-NNNN references missing from the backlog, and ADRs',
        'without a valid status header.',
        'Exit codes: 0 consistent · 1 defects found · 2 usage error',
      ].join('\n'),
    );
    return;
  }
  if (args.length > 0) {
    console.error(`Unknown arguments: ${args.join(' ')} (try --help)`);
    process.exitCode = 2;
    return;
  }

  // scripts/src/verify-docs.ts → repository root is two levels up.
  const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const defects = verifyDocs(root);
  if (defects.length === 0) {
    console.log('verify-docs: documentation is consistent.');
    return;
  }
  console.error(`verify-docs: ${defects.length} defect(s) found:\n`);
  for (const defect of defects) {
    console.error(`  ${defect.file}: ${defect.problem}`);
  }
  process.exitCode = 1;
}

// Only run as a CLI when executed directly (not when imported by tests).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

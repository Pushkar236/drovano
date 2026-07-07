import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkAdrReferences,
  checkAdrStatusHeaders,
  checkLinks,
  checkTaskReferences,
  collectMarkdownFiles,
  extractLinkTargets,
  isCheckableTarget,
  verifyDocs,
} from './verify-docs.js';

describe('extractLinkTargets', () => {
  it('extracts targets from markdown links', () => {
    const markdown = 'See [the PRD](docs/PRD.md) and [Attio](https://attio.com/).';
    expect(extractLinkTargets(markdown)).toEqual(['docs/PRD.md', 'https://attio.com/']);
  });

  it('returns an empty list when there are no links', () => {
    expect(extractLinkTargets('plain text, no links')).toEqual([]);
  });
});

describe('isCheckableTarget', () => {
  it('skips anchors and absolute URLs, keeps relative paths', () => {
    expect(isCheckableTarget('#section')).toBe(false);
    expect(isCheckableTarget('https://example.com')).toBe(false);
    expect(isCheckableTarget('mailto:x@example.com')).toBe(false);
    expect(isCheckableTarget('../PRD.md')).toBe(true);
    expect(isCheckableTarget('docs/PRD.md#scope')).toBe(true);
  });
});

describe('repository checks against a fixture tree', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'verify-docs-'));
    mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true });
    mkdirSync(path.join(root, 'docs', 'tasks'), { recursive: true });
    writeFileSync(
      path.join(root, 'docs', 'decisions', 'adr-0001-example.md'),
      '# ADR-0001: Example\n\n- **Status:** Accepted\n\nRelates to TASK-0001.',
    );
    writeFileSync(path.join(root, 'docs', 'tasks', 'BACKLOG.md'), '| TASK-0001 | Example task |');
    writeFileSync(
      path.join(root, 'DECISIONS.md'),
      '[ADR-0001](docs/decisions/adr-0001-example.md)',
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('passes on a consistent tree', () => {
    expect(verifyDocs(root)).toEqual([]);
  });

  it('reports broken relative links', () => {
    writeFileSync(path.join(root, 'README.md'), '[missing](docs/nope.md)');
    const defects = checkLinks(root, collectMarkdownFiles(root));
    expect(defects).toHaveLength(1);
    expect(defects[0]?.problem).toContain('docs/nope.md');
  });

  it('reports references to ADRs that do not exist', () => {
    writeFileSync(path.join(root, 'README.md'), 'Per ADR-0099 we do X.');
    const defects = checkAdrReferences(root, collectMarkdownFiles(root));
    expect(defects.some((d) => d.problem.includes('ADR-0099'))).toBe(true);
  });

  it('reports ADR files missing from the DECISIONS.md index', () => {
    writeFileSync(path.join(root, 'docs', 'decisions', 'adr-0002-orphan.md'), '# ADR-0002');
    const defects = checkAdrReferences(root, collectMarkdownFiles(root));
    expect(defects.some((d) => d.problem.includes('not indexed'))).toBe(true);
  });

  it('reports task references missing from the backlog', () => {
    writeFileSync(path.join(root, 'README.md'), 'Blocked on TASK-0042.');
    const defects = checkTaskReferences(root, collectMarkdownFiles(root));
    expect(defects).toHaveLength(1);
    expect(defects[0]?.problem).toContain('TASK-0042');
  });

  it('reports ADRs without a valid status header', () => {
    writeFileSync(
      path.join(root, 'docs', 'decisions', 'adr-0003-no-status.md'),
      '# ADR-0003: No status here',
    );
    // Index it so only the status defect fires.
    writeFileSync(
      path.join(root, 'DECISIONS.md'),
      '[ADR-0001](docs/decisions/adr-0001-example.md) [ADR-0003](docs/decisions/adr-0003-no-status.md)',
    );
    const defects = checkAdrStatusHeaders(root, collectMarkdownFiles(root));
    expect(defects).toHaveLength(1);
    expect(defects[0]?.file).toContain('adr-0003');
  });

  it('does not flag anchors or external URLs', () => {
    writeFileSync(
      path.join(root, 'README.md'),
      '[a](#anchor) [b](https://example.com/x.md) [c](DECISIONS.md#top)',
    );
    expect(checkLinks(root, collectMarkdownFiles(root))).toEqual([]);
  });
});

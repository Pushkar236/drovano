import { describe, expect, it } from 'vitest';

import { chunkText } from '../src/chunking.js';

describe('chunkText (pure recursive splitter)', () => {
  it('returns empty for blank input and a single chunk for short input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
    expect(chunkText('A short note.')).toEqual(['A short note.']);
  });

  it('respects the max size and never splits mid-word', () => {
    const words = Array.from({ length: 800 }, (_, i) => `word${String(i)}`);
    const chunks = chunkText(words.join(' '), { maxChars: 300, overlapChars: 40 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(300);
      for (const word of chunk.split(' ')) {
        expect(word).toMatch(/^word\d+$/);
      }
    }
  });

  it('carries overlap between consecutive chunks', () => {
    const words = Array.from({ length: 400 }, (_, i) => `tok${String(i)}`);
    const chunks = chunkText(words.join(' '), { maxChars: 400, overlapChars: 80 });
    expect(chunks.length).toBeGreaterThan(1);
    const first = chunks[0]?.split(' ') ?? [];
    const second = chunks[1]?.split(' ') ?? [];
    // The second chunk starts with words from the tail of the first.
    expect(first).toContain(second[0]);
  });

  it('keeps every input word across chunks (nothing dropped)', () => {
    const words = Array.from({ length: 500 }, (_, i) => `w${String(i)}`);
    const chunks = chunkText(words.join(' '), { maxChars: 350 });
    const seen = new Set(chunks.flatMap((chunk) => chunk.split(' ')));
    for (const word of words) {
      expect(seen.has(word)).toBe(true);
    }
  });

  it('prefers paragraph boundaries when they fit', () => {
    const paragraphs = ['First paragraph about apples.', 'Second paragraph about oranges.'];
    const chunks = chunkText(paragraphs.join('\n\n'), { maxChars: 40, overlapChars: 0 });
    expect(chunks).toEqual(paragraphs);
  });

  it('hard-splits a pathological unbroken sentence', () => {
    const monster = 'a'.repeat(120) + ' ' + 'b'.repeat(120) + ' ' + 'c'.repeat(120);
    const chunks = chunkText(monster, { maxChars: 200, overlapChars: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });
});

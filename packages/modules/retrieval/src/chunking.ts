/**
 * Recursive chunking (ai-system.md §4): 256–512 token targets with
 * 10–20% overlap, approximated at ~4 chars/token so the splitter stays
 * a pure function (no tokenizer dependency). Structure is respected
 * top-down — paragraphs, then sentences, then words — and a chunk
 * never splits mid-word.
 */
export interface ChunkingOptions {
  /** Max characters per chunk (~4 chars/token; default ≈ 384 tokens). */
  maxChars?: number | undefined;
  /** Characters carried from the tail of one chunk into the next. */
  overlapChars?: number | undefined;
}

const DEFAULT_MAX_CHARS = 1536;

/**
 * Split into units no larger than maxChars: paragraphs → sentences →
 * words. Word-packed units stop at packChars (maxChars minus the
 * overlap budget) so the overlap prefix still fits beside them.
 */
function splitIntoUnits(text: string, maxChars: number, packChars: number): string[] {
  const units: string[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    const trimmed = paragraph.replace(/\s+/g, ' ').trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length <= maxChars) {
      units.push(trimmed);
      continue;
    }
    for (const sentence of trimmed.split(/(?<=[.!?])\s+/)) {
      if (sentence.length <= maxChars) {
        units.push(sentence);
        continue;
      }
      // Pathological sentence: pack words up to the limit.
      let current = '';
      for (const word of sentence.split(' ')) {
        if (current.length + word.length + 1 > packChars && current.length > 0) {
          units.push(current);
          current = word;
        } else {
          current = current.length === 0 ? word : `${current} ${word}`;
        }
      }
      if (current.length > 0) units.push(current);
    }
  }
  return units;
}

/** Word-boundary tail of a chunk, used as the overlap prefix. */
function overlapTail(chunk: string, overlapChars: number): string {
  if (overlapChars <= 0 || chunk.length <= overlapChars) return '';
  const tail = chunk.slice(-overlapChars);
  const boundary = tail.indexOf(' ');
  return boundary === -1 ? '' : tail.slice(boundary + 1);
}

export function chunkText(text: string, options: ChunkingOptions = {}): string[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? Math.floor(maxChars * 0.15);
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) return [];

  const units = splitIntoUnits(normalized, maxChars, Math.max(1, maxChars - overlapChars));
  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    const joined = current.length === 0 ? unit : `${current} ${unit}`;
    if (joined.length > maxChars && current.length > 0) {
      chunks.push(current);
      // Overlap is best-effort: dropped when the next unit is too big
      // to share a chunk with it (a chunk never exceeds maxChars).
      const tail = overlapTail(current, overlapChars);
      const withOverlap = tail.length === 0 ? unit : `${tail} ${unit}`;
      current = withOverlap.length > maxChars ? unit : withOverlap;
    } else {
      current = joined;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

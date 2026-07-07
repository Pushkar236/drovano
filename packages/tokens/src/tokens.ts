/**
 * DTCG token document loader and alias resolver. `tokens.json` is the
 * single source of truth (ADR-0009); this module parses it, inherits
 * group-level $type, resolves `{path.to.token}` aliases (with cycle
 * detection), and exposes typed accessors for the builder and the
 * contrast-contract tests.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Oklch } from './color.js';

export type TokenType =
  'color' | 'dimension' | 'duration' | 'cubicBezier' | 'fontFamily' | 'fontWeight' | 'number';

export interface ColorTokenValue extends Oklch {
  alpha?: number;
}

export interface DimensionTokenValue {
  value: number;
  unit: string;
}

export type ResolvedTokenValue =
  | { kind: 'color'; color: ColorTokenValue }
  | { kind: 'dimension'; dimension: DimensionTokenValue }
  | { kind: 'duration'; duration: DimensionTokenValue }
  | { kind: 'cubicBezier'; points: [number, number, number, number] }
  | { kind: 'fontFamily'; families: string[] }
  | { kind: 'fontWeight'; weight: number }
  | { kind: 'number'; value: number };

export interface ResolvedToken {
  /** Dot-separated token path, e.g. `color.neutral.500`. */
  path: string;
  type: TokenType;
  value: ResolvedTokenValue;
  /** The alias target's path when this token's $value was a reference. */
  aliasOf?: string;
}

export class TokenDocumentError extends Error {
  constructor(path: string, problem: string) {
    super(`token ${path}: ${problem}`);
    this.name = 'TokenDocumentError';
  }
}

const TOKENS_JSON_URL = new URL('../tokens.json', import.meta.url);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const TOKEN_TYPES: readonly TokenType[] = [
  'color',
  'dimension',
  'duration',
  'cubicBezier',
  'fontFamily',
  'fontWeight',
  'number',
];

function isTokenType(value: unknown): value is TokenType {
  return typeof value === 'string' && (TOKEN_TYPES as readonly string[]).includes(value);
}

interface RawToken {
  path: string;
  type: TokenType;
  rawValue: unknown;
}

function collectRawTokens(
  group: Record<string, unknown>,
  prefix: string,
  inheritedType: TokenType | undefined,
  out: Map<string, RawToken>,
): void {
  const groupType = isTokenType(group.$type) ? group.$type : inheritedType;
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    if (!isRecord(value)) {
      throw new TokenDocumentError(`${prefix}${key}`, 'expected a group or token object');
    }
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if ('$value' in value) {
      const ownType = isTokenType(value.$type) ? value.$type : groupType;
      if (ownType === undefined) {
        throw new TokenDocumentError(path, 'no $type on the token or any ancestor group');
      }
      out.set(path, { path, type: ownType, rawValue: value.$value });
    } else {
      collectRawTokens(value, path, groupType, out);
    }
  }
}

const ALIAS_PATTERN = /^\{([^{}]+)\}$/;

function parseValue(path: string, type: TokenType, raw: unknown): ResolvedTokenValue {
  switch (type) {
    case 'color': {
      if (!isRecord(raw) || raw.colorSpace !== 'oklch' || !Array.isArray(raw.components)) {
        throw new TokenDocumentError(
          path,
          'color values must be { colorSpace: "oklch", components: [L, C, H] }',
        );
      }
      // Array.isArray yields any[]; retype as unknown[] so the checks below narrow.
      const components: readonly unknown[] = raw.components;
      const [l, c, h] = components;
      if (
        components.length !== 3 ||
        typeof l !== 'number' ||
        typeof c !== 'number' ||
        typeof h !== 'number'
      ) {
        throw new TokenDocumentError(path, 'oklch components must be three numbers');
      }
      const alpha = raw.alpha;
      if (alpha !== undefined && typeof alpha !== 'number') {
        throw new TokenDocumentError(path, 'alpha must be a number when present');
      }
      return { kind: 'color', color: alpha === undefined ? { l, c, h } : { l, c, h, alpha } };
    }
    case 'dimension':
    case 'duration': {
      if (!isRecord(raw) || typeof raw.value !== 'number' || typeof raw.unit !== 'string') {
        throw new TokenDocumentError(path, `${type} values must be { value, unit }`);
      }
      const dimension = { value: raw.value, unit: raw.unit };
      return type === 'dimension'
        ? { kind: 'dimension', dimension }
        : { kind: 'duration', duration: dimension };
    }
    case 'cubicBezier': {
      if (!Array.isArray(raw) || raw.length !== 4 || raw.some((n) => typeof n !== 'number')) {
        throw new TokenDocumentError(path, 'cubicBezier values must be four numbers');
      }
      // Safe: length and element types verified above.
      return { kind: 'cubicBezier', points: raw as [number, number, number, number] };
    }
    case 'fontFamily': {
      if (!Array.isArray(raw) || raw.some((f) => typeof f !== 'string')) {
        throw new TokenDocumentError(path, 'fontFamily values must be an array of strings');
      }
      // Safe: element types verified above.
      return { kind: 'fontFamily', families: raw as string[] };
    }
    case 'fontWeight':
    case 'number': {
      if (typeof raw !== 'number') {
        throw new TokenDocumentError(path, `${type} values must be numbers`);
      }
      return type === 'fontWeight'
        ? { kind: 'fontWeight', weight: raw }
        : { kind: 'number', value: raw };
    }
  }
}

/** Parse and resolve a DTCG document object. Exported for tests. */
export function parseTokenDocument(document: unknown): Map<string, ResolvedToken> {
  if (!isRecord(document)) {
    throw new TokenDocumentError('(root)', 'document must be an object');
  }
  const raw = new Map<string, RawToken>();
  collectRawTokens(document, '', undefined, raw);

  const resolved = new Map<string, ResolvedToken>();
  const resolving = new Set<string>();

  const resolve = (path: string): ResolvedToken => {
    const existing = resolved.get(path);
    if (existing !== undefined) return existing;
    const token = raw.get(path);
    if (token === undefined) {
      throw new TokenDocumentError(path, 'referenced token does not exist');
    }
    if (resolving.has(path)) {
      throw new TokenDocumentError(path, `alias cycle: ${[...resolving, path].join(' → ')}`);
    }

    let result: ResolvedToken;
    const alias = typeof token.rawValue === 'string' ? ALIAS_PATTERN.exec(token.rawValue) : null;
    if (alias?.[1] !== undefined) {
      resolving.add(path);
      const target = resolve(alias[1]);
      resolving.delete(path);
      if (target.type !== token.type) {
        throw new TokenDocumentError(
          path,
          `aliases ${target.path} of type ${target.type}, expected ${token.type}`,
        );
      }
      result = {
        path,
        type: token.type,
        value: target.value,
        aliasOf: target.aliasOf ?? target.path,
      };
    } else {
      result = { path, type: token.type, value: parseValue(path, token.type, token.rawValue) };
    }
    resolved.set(path, result);
    return result;
  };

  for (const path of raw.keys()) resolve(path);
  return resolved;
}

/** Load and resolve the canonical tokens.json. */
export function loadTokens(): Map<string, ResolvedToken> {
  const text = readFileSync(fileURLToPath(TOKENS_JSON_URL), 'utf8');
  return parseTokenDocument(JSON.parse(text));
}

export function getColor(tokens: Map<string, ResolvedToken>, path: string): ColorTokenValue {
  const token = tokens.get(path);
  if (token === undefined) throw new TokenDocumentError(path, 'not found');
  if (token.value.kind !== 'color') throw new TokenDocumentError(path, 'not a color token');
  return token.value.color;
}

export type ThemeName = 'light' | 'dark';

/** All semantic color names for a theme (path suffix after `theme.<name>.`). */
export function themeEntries(
  tokens: Map<string, ResolvedToken>,
  theme: ThemeName,
): Map<string, ResolvedToken> {
  const prefix = `theme.${theme}.`;
  const entries = new Map<string, ResolvedToken>();
  for (const [path, token] of tokens) {
    if (path.startsWith(prefix)) entries.set(path.slice(prefix.length), token);
  }
  return entries;
}

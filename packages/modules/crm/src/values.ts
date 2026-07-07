import type { AttributeType } from '@drovano/db';
import { z } from 'zod';

import { CrmError } from './errors.js';

/** JS-facing value shape per attribute type (dates/timestamps as ISO strings). */
export type AttributeValue = string | number | boolean | string[];

export interface ValueColumns {
  valueText: string | null;
  valueNumber: string | null;
  valueBoolean: boolean | null;
  valueDate: string | null;
  valueTimestamp: Date | null;
  valueUuid: string | null;
  valueJsonb: unknown;
}

const EMPTY_COLUMNS: ValueColumns = {
  valueText: null,
  valueNumber: null,
  valueBoolean: null,
  valueDate: null,
  valueTimestamp: null,
  valueUuid: null,
  valueJsonb: null,
};

const text = z.string().max(65_536);
const isoDate = z.iso.date();
const isoTimestamp = z.iso.datetime({ offset: true });

const VALIDATORS: Record<AttributeType, z.ZodType<AttributeValue>> = {
  text,
  url: z.url().max(2_048),
  email: z.email().max(320),
  phone: z.string().trim().min(3).max(32),
  select: z.string().min(1).max(256),
  multi_select: z.array(z.string().min(1).max(256)).max(100),
  number: z.number(),
  currency: z.number(),
  checkbox: z.boolean(),
  date: isoDate,
  timestamp: isoTimestamp,
  user: z.uuid(),
  relation: z.uuid(),
};

/**
 * Validate a value against its attribute type and map it onto the ONE
 * matching typed-EAV column (data-model.md §4). The database CHECK
 * constraint backs this up; this is where the actionable error lives.
 */
export function toValueColumns(
  attributeKey: string,
  type: AttributeType,
  value: AttributeValue,
): ValueColumns {
  const parsed = VALIDATORS[type].safeParse(value);
  if (!parsed.success) {
    throw new CrmError(
      'invalid-value',
      `"${attributeKey}" expects a ${type} value: ${parsed.error.issues[0]?.message ?? 'invalid input'}.`,
    );
  }
  const valid = parsed.data;

  switch (type) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
      return { ...EMPTY_COLUMNS, valueText: valid as string };
    case 'number':
    case 'currency':
      return { ...EMPTY_COLUMNS, valueNumber: String(valid) };
    case 'checkbox':
      return { ...EMPTY_COLUMNS, valueBoolean: valid as boolean };
    case 'date':
      return { ...EMPTY_COLUMNS, valueDate: valid as string };
    case 'timestamp':
      return { ...EMPTY_COLUMNS, valueTimestamp: new Date(valid as string) };
    case 'user':
    case 'relation':
      return { ...EMPTY_COLUMNS, valueUuid: valid as string };
    case 'multi_select':
      return { ...EMPTY_COLUMNS, valueJsonb: valid };
  }
}

/** Inverse mapping: hydrate a stored row back to the JS-facing value. */
export function fromValueColumns(type: AttributeType, columns: ValueColumns): AttributeValue {
  switch (type) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
      return columns.valueText ?? '';
    case 'number':
    case 'currency':
      return Number(columns.valueNumber ?? 0);
    case 'checkbox':
      return columns.valueBoolean ?? false;
    case 'date':
      return columns.valueDate ?? '';
    case 'timestamp':
      return columns.valueTimestamp?.toISOString() ?? '';
    case 'user':
    case 'relation':
      return columns.valueUuid ?? '';
    case 'multi_select':
      return z.array(z.string()).catch([]).parse(columns.valueJsonb);
  }
}

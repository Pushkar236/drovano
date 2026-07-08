import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header carrying the delivery signature. */
export const SIGNATURE_HEADER = 'X-Drovano-Signature';

/** HMAC-SHA256 of the raw body, formatted as `sha256=<hex>`. */
export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** Constant-time verification for receivers (and our own tests). */
export function verifyWebhookSignature(secret: string, body: string, signature: string): boolean {
  const expected = Buffer.from(signWebhookBody(secret, body));
  const presented = Buffer.from(signature);
  return expected.length === presented.length && timingSafeEqual(expected, presented);
}

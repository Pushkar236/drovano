/**
 * Token encryption (SECURITY.md: third-party credentials never rest in
 * plaintext). AES-256-GCM with a key derived from the app secret via
 * HKDF — rotating AUTH_SECRET invalidates stored tokens, which fails
 * safe: users reconnect, nothing leaks.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export interface TokenCipher {
  encrypt: (plaintext: string) => string;
  decrypt: (ciphertext: string) => string;
}

const HKDF_INFO = 'drovano-google-tokens';

export function createTokenCipher(appSecret: string): TokenCipher {
  if (appSecret.length < 32) {
    throw new Error('Token cipher requires a secret of at least 32 characters.');
  }
  const key = Buffer.from(hkdfSync('sha256', appSecret, HKDF_INFO, '', 32));

  return {
    encrypt: (plaintext) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
    },
    decrypt: (ciphertext) => {
      const [iv, tag, data] = ciphertext.split(':');
      if (iv === undefined || tag === undefined || data === undefined) {
        throw new Error('Malformed token ciphertext.');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}

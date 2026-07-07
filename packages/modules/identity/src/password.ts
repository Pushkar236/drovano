import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id parameters per the OWASP Password Storage Cheat Sheet baseline
 * (m=19456 KiB, t=2, p=1). @node-rs/argon2 defaults to the argon2id
 * variant. Changing these only affects new hashes; existing digests embed
 * their parameters and keep verifying.
 */
const ARGON2ID_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID_OPTIONS);
}

export function verifyPassword(data: { password: string; hash: string }): Promise<boolean> {
  return verify(data.hash, data.password);
}

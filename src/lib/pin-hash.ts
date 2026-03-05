import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Hash a 4-6 digit PIN using PBKDF2-like approach with SHA-256.
 * Uses a random salt to prevent rainbow table attacks.
 */
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + pin).digest('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a PIN against a stored hash.
 */
export function verifyPin(pin: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const candidate = createHash('sha256').update(salt + pin).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
  } catch {
    return false;
  }
}

import crypto from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

/**
 * Hashes a plain-text password using Argon2id (OWASP recommended parameters).
 * REQ-06: ห้ามจัดเก็บ Password แบบ Plain Text / ใช้ Password Hash ที่เหมาะสม เช่น Argon2id
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return argon2id({
    password: plainPassword,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536, // 64 MB
    hashLength: 32,
    outputType: 'encoded',
  });
}

/**
 * Verifies a plain-text password against an Argon2id encoded hash.
 */
export async function verifyPassword(plainPassword: string, encodedHash: string): Promise<boolean> {
  try {
    if (!encodedHash || !encodedHash.startsWith('$argon2')) {
      return false;
    }
    return await argon2Verify({
      password: plainPassword,
      hash: encodedHash,
    });
  } catch {
    return false;
  }
}


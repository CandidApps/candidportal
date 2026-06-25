import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.ZOHO_TOKEN_ENC_KEY;
  if (!hex) {
    throw new Error('ZOHO_TOKEN_ENC_KEY is not set');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('ZOHO_TOKEN_ENC_KEY must be a 32-byte (64-char) hex string');
  }
  return key;
}

/** Encrypts a secret into a self-describing string: v1:<iv>:<authTag>:<ciphertext> (all base64). */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Malformed encrypted secret');
  }
  const key = getKey();
  const iv = Buffer.from(parts[1]!, 'base64');
  const authTag = Buffer.from(parts[2]!, 'base64');
  const ciphertext = Buffer.from(parts[3]!, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

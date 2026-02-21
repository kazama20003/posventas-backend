import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

const HASH_PREFIX = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = (await scrypt(password, salt, KEY_BYTES)) as Buffer;

  return `${HASH_PREFIX}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(
  plainPassword: string,
  storedPassword: string,
): Promise<boolean> {
  if (!storedPassword.startsWith(`${HASH_PREFIX}$`)) {
    // Backward compatibility if there are legacy plain-text passwords.
    return plainPassword === storedPassword;
  }

  const [prefix, salt, digestHex] = storedPassword.split('$');
  if (!prefix || !salt || !digestHex || prefix !== HASH_PREFIX) {
    return false;
  }

  const expected = Buffer.from(digestHex, 'hex');
  const candidate = (await scrypt(
    plainPassword,
    salt,
    expected.length,
  )) as Buffer;

  if (candidate.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
}

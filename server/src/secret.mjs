import { readFileSync } from 'node:fs';

export function readProtectedKey(env = process.env) {
  const file = env.VK_PROTECTED_KEY_FILE;
  const inline = env.VK_PROTECTED_KEY;
  if (file && inline) {
    throw new Error('Provide either VK_PROTECTED_KEY_FILE or VK_PROTECTED_KEY, never both');
  }
  if (file) {
    if (!file.startsWith('/') || file.includes('\0')) {
      throw new Error('VK_PROTECTED_KEY_FILE must be an absolute path');
    }
    const value = readFileSync(file, { encoding: 'utf8', flag: 'r' })
      .replace(/\r?\n$/, '');
    if (!value || value.length < 12 || value.includes('\n') || value.includes('\r')) {
      throw new Error('Invalid VK protected key file');
    }
    return value;
  }
  if (typeof inline === 'string' && inline.length >= 12 &&
      !inline.includes('\n') && !inline.includes('\r')) return inline;
  throw new Error('VK protected key is required; prefer VK_PROTECTED_KEY_FILE');
}

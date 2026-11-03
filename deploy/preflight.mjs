import { statSync } from 'node:fs';
import { resolve, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateStaging({ domain, secretPath, repoRoot, stat = statSync } = {}) {
  if (typeof domain !== 'string' ||
      domain.length < 4 || domain.length > 253 ||
      !/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain) ||
      /\.(?:invalid|example|test|localhost|local)$/.test(domain) ||
      domain === 'vk.com' || domain.endsWith('.vk.com') ||
      domain === 'vk.ru' || domain.endsWith('.vk.ru')) {
    throw new Error('PILOT_DOMAIN must be a valid separate public HTTPS domain');
  }
  if (typeof secretPath !== 'string' || !isAbsolute(secretPath)) {
    throw new Error('VK_SECRET_FILE must be an absolute path');
  }
  const root = resolve(repoRoot || fileURLToPath(new URL('../', import.meta.url)));
  const target = resolve(secretPath);
  if (target === root || target.startsWith(root + sep)) {
    throw new Error('VK_SECRET_FILE must be outside the Git repository');
  }
  const info = stat(target);
  if (!info.isFile() || info.size < 12 || info.size > 512) {
    throw new Error('VK_SECRET_FILE must be a nonempty regular key file');
  }
  if ((info.mode & 0o077) !== 0) {
    throw new Error('VK_SECRET_FILE permissions must be owner-only (chmod 600)');
  }
  // Node container uses UID 1000. Compose file-backed secrets preserve host ownership.
  if (info.uid !== 1000) {
    throw new Error('VK_SECRET_FILE owner must be UID 1000 for unprivileged Node container');
  }
  return { domain, secretConfigured: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateStaging({
      domain: process.env.PILOT_DOMAIN,
      secretPath: process.env.VK_SECRET_FILE
    });
    console.log('STAGING PREFLIGHT OK: ' + result.domain + ' (key contents never shown)');
  } catch (error) {
    console.error('STAGING PREFLIGHT FAILED: ' + error.message);
    process.exitCode = 1;
  }
}

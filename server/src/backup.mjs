import { existsSync, mkdirSync, chmodSync, statSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite-consistent online backup. Never copy the WAL database file directly.
 * Caller must choose a non-existent output path in a private destination.
 */
export function backupDatabase(input, output) {
  if (!isAbsolute(input) || !isAbsolute(output) || resolve(input) === resolve(output)) {
    throw new Error('Backup requires separate absolute input and output paths');
  }
  if (!existsSync(input) || !statSync(input).isFile()) {
    throw new Error('Source SQLite database not found');
  }
  if (existsSync(output)) {
    throw new Error('Backup destination exists: refusing to overwrite');
  }
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(input);
  let completed = false;
  try {
    db.prepare('VACUUM INTO ?').run(output);
    chmodSync(output, 0o600);
    const check = new DatabaseSync(output, { readOnly: true });
    try {
      const result = check.prepare('PRAGMA integrity_check').get();
      if (result.integrity_check !== 'ok') throw new Error('Backup integrity check failed');
    } finally {
      check.close();
    }
    completed = true;
    return { output, bytes: statSync(output).size };
  } finally {
    db.close();
    if (!completed && existsSync(output)) unlinkSync(output);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    const [source, target] = process.argv.slice(2);
    const result = backupDatabase(source, target);
    console.log('SQLite backup validated: ' + result.bytes + ' bytes (path not logged)');
  } catch (error) {
    console.error('Backup failed: ' + error.message);
    process.exitCode = 1;
  }
}

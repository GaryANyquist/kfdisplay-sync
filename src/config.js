/**
 * Settings come from environment variables, or from a .env file next to the
 * project (see .env.example). The real environment wins over the file.
 * Connection settings use the same names as kfdisplay-mcp.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadDotEnv(file = path.join(projectRoot, '.env')) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let v = line.slice(eq + 1).trim();
    if (v.length > 1 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

const bool = (v, d) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const int = (v, d) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : d;
};

export function loadConfig(rawEnv = process.env, fileEnv = loadDotEnv()) {
  const env = { ...fileEnv };
  for (const [k, v] of Object.entries(rawEnv)) if (v !== undefined && v !== '') env[k] = v;

  const syncKey = env.SYNC_KEY ?? '';
  if (syncKey.length < 24) {
    throw new Error('SYNC_KEY must be set and at least 24 characters. Run `npm run make-key` to make one.');
  }
  if (!env.KFDISPLAY_USER || !env.KFDISPLAY_PASSWORD) {
    throw new Error('KFDISPLAY_USER and KFDISPLAY_PASSWORD are required (the register_sync login from setup/03).');
  }
  const instanceName = env.KFDISPLAY_INSTANCE || undefined;
  const port = env.KFDISPLAY_PORT ? int(env.KFDISPLAY_PORT, 1433) : undefined;
  if (instanceName && port) throw new Error('Set KFDISPLAY_INSTANCE or KFDISPLAY_PORT, not both.');

  const sql = {
    server: env.KFDISPLAY_SERVER ?? 'localhost',
    database: env.KFDISPLAY_DATABASE ?? 'KFDisplay',
    user: env.KFDISPLAY_USER,
    password: env.KFDISPLAY_PASSWORD,
    options: {
      instanceName,
      encrypt: bool(env.KFDISPLAY_ENCRYPT, false),
      trustServerCertificate: bool(env.KFDISPLAY_TRUST_SERVER_CERT, true),
      enableArithAbort: true,
    },
    requestTimeout: 30000,
    connectionTimeout: 15000,
    pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
  };
  if (port) sql.port = port;
  // SQL Server 2012/2014 only offer old TLS versions for the login handshake.
  if (bool(env.KFDISPLAY_LEGACY_TLS, false)) {
    sql.options.cryptoCredentialsDetails = { minVersion: 'TLSv1', ciphers: 'DEFAULT@SECLEVEL=0' };
  }

  return {
    sql,
    syncKey,
    port: int(env.SYNC_PORT, 8787),
    host: env.SYNC_HOST || '0.0.0.0',
    // Where KFIDisplay reads item photos from; the tablet sends missing ones here.
    photoDir: env.PHOTO_DIR || 'C:\\images',
  };
}

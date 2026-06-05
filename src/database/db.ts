import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('stockvoz.db');
  await _db.execAsync('PRAGMA journal_mode = WAL;');
  await _db.execAsync('PRAGMA foreign_keys = ON;');
  await _db.execAsync('PRAGMA synchronous = NORMAL;');
  await initSchema(_db);
  return _db;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) return;

  // DDL statements run sequentially — no wrapping transaction needed
  // because CREATE TABLE IF NOT EXISTS is idempotent and SQLite
  // auto-commits DDL. Using withTransactionAsync here causes
  // "transaction within a transaction" on expo-sqlite v14+.
  for (const sql of SCHEMA_SQL) {
    await db.execAsync(sql);
  }
  await db.runAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

// Cierra la conexión — útil en tests, no se llama en producción normal
export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.closeAsync();
    _db = null;
  }
}

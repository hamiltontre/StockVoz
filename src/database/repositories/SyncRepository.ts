import { getDb } from '../db';
import type { ItemSyncQueue, Result } from '../../types';

/**
 * RF-06 — Cola de sincronización diferida.
 *
 * Cada operación que cambie datos importantes (ventas, productos, etc.)
 * se encola aquí. Cuando haya internet, un proceso en background
 * (futuro: `useSync`) procesará la cola enviando los items al backend
 * Laravel en Hostinger.
 *
 * Esta capa es agnóstica al backend — solo gestiona la cola local.
 */
export const SyncRepository = {
  async encolar(
    tabla: string,
    operacion: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: unknown
  ): Promise<Result<void>> {
    try {
      const db = await getDb();
      await db.runAsync(
        'INSERT INTO sync_queue (tabla, operacion, payload) VALUES (?, ?, ?)',
        [tabla, operacion, JSON.stringify(payload)]
      );
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async obtenerPendientes(limite = 50): Promise<Result<ItemSyncQueue[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<ItemSyncQueue>(
        `SELECT * FROM sync_queue
         WHERE sincronizado_en IS NULL AND intentos < 5
         ORDER BY creado_en ASC LIMIT ?`,
        [limite]
      );
      return { ok: true, data: rows };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async marcarSincronizado(id: number): Promise<Result<void>> {
    try {
      const db = await getDb();
      await db.runAsync(
        "UPDATE sync_queue SET sincronizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        [id]
      );
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async incrementarIntento(id: number): Promise<Result<void>> {
    try {
      const db = await getDb();
      await db.runAsync(
        'UPDATE sync_queue SET intentos = intentos + 1 WHERE id = ?',
        [id]
      );
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async contarPendientes(): Promise<number> {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM sync_queue WHERE sincronizado_en IS NULL AND intentos < 5'
      );
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  },

  async limpiarAntiguos(): Promise<Result<number>> {
    try {
      const db = await getDb();
      // Limpiar items sincronizados de más de 30 días
      const result = await db.runAsync(
        "DELETE FROM sync_queue WHERE sincronizado_en IS NOT NULL AND sincronizado_en < datetime('now', '-30 days')"
      );
      return { ok: true, data: result.changes };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
};

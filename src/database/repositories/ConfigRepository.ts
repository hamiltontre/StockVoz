import { getDb } from '../db';

/**
 * Key-value persistente en SQLite. Reemplaza AsyncStorage sin dependencia extra.
 * Las claves se documentan abajo para evitar typos.
 */
export const CLAVES = {
  API_TOKEN: 'api_token',
  NEGOCIO_REMOTO_ID: 'negocio_remoto_id',
  ULTIMA_SYNC: 'ultima_sync',
  COMPRAS_PERIODO: 'compras_periodo', // 'semanal' | 'mensual'
} as const;

export type ClaveConfig = (typeof CLAVES)[keyof typeof CLAVES];

export const ConfigRepository = {
  async obtener(clave: ClaveConfig): Promise<string | null> {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ valor: string }>(
        'SELECT valor FROM app_config WHERE clave = ?',
        [clave]
      );
      return row?.valor ?? null;
    } catch {
      return null;
    }
  },

  async guardar(clave: ClaveConfig, valor: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO app_config (clave, valor) VALUES (?, ?)
       ON CONFLICT(clave) DO UPDATE SET
         valor = excluded.valor,
         actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      [clave, valor]
    );
  },

  async eliminar(clave: ClaveConfig): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM app_config WHERE clave = ?', [clave]);
  },
};

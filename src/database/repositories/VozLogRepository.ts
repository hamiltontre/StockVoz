import { getDb } from '../db';
import type { Result } from '../../types';

/**
 * Registro de lo que la voz escuchó y de si acertó.
 *
 * La voz es el diferenciador del producto; sin medirla solo quedaba la
 * impresión ("a veces falla"). Con esto se puede decir "acertó 46 de 50"
 * y, sobre todo, VER el patrón de los fallos: si son marcas nuevas se
 * enseñan, si son productos ya enseñados el problema es de fondo.
 */

export interface EntradaVozLog {
  id: number;
  transcripcion: string;
  segmentos: string;
  encontrados: number;
  no_encontrados: number;
  creado_en: string;
}

export interface ResumenVoz {
  total: number;
  perfectos: number;      // comandos donde se encontró TODO
  conFallos: number;
  productosBuscados: number;
  productosEncontrados: number;
}

export const VozLogRepository = {
  async registrar(
    transcripcion: string,
    segmentos: Array<{ cantidad: number; palabras: string[]; encontrado: boolean }>
  ): Promise<void> {
    try {
      const db = await getDb();
      const encontrados = segmentos.filter((s) => s.encontrado).length;
      await db.runAsync(
        `INSERT INTO voz_log (transcripcion, segmentos, encontrados, no_encontrados)
         VALUES (?, ?, ?, ?)`,
        [
          transcripcion,
          JSON.stringify(segmentos),
          encontrados,
          segmentos.length - encontrados,
        ]
      );
    } catch {
      // El diagnóstico nunca debe estorbar una venta
    }
  },

  async resumen(): Promise<Result<ResumenVoz>> {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<ResumenVoz>(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN no_encontrados = 0 THEN 1 ELSE 0 END),0) AS perfectos,
           COALESCE(SUM(CASE WHEN no_encontrados > 0 THEN 1 ELSE 0 END),0) AS conFallos,
           COALESCE(SUM(encontrados + no_encontrados),0) AS productosBuscados,
           COALESCE(SUM(encontrados),0) AS productosEncontrados
         FROM voz_log`
      );
      return { ok: true, data: row ?? {
        total: 0, perfectos: 0, conFallos: 0,
        productosBuscados: 0, productosEncontrados: 0,
      } };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async ultimas(limite = 100): Promise<Result<EntradaVozLog[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<EntradaVozLog>(
        'SELECT * FROM voz_log ORDER BY id DESC LIMIT ?',
        [limite]
      );
      return { ok: true, data: rows };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async limpiar(): Promise<Result<void>> {
    try {
      const db = await getDb();
      await db.runAsync('DELETE FROM voz_log');
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  /** Texto compartible para analizar los fallos fuera del teléfono. */
  async generarReporte(): Promise<string> {
    const [res, ult] = await Promise.all([this.resumen(), this.ultimas(100)]);
    const lineas: string[] = ['*DIAGNÓSTICO DE VOZ — StockVoz*', ''];

    if (res.ok) {
      const r = res.data;
      const pct = r.productosBuscados > 0
        ? Math.round((r.productosEncontrados / r.productosBuscados) * 100)
        : 0;
      lineas.push(`Comandos: ${r.total}  ·  sin fallos: ${r.perfectos}`);
      lineas.push(`Productos: ${r.productosEncontrados}/${r.productosBuscados} encontrados (${pct}%)`);
      lineas.push('');
    }

    if (ult.ok && ult.data.length > 0) {
      lineas.push('*DETALLE (más reciente primero)*');
      for (const e of ult.data) {
        const marca = e.no_encontrados === 0 ? 'OK  ' : 'FALLA';
        lineas.push(`${marca} «${e.transcripcion}»`);
        try {
          const segs = JSON.parse(e.segmentos) as Array<{
            cantidad: number; palabras: string[]; encontrado: boolean;
          }>;
          for (const s of segs) {
            lineas.push(`      ${s.encontrado ? '✓' : '✗'} ${s.cantidad} × ${s.palabras.join(' ')}`);
          }
        } catch { /* entrada corrupta: se omite el detalle */ }
      }
    }
    return lineas.join('\n');
  },
};

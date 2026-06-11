import { getDb } from '../db';
import { SyncRepository } from './SyncRepository';
import { bus, EVENTOS } from '../../utils/eventos';
import { normalizarTexto } from '../../utils/texto';
import type {
  Producto,
  CrearProductoDTO,
  ActualizarProductoDTO,
  PalabraClave,
  Result,
} from '../../types';

function rowToProducto(row: Record<string, unknown>): Producto {
  return {
    id: row.id as number,
    nombre: row.nombre as string,
    codigo_barras: (row.codigo_barras as string) ?? null,
    precio: row.precio as number,
    precio_costo: (row.precio_costo as number) ?? 0,
    stock: row.stock as number,
    stock_minimo: row.stock_minimo as number,
    fecha_vencimiento: (row.fecha_vencimiento as string) ?? null,
    unidad: ((row.unidad as string) ?? 'unidad') as Producto['unidad'],
    categoria_id: (row.categoria_id as number) ?? null,
    activo: (row.activo as number) === 1,
    creado_en: row.creado_en as string,
    actualizado_en: row.actualizado_en as string,
  };
}

export const ProductoRepository = {
  async obtenerTodos(): Promise<Result<Producto[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM productos WHERE activo = 1 ORDER BY nombre ASC'
      );
      return { ok: true, data: rows.map(rowToProducto) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async buscarPorNombre(termino: string): Promise<Result<Producto[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM productos WHERE activo = 1 AND nombre LIKE ? ORDER BY nombre ASC',
        [`%${termino}%`]
      );
      return { ok: true, data: rows.map(rowToProducto) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async buscarPorPalabraClave(palabra: string): Promise<Result<Producto[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT p.* FROM productos p
         INNER JOIN palabras_clave pc ON pc.producto_id = p.id
         WHERE p.activo = 1 AND pc.palabra LIKE ?
         ORDER BY p.nombre ASC`,
        [`%${palabra}%`]
      );
      return { ok: true, data: rows.map(rowToProducto) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async obtenerPorId(id: number): Promise<Result<Producto | null>> {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM productos WHERE id = ?',
        [id]
      );
      return { ok: true, data: row ? rowToProducto(row) : null };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async crear(dto: CrearProductoDTO): Promise<Result<Producto>> {
    try {
      if (!dto.nombre?.trim()) return { ok: false, error: 'El nombre es requerido' };
      if (dto.precio < 0) return { ok: false, error: 'El precio no puede ser negativo' };
      if (dto.stock < 0) return { ok: false, error: 'El stock no puede ser negativo' };
      if (dto.precio_costo != null && dto.precio_costo < 0) {
        return { ok: false, error: 'El precio de costo no puede ser negativo' };
      }

      const db = await getDb();
      const result = await db.runAsync(
        `INSERT INTO productos
           (nombre, codigo_barras, precio, precio_costo, stock, stock_minimo,
            fecha_vencimiento, unidad, categoria_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dto.nombre.trim(),
          dto.codigo_barras ?? null,
          dto.precio,
          dto.precio_costo ?? 0,
          dto.stock,
          dto.stock_minimo,
          dto.fecha_vencimiento ?? null,
          dto.unidad ?? 'unidad',
          dto.categoria_id ?? null,
        ]
      );
      if (!result.lastInsertRowId) {
        return { ok: false, error: 'Error al crear el producto (sin ID)' };
      }
      const created = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM productos WHERE id = ?',
        [result.lastInsertRowId]
      );
      if (!created) {
        return { ok: false, error: 'Error al recuperar el producto creado' };
      }
      const producto = rowToProducto(created);
      // Fire-and-forget: si falla encolar, el producto ya está guardado local
      SyncRepository.encolar('productos', 'INSERT', producto).catch(() => {});
      bus.emit(EVENTOS.PRODUCTO_CAMBIO);
      bus.emit(EVENTOS.STOCK_CAMBIO);
      return { ok: true, data: producto };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async actualizar(id: number, dto: ActualizarProductoDTO): Promise<Result<Producto>> {
    try {
      const db = await getDb();
      const campos: string[] = [];
      const valores: (string | number | null)[] = [];

      if (dto.nombre !== undefined) {
        if (!dto.nombre.trim()) return { ok: false, error: 'El nombre es requerido' };
        campos.push('nombre = ?'); valores.push(dto.nombre.trim());
      }
      if (dto.precio !== undefined) {
        if (dto.precio < 0) return { ok: false, error: 'El precio no puede ser negativo' };
        campos.push('precio = ?'); valores.push(dto.precio);
      }
      if (dto.stock !== undefined) {
        if (dto.stock < 0) return { ok: false, error: 'El stock no puede ser negativo' };
        campos.push('stock = ?'); valores.push(dto.stock);
      }
      if (dto.stock_minimo !== undefined) { campos.push('stock_minimo = ?'); valores.push(dto.stock_minimo); }
      if (dto.codigo_barras !== undefined) { campos.push('codigo_barras = ?'); valores.push(dto.codigo_barras); }
      if (dto.categoria_id !== undefined) { campos.push('categoria_id = ?'); valores.push(dto.categoria_id); }
      if (dto.precio_costo !== undefined) {
        if (dto.precio_costo < 0) return { ok: false, error: 'El precio de costo no puede ser negativo' };
        campos.push('precio_costo = ?'); valores.push(dto.precio_costo);
      }
      if (dto.fecha_vencimiento !== undefined) {
        campos.push('fecha_vencimiento = ?'); valores.push(dto.fecha_vencimiento);
      }
      if (dto.unidad !== undefined) {
        campos.push('unidad = ?'); valores.push(dto.unidad);
      }

      if (campos.length === 0) return { ok: false, error: 'Nada que actualizar' };

      campos.push("actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
      valores.push(id);

      await db.runAsync(
        `UPDATE productos SET ${campos.join(', ')} WHERE id = ?`,
        valores
      );

      const updated = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM productos WHERE id = ?',
        [id]
      );
      if (!updated) return { ok: false, error: 'Producto no encontrado' };
      const producto = rowToProducto(updated);
      SyncRepository.encolar('productos', 'UPDATE', producto).catch(() => {});
      bus.emit(EVENTOS.PRODUCTO_CAMBIO);
      bus.emit(EVENTOS.STOCK_CAMBIO);
      return { ok: true, data: producto };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async desactivar(id: number): Promise<Result<void>> {
    try {
      const db = await getDb();
      await db.runAsync(
        "UPDATE productos SET activo = 0, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        [id]
      );
      // El backend interpreta DELETE como desactivar (activo = false)
      SyncRepository.encolar('productos', 'DELETE', { id }).catch(() => {});
      bus.emit(EVENTOS.PRODUCTO_CAMBIO);
      bus.emit(EVENTOS.STOCK_CAMBIO);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async ajustarStock(id: number, cantidad: number): Promise<Result<void>> {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ stock: number }>(
        'SELECT stock FROM productos WHERE id = ?',
        [id]
      );
      if (!row) return { ok: false, error: 'Producto no encontrado' };
      if (row.stock + cantidad < 0) return { ok: false, error: 'Stock insuficiente' };

      await db.runAsync(
        "UPDATE productos SET stock = stock + ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        [cantidad, id]
      );
      const ajustado = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM productos WHERE id = ?',
        [id]
      );
      if (ajustado) {
        SyncRepository.encolar('productos', 'UPDATE', rowToProducto(ajustado)).catch(() => {});
      }
      bus.emit(EVENTOS.STOCK_CAMBIO);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async obtenerStockBajo(): Promise<Result<Producto[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM productos WHERE activo = 1 AND stock <= stock_minimo ORDER BY stock ASC'
      );
      return { ok: true, data: rows.map(rowToProducto) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  // ─── Palabras clave ──────────────────────────────────────────────────────────

  async agregarPalabraClave(productoId: number, palabra: string): Promise<Result<void>> {
    try {
      if (!palabra.trim()) return { ok: false, error: 'La palabra no puede estar vacía' };
      // Normalizar igual que en el motor de voz — sin esto, los acentos
      // hacen que "café" guardada nunca matchee "cafe" dicho por voz.
      const palabraNorm = normalizarTexto(palabra);
      if (!palabraNorm) return { ok: false, error: 'La palabra no contiene caracteres válidos' };
      const db = await getDb();
      await db.runAsync(
        'INSERT OR IGNORE INTO palabras_clave (producto_id, palabra) VALUES (?, ?)',
        [productoId, palabraNorm]
      );
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async eliminarPalabraClave(id: number): Promise<Result<void>> {
    try {
      const db = await getDb();
      await db.runAsync('DELETE FROM palabras_clave WHERE id = ?', [id]);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async obtenerPalabrasClave(productoId: number): Promise<Result<PalabraClave[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<PalabraClave>(
        'SELECT * FROM palabras_clave WHERE producto_id = ? ORDER BY palabra ASC',
        [productoId]
      );
      return { ok: true, data: rows };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  // ─── Búsquedas avanzadas para el motor de voz ────────────────────────────

  /** Coincidencia exacta de palabra clave (ya viene normalizada del hook) */
  async buscarPorPalabraClaveExacta(palabra: string): Promise<Result<Producto[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT p.* FROM productos p
         INNER JOIN palabras_clave pc ON pc.producto_id = p.id
         WHERE p.activo = 1 AND pc.palabra = ?
         ORDER BY p.nombre ASC`,
        [palabra]
      );
      return { ok: true, data: rows.map(rowToProducto) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  /** Prefijo: "frijol" matchea "frijoles", "frijolito"  */
  async buscarPorPalabraClavePrefijo(prefijo: string): Promise<Result<Producto[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT p.* FROM productos p
         INNER JOIN palabras_clave pc ON pc.producto_id = p.id
         WHERE p.activo = 1 AND pc.palabra LIKE ?
         ORDER BY length(pc.palabra) ASC, p.nombre ASC`,
        [`${prefijo}%`]
      );
      return { ok: true, data: rows.map(rowToProducto) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  // ─── Vencimientos (C-03) ─────────────────────────────────────────────────

  /** Productos que vencen en los próximos N días, sin incluir vencidos */
  async obtenerPorVencer(diasAnticipacion = 30): Promise<Result<Array<Producto & { dias_para_vencer: number }>>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT *,
           CAST(julianday(fecha_vencimiento) - julianday('now') AS INTEGER) AS dias_para_vencer
         FROM productos
         WHERE activo = 1
           AND fecha_vencimiento IS NOT NULL
           AND julianday(fecha_vencimiento) - julianday('now') <= ?
           AND date(fecha_vencimiento) >= date('now')
         ORDER BY fecha_vencimiento ASC`,
        [diasAnticipacion]
      );
      return {
        ok: true,
        data: rows.map((row) => ({
          ...rowToProducto(row),
          dias_para_vencer: (row.dias_para_vencer as number) ?? 0,
        })),
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  /** Productos ya vencidos — siguen en inventario hasta que el admin los retire */
  async obtenerVencidos(): Promise<Result<Producto[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM productos
         WHERE activo = 1
           AND fecha_vencimiento IS NOT NULL
           AND date(fecha_vencimiento) < date('now')
         ORDER BY fecha_vencimiento ASC`
      );
      return { ok: true, data: rows.map(rowToProducto) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  // ─── Rentabilidad (C-01) ─────────────────────────────────────────────────

  /**
   * Ganancia bruta y margen promedio de los últimos N días.
   * Solo cuenta productos con precio_costo > 0 — los demás dan ganancia=precio
   * y distorsionan la métrica, por eso se reporta cuántos faltan.
   */
  async obtenerRentabilidad(dias = 30): Promise<Result<{
    ganancia_total: number;
    margen_promedio: number;
    productos_sin_costo: number;
  }>> {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{
        ganancia_total: number;
        margen_promedio: number;
        productos_sin_costo: number;
      }>(
        `SELECT
           COALESCE(SUM((dv.precio_unitario - COALESCE(p.precio_costo, 0)) * dv.cantidad), 0) AS ganancia_total,
           CASE
             WHEN SUM(dv.precio_unitario * dv.cantidad) > 0
             THEN ROUND(
               (SUM((dv.precio_unitario - COALESCE(p.precio_costo, 0)) * dv.cantidad) * 100.0)
               / SUM(dv.precio_unitario * dv.cantidad), 1
             )
             ELSE 0
           END AS margen_promedio,
           (SELECT COUNT(*) FROM productos WHERE activo = 1 AND precio_costo = 0) AS productos_sin_costo
         FROM detalle_ventas dv
         INNER JOIN ventas v ON v.id = dv.venta_id
         LEFT  JOIN productos p ON p.id = dv.producto_id
         WHERE v.estado = 'completada'
           AND date(v.creado_en) >= date('now', ?)`,
        [`-${dias} days`]
      );
      return { ok: true, data: row ?? { ganancia_total: 0, margen_promedio: 0, productos_sin_costo: 0 } };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
};

import { getDb } from '../db';
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
    stock: row.stock as number,
    stock_minimo: row.stock_minimo as number,
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

      const db = await getDb();
      const result = await db.runAsync(
        `INSERT INTO productos (nombre, codigo_barras, precio, stock, stock_minimo, categoria_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          dto.nombre.trim(),
          dto.codigo_barras ?? null,
          dto.precio,
          dto.stock,
          dto.stock_minimo,
          dto.categoria_id ?? null,
        ]
      );
      const created = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM productos WHERE id = ?',
        [result.lastInsertRowId]
      );
      return { ok: true, data: rowToProducto(created!) };
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
      return { ok: true, data: rowToProducto(updated) };
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
      const db = await getDb();
      await db.runAsync(
        'INSERT OR IGNORE INTO palabras_clave (producto_id, palabra) VALUES (?, ?)',
        [productoId, palabra.trim().toLowerCase()]
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
};

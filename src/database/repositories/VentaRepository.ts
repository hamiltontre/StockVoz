import { getDb } from '../db';
import type {
  Venta,
  DetalleVenta,
  VentaConDetalle,
  CrearVentaDTO,
  Result,
} from '../../types';

const NEGOCIO_ID = 1; // single-tenant v1

function rowToVenta(row: Record<string, unknown>): Venta {
  return {
    id: row.id as number,
    negocio_id: row.negocio_id as number,
    total: row.total as number,
    descuento: row.descuento as number,
    metodo_pago: row.metodo_pago as Venta['metodo_pago'],
    estado: row.estado as Venta['estado'],
    notas: (row.notas as string) ?? null,
    creado_en: row.creado_en as string,
  };
}

function rowToDetalle(row: Record<string, unknown>): DetalleVenta {
  return {
    id: row.id as number,
    venta_id: row.venta_id as number,
    producto_id: row.producto_id as number,
    nombre_producto: row.nombre_producto as string,
    cantidad: row.cantidad as number,
    precio_unitario: row.precio_unitario as number,
    subtotal: row.subtotal as number,
  };
}

export const VentaRepository = {
  async crear(dto: CrearVentaDTO): Promise<Result<VentaConDetalle>> {
    if (!dto.items.length) return { ok: false, error: 'El carrito está vacío' };
    if (dto.descuento < 0) return { ok: false, error: 'El descuento no puede ser negativo' };

    try {
      const db = await getDb();
      let ventaCreada: VentaConDetalle | null = null;

      await db.withTransactionAsync(async () => {
        const subtotalBruto = dto.items.reduce(
          (acc, item) => acc + item.producto.precio * item.cantidad,
          0
        );
        const total = Math.max(0, subtotalBruto - dto.descuento);

        const ventaResult = await db.runAsync(
          `INSERT INTO ventas (negocio_id, total, descuento, metodo_pago, notas)
           VALUES (?, ?, ?, ?, ?)`,
          [NEGOCIO_ID, total, dto.descuento, dto.metodo_pago, dto.notas ?? null]
        );
        const ventaId = ventaResult.lastInsertRowId;

        const detalles: DetalleVenta[] = [];

        for (const item of dto.items) {
          // Verificar stock dentro de la transacción
          const stockRow = await db.getFirstAsync<{ stock: number }>(
            'SELECT stock FROM productos WHERE id = ? AND activo = 1',
            [item.producto.id]
          );

          if (!stockRow) throw new Error(`Producto ${item.producto.nombre} no disponible`);
          if (stockRow.stock < item.cantidad) {
            throw new Error(
              `Stock insuficiente para ${item.producto.nombre}. Disponible: ${stockRow.stock}`
            );
          }

          const subtotal = item.producto.precio * item.cantidad;
          const detalleResult = await db.runAsync(
            `INSERT INTO detalle_ventas (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ventaId, item.producto.id, item.producto.nombre, item.cantidad, item.producto.precio, subtotal]
          );

          // Descontar stock
          await db.runAsync(
            "UPDATE productos SET stock = stock - ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
            [item.cantidad, item.producto.id]
          );

          detalles.push({
            id: detalleResult.lastInsertRowId,
            venta_id: ventaId,
            producto_id: item.producto.id,
            nombre_producto: item.producto.nombre,
            cantidad: item.cantidad,
            precio_unitario: item.producto.precio,
            subtotal,
          });
        }

        const ventaRow = await db.getFirstAsync<Record<string, unknown>>(
          'SELECT * FROM ventas WHERE id = ?',
          [ventaId]
        );
        ventaCreada = { ...rowToVenta(ventaRow!), items: detalles };
      });

      return { ok: true, data: ventaCreada! };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async anular(id: number): Promise<Result<void>> {
    try {
      const db = await getDb();

      await db.withTransactionAsync(async () => {
        const venta = await db.getFirstAsync<{ estado: string }>(
          'SELECT estado FROM ventas WHERE id = ?',
          [id]
        );
        if (!venta) throw new Error('Venta no encontrada');
        if (venta.estado === 'anulada') throw new Error('La venta ya está anulada');

        const detalles = await db.getAllAsync<{ producto_id: number; cantidad: number }>(
          'SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = ?',
          [id]
        );

        // Revertir stock
        for (const d of detalles) {
          await db.runAsync(
            "UPDATE productos SET stock = stock + ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
            [d.cantidad, d.producto_id]
          );
        }

        await db.runAsync(
          "UPDATE ventas SET estado = 'anulada' WHERE id = ?",
          [id]
        );
      });

      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async obtenerRecientes(limite = 50): Promise<Result<Venta[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM ventas ORDER BY creado_en DESC LIMIT ?',
        [limite]
      );
      return { ok: true, data: rows.map(rowToVenta) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async obtenerConDetalle(id: number): Promise<Result<VentaConDetalle | null>> {
    try {
      const db = await getDb();
      const ventaRow = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM ventas WHERE id = ?',
        [id]
      );
      if (!ventaRow) return { ok: true, data: null };

      const detalleRows = await db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM detalle_ventas WHERE venta_id = ?',
        [id]
      );
      return {
        ok: true,
        data: { ...rowToVenta(ventaRow), items: detalleRows.map(rowToDetalle) },
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async resumenHoy(): Promise<Result<{ total_ventas: number; total_monto: number }>> {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ total_ventas: number; total_monto: number }>(
        `SELECT COUNT(*) as total_ventas, COALESCE(SUM(total),0) as total_monto
         FROM ventas
         WHERE estado = 'completada'
           AND date(creado_en) = date('now')`
      );
      return { ok: true, data: row! };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
};

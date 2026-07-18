import { getDb } from '../db';
import { SyncRepository } from './SyncRepository';
import { ConfigRepository, CLAVES } from './ConfigRepository';
import { bus, EVENTOS } from '../../utils/eventos';
import { calcularSubtotalLinea } from '../../utils/cantidad';
import type {
  Venta,
  DetalleVenta,
  VentaConDetalle,
  CrearVentaDTO,
  FiadorResumen,
  Result,
} from '../../types';

// Preparación multi-tenant: el id real viene de la config (asignado al
// vincular con la nube); 1 es el fallback para instalaciones offline puras.
async function obtenerNegocioId(): Promise<number> {
  const valor = await ConfigRepository.obtener(CLAVES.NEGOCIO_REMOTO_ID);
  const id = valor ? parseInt(valor, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : 1;
}

function rowToVenta(row: Record<string, unknown>): Venta {
  return {
    id: row.id as number,
    negocio_id: row.negocio_id as number,
    total: row.total as number,
    descuento: row.descuento as number,
    metodo_pago: row.metodo_pago as Venta['metodo_pago'],
    estado: row.estado as Venta['estado'],
    notas: (row.notas as string) ?? null,
    es_fiado: (row.es_fiado as number) === 1,
    fiador_nombre: (row.fiador_nombre as string) ?? null,
    fiado_pagado_en: (row.fiado_pagado_en as string) ?? null,
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
    const fiador = dto.fiador?.trim() || null;

    try {
      const negocioId = await obtenerNegocioId();
      const db = await getDb();
      let ventaCreada: VentaConDetalle | null = null;

      await db.runAsync('BEGIN');
      try {
        const subtotalBruto = dto.items.reduce(
          (acc, item) => acc + calcularSubtotalLinea(item.producto, item.cantidad),
          0
        );
        const total = Math.max(0, subtotalBruto - dto.descuento);

        const ventaResult = await db.runAsync(
          `INSERT INTO ventas (negocio_id, total, descuento, metodo_pago, notas, es_fiado, fiador_nombre)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [negocioId, total, dto.descuento, dto.metodo_pago, dto.notas ?? null,
           fiador ? 1 : 0, fiador]
        );
        const ventaId = ventaResult.lastInsertRowId;

        const detalles: DetalleVenta[] = [];

        for (const item of dto.items) {
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

          const subtotal = calcularSubtotalLinea(item.producto, item.cantidad);
          const detalleResult = await db.runAsync(
            `INSERT INTO detalle_ventas (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ventaId, item.producto.id, item.producto.nombre, item.cantidad, item.producto.precio, subtotal]
          );

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
        await db.runAsync('COMMIT');
      } catch (inner) {
        try { await db.runAsync('ROLLBACK'); } catch {}
        throw inner;
      }

      // Encolar para sincronización (fire-and-forget, no bloquea la venta)
      if (ventaCreada) {
        SyncRepository.encolar('ventas', 'INSERT', ventaCreada).catch(() => {
          // Si falla encolar, la venta ya está guardada localmente — no es crítico
        });
        bus.emit(EVENTOS.VENTA_CREADA);
        bus.emit(EVENTOS.STOCK_CAMBIO);
      }

      return { ok: true, data: ventaCreada! };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async anular(id: number): Promise<Result<void>> {
    try {
      const db = await getDb();

      await db.runAsync('BEGIN');
      try {
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
        await db.runAsync('COMMIT');
      } catch (inner) {
        try { await db.runAsync('ROLLBACK'); } catch {}
        throw inner;
      }

      bus.emit(EVENTOS.STOCK_CAMBIO);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  // ─── Fiados (el "cuaderno" de ventas al crédito) ─────────────────────────

  /**
   * Deuda pendiente agrupada por persona, como el cuaderno de la pulpería:
   * "Doña María — C$450 (3 ventas, la más vieja hace 12 días)".
   * Agrupa sin distinguir mayúsculas para que "maría" y "María" sean la misma.
   */
  async fiadosPendientes(): Promise<Result<FiadorResumen[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<FiadorResumen>(
        `SELECT
           fiador_nombre,
           SUM(total) AS total_deuda,
           COUNT(*) AS cantidad_ventas,
           CAST(julianday('now') - julianday(MIN(creado_en)) AS INTEGER) AS dias_deuda_mas_vieja
         FROM ventas
         WHERE es_fiado = 1
           AND fiado_pagado_en IS NULL
           AND estado = 'completada'
           AND fiador_nombre IS NOT NULL
         GROUP BY fiador_nombre COLLATE NOCASE
         ORDER BY total_deuda DESC`
      );
      return { ok: true, data: rows };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  /**
   * Marca como pagadas TODAS las ventas fiadas pendientes de una persona
   * (el caso típico: llega y paga su cuenta completa).
   * Devuelve cuántas ventas se saldaron.
   */
  async marcarFiadorPagado(fiadorNombre: string): Promise<Result<number>> {
    try {
      const db = await getDb();
      const result = await db.runAsync(
        `UPDATE ventas
         SET fiado_pagado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE es_fiado = 1
           AND fiado_pagado_en IS NULL
           AND estado = 'completada'
           AND fiador_nombre = ? COLLATE NOCASE`,
        [fiadorNombre]
      );
      bus.emit(EVENTOS.FIADO_CAMBIO);
      return { ok: true, data: result.changes };
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

  async resumenPeriodo(dias: number): Promise<Result<{
    total_ventas: number;
    total_monto: number;
    promedio_venta: number;
    total_anuladas: number;
  }>> {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{
        total_ventas: number; total_monto: number;
        promedio_venta: number; total_anuladas: number;
      }>(
        `SELECT
           SUM(CASE WHEN estado='completada' THEN 1 ELSE 0 END) as total_ventas,
           COALESCE(SUM(CASE WHEN estado='completada' THEN total ELSE 0 END),0) as total_monto,
           COALESCE(AVG(CASE WHEN estado='completada' THEN total END),0) as promedio_venta,
           SUM(CASE WHEN estado='anulada' THEN 1 ELSE 0 END) as total_anuladas
         FROM ventas
         WHERE date(creado_en) >= date('now', ?)`,
        [`-${dias} days`]
      );
      return { ok: true, data: row! };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async ventasPorDia(dias: number): Promise<Result<Array<{
    fecha: string; total_ventas: number; total_monto: number;
  }>>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<{
        fecha: string; total_ventas: number; total_monto: number;
      }>(
        `SELECT
           date(creado_en) as fecha,
           COUNT(*) as total_ventas,
           COALESCE(SUM(total),0) as total_monto
         FROM ventas
         WHERE estado = 'completada'
           AND date(creado_en) >= date('now', ?)
         GROUP BY date(creado_en)
         ORDER BY fecha DESC`,
        [`-${dias} days`]
      );
      return { ok: true, data: rows };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async productosMasVendidos(limite = 5): Promise<Result<Array<{
    nombre_producto: string; total_cantidad: number; total_monto: number;
  }>>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<{
        nombre_producto: string; total_cantidad: number; total_monto: number;
      }>(
        `SELECT
           dv.nombre_producto,
           SUM(dv.cantidad) as total_cantidad,
           SUM(dv.subtotal) as total_monto
         FROM detalle_ventas dv
         INNER JOIN ventas v ON v.id = dv.venta_id
         WHERE v.estado = 'completada'
         GROUP BY dv.nombre_producto
         ORDER BY total_cantidad DESC
         LIMIT ?`,
        [limite]
      );
      return { ok: true, data: rows };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async ventasPorMetodoPago(): Promise<Result<Array<{
    metodo_pago: string; total_ventas: number; total_monto: number;
  }>>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<{
        metodo_pago: string; total_ventas: number; total_monto: number;
      }>(
        `SELECT
           metodo_pago,
           COUNT(*) as total_ventas,
           COALESCE(SUM(total),0) as total_monto
         FROM ventas
         WHERE estado = 'completada'
           AND date(creado_en) >= date('now', '-30 days')
         GROUP BY metodo_pago
         ORDER BY total_monto DESC`
      );
      return { ok: true, data: rows };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
};

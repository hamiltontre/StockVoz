import { getDb } from '../database/db';
import { centavosACordobas } from './money';
import { formatearCantidadConUnidad, formatearCantidad } from './cantidad';
import type { UnidadProducto } from '../types';

/**
 * Respaldo del negocio en texto — pensado para enviarse por WhatsApp al
 * propio dueño.
 *
 * Por qué texto y no un archivo: el dueño lo recibe en su chat, queda en la
 * nube de WhatsApp y lo puede leer desde cualquier teléfono aunque pierda
 * este. No es una restauración automática (habría que recapturar), pero
 * protege lo que cuesta horas rehacer: el inventario y quién le debe.
 *
 * El respaldo AUTOMÁTICO e invisible lo hace Android Auto Backup a la
 * cuenta de Google del dueño (allowBackup=true); esto es el respaldo que
 * él puede ver y guardar por su cuenta.
 */

/** Prioriza lo que duele perder: inventario (horas de captura) y deudas (plata). */
export async function generarRespaldo(): Promise<string> {
  const db = await getDb();

  const negocio = await db.getFirstAsync<{ nombre: string }>(
    'SELECT nombre FROM negocios WHERE id = 1'
  );
  const fecha = new Date().toLocaleString('es-NI', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const lineas: string[] = [];
  lineas.push(`*RESPALDO — ${negocio?.nombre ?? 'Mi Negocio'}*`);
  lineas.push(`${fecha}`);
  lineas.push('');

  // ── Inventario: lo que más cuesta rehacer ──
  const productos = await db.getAllAsync<{
    nombre: string; precio: number; precio_costo: number; precio_docena: number;
    stock: number; unidad: string; fecha_vencimiento: string | null;
  }>(
    `SELECT nombre, precio, precio_costo, precio_docena, stock, unidad, fecha_vencimiento
     FROM productos WHERE activo = 1 ORDER BY nombre ASC`
  );

  lineas.push(`*INVENTARIO (${productos.length} productos)*`);
  for (const p of productos) {
    const partes = [
      `• ${p.nombre}`,
      `${centavosACordobas(p.precio)}`,
    ];
    if (p.precio_costo > 0) partes.push(`costo ${centavosACordobas(p.precio_costo)}`);
    if (p.precio_docena > 0) partes.push(`docena ${centavosACordobas(p.precio_docena)}`);
    partes.push(formatearCantidadConUnidad(p.stock, p.unidad as UnidadProducto));
    if (p.fecha_vencimiento) {
      const [y, m, d] = p.fecha_vencimiento.split('-');
      partes.push(`vence ${d}/${m}/${y}`);
    }
    lineas.push(partes.join(' | '));
  }
  lineas.push('');

  // ── Fiados pendientes: plata que le deben ──
  const fiados = await db.getAllAsync<{
    fiador_nombre: string; total: number; creado_en: string;
  }>(
    `SELECT fiador_nombre, SUM(total) AS total, MIN(creado_en) AS creado_en
     FROM ventas
     WHERE es_fiado = 1 AND fiado_pagado_en IS NULL AND estado = 'completada'
     GROUP BY fiador_nombre COLLATE NOCASE
     ORDER BY total DESC`
  );
  if (fiados.length > 0) {
    const totalFiado = fiados.reduce((a, f) => a + f.total, 0);
    lineas.push(`*FIADOS PENDIENTES — ${centavosACordobas(totalFiado)}*`);
    for (const f of fiados) {
      const desde = new Date(f.creado_en).toLocaleDateString('es-NI');
      lineas.push(`• ${f.fiador_nombre}: ${centavosACordobas(f.total)} (desde ${desde})`);
    }
    lineas.push('');
  }

  // ── Resumen de ventas del último mes ──
  const resumen = await db.getFirstAsync<{
    cantidad: number; monto: number;
  }>(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS monto
     FROM ventas
     WHERE estado = 'completada' AND date(creado_en) >= date('now','-30 days')`
  );
  lineas.push('*VENTAS (últimos 30 días)*');
  lineas.push(
    `${resumen?.cantidad ?? 0} ventas · ${centavosACordobas(resumen?.monto ?? 0)}`
  );
  lineas.push('');
  lineas.push('_Generado por StockVoz_');

  return lineas.join('\n');
}


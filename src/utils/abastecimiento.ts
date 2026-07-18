/**
 * Lista de compras sugerida — módulo PURO (sin react-native, testeable en Node).
 *
 * Modelo de punto de reorden explicable, sin cajas negras:
 *   1. Velocidad de venta = unidades vendidas en la ventana ÷ días observados.
 *   2. Días de stock = stock actual ÷ velocidad.
 *   3. Si los días de stock caen bajo el umbral (o el stock bajo el mínimo),
 *      se sugiere comprar lo necesario para cubrir COBERTURA_DIAS de venta.
 *
 * El dueño siempre puede entender POR QUÉ se le sugiere cada compra — esa
 * transparencia vale más que un modelo opaco, y funciona 100% offline.
 */
import type { UnidadProducto } from '../types';
import { UNIDADES_FRACCIONABLES } from './cantidad';

/** Ventana de historial que se observa para medir velocidad de venta. */
export const VENTANA_DIAS = 14;
/** Se dispara la sugerencia cuando queda stock para menos de estos días. */
export const UMBRAL_DIAS = 7;
/** La compra sugerida busca cubrir estos días de venta. */
export const COBERTURA_DIAS = 14;
/** Con menos días de historial que esto, la sugerencia se marca "aprendiendo". */
export const DIAS_CONFIANZA = 7;

export interface DatosAbastecimiento {
  id: number;
  nombre: string;
  stock: number;
  stock_minimo: number;
  unidad: UnidadProducto;
  precio_costo: number;   // centavos; 0 = desconocido
  precio_docena: number;  // centavos; 0 = no aplica
  /** Unidades vendidas en los últimos VENTANA_DIAS (ventas completadas). */
  vendido_ventana: number;
  /** Días desde la primera venta del producto; null = nunca se ha vendido. */
  dias_desde_primera_venta: number | null;
}

export type MotivoCompra = 'agotado' | 'por_agotarse' | 'stock_minimo';

export interface SugerenciaCompra {
  id: number;
  nombre: string;
  unidad: UnidadProducto;
  cantidadSugerida: number;
  /** Días de venta que cubre el stock actual; null = sin ventas para estimar. */
  diasDeStock: number | null;
  /** Unidades vendidas por día (promedio de la ventana observada). */
  velocidadDiaria: number;
  /** Costo de la compra sugerida en centavos; 0 si no hay precio de costo. */
  costoEstimado: number;
  motivo: MotivoCompra;
  /** 'aprendiendo' = poco historial; la cantidad es tentativa. */
  confianza: 'alta' | 'aprendiendo';
}

/**
 * Redondea la cantidad sugerida hacia ARRIBA al paso natural del producto:
 * - con precio por docena → múltiplos de media docena (6)
 * - unidades fraccionables (libra/litro/…) → múltiplos de 0.5
 * - resto → enteros
 */
function redondearCantidad(
  cantidad: number,
  unidad: UnidadProducto,
  tienePrecioDocena: boolean
): number {
  if (tienePrecioDocena && unidad === 'unidad') {
    return Math.max(6, Math.ceil(cantidad / 6) * 6);
  }
  if (UNIDADES_FRACCIONABLES.has(unidad)) {
    return Math.max(0.5, Math.ceil(cantidad * 2) / 2);
  }
  return Math.max(1, Math.ceil(cantidad));
}

/** Evalúa UN producto; null = no hace falta comprarlo todavía. */
export function evaluarProducto(p: DatosAbastecimiento): SugerenciaCompra | null {
  // Días realmente observados: si el producto empezó a venderse hace 4 días,
  // dividir entre 4 (no entre 14) para no subestimar su velocidad real.
  const diasObservados =
    p.dias_desde_primera_venta === null
      ? null
      : Math.max(1, Math.min(VENTANA_DIAS, p.dias_desde_primera_venta));

  const velocidad =
    diasObservados !== null && p.vendido_ventana > 0
      ? p.vendido_ventana / diasObservados
      : 0;

  const diasDeStock = velocidad > 0 ? p.stock / velocidad : null;

  let motivo: MotivoCompra | null = null;
  if (p.stock <= 0 && (velocidad > 0 || p.stock_minimo > 0)) {
    motivo = 'agotado';
  } else if (diasDeStock !== null && diasDeStock < UMBRAL_DIAS) {
    motivo = 'por_agotarse';
  } else if (p.stock_minimo > 0 && p.stock <= p.stock_minimo) {
    motivo = 'stock_minimo';
  }
  if (!motivo) return null;

  // Cantidad objetivo: cubrir COBERTURA_DIAS de venta. Sin velocidad medible
  // (producto que aún no rota), reponer hasta 2× el stock mínimo — heurística
  // conservadora y explicable.
  const objetivo =
    velocidad > 0 ? velocidad * COBERTURA_DIAS : Math.max(p.stock_minimo * 2, 1);
  const faltante = objetivo - p.stock;
  if (faltante <= 0) return null;

  const cantidadSugerida = redondearCantidad(
    faltante,
    p.unidad,
    p.precio_docena > 0
  );

  // Costo estimado: por docenas cuando aplica (así se compra), si no por unidad.
  let costoEstimado = 0;
  if (p.precio_costo > 0) {
    costoEstimado = Math.round(p.precio_costo * cantidadSugerida);
  }

  return {
    id: p.id,
    nombre: p.nombre,
    unidad: p.unidad,
    cantidadSugerida,
    diasDeStock: diasDeStock !== null ? Math.round(diasDeStock * 10) / 10 : null,
    velocidadDiaria: Math.round(velocidad * 100) / 100,
    costoEstimado,
    motivo,
    confianza:
      p.dias_desde_primera_venta !== null &&
      p.dias_desde_primera_venta >= DIAS_CONFIANZA
        ? 'alta'
        : 'aprendiendo',
  };
}

/**
 * Genera la lista de compras completa, ordenada por urgencia:
 * agotados primero, luego por días de stock restantes (ascendente).
 */
export function generarListaCompras(
  productos: DatosAbastecimiento[]
): { sugerencias: SugerenciaCompra[]; costoTotal: number } {
  const sugerencias = productos
    .map(evaluarProducto)
    .filter((s): s is SugerenciaCompra => s !== null)
    .sort((a, b) => {
      const rango = (m: MotivoCompra) => (m === 'agotado' ? 0 : m === 'por_agotarse' ? 1 : 2);
      if (rango(a.motivo) !== rango(b.motivo)) return rango(a.motivo) - rango(b.motivo);
      return (a.diasDeStock ?? Infinity) - (b.diasDeStock ?? Infinity);
    });

  const costoTotal = sugerencias.reduce((acc, s) => acc + s.costoEstimado, 0);
  return { sugerencias, costoTotal };
}

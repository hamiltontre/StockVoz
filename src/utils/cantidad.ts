import type { Producto, UnidadProducto } from '../types';

/**
 * Unidades que admiten cantidades fraccionarias (media libra = 0.5).
 * unidad/caja/par/paquete se venden solo en enteros.
 */
export const UNIDADES_FRACCIONABLES: ReadonlySet<UnidadProducto> = new Set([
  'libra', 'litro', 'metro', 'docena',
] as UnidadProducto[]);

/** Paso del stepper de cantidad en el carrito: ±0.5 para fraccionables, ±1 resto. */
export function pasoCantidad(unidad: UnidadProducto): number {
  return UNIDADES_FRACCIONABLES.has(unidad) ? 0.5 : 1;
}

/** Abreviatura corta de la unidad para mostrar junto a la cantidad. */
export function abreviaturaUnidad(unidad: UnidadProducto): string {
  switch (unidad) {
    case 'libra': return 'lb';
    case 'litro': return 'L';
    case 'metro': return 'm';
    case 'docena': return 'doc';
    case 'caja': return 'caja';
    case 'par': return 'par';
    case 'paquete': return 'paq';
    default: return 'ud';
  }
}

/**
 * Formatea una cantidad para display: 0.5 → "½", 1.5 → "1½", 2 → "2".
 * Otras fracciones (raras, no las genera la app) se muestran con decimales.
 */
export function formatearCantidad(cantidad: number): string {
  const entero = Math.floor(cantidad);
  const fraccion = cantidad - entero;
  if (fraccion === 0) return String(entero);
  if (fraccion === 0.5) return entero === 0 ? '½' : `${entero}½`;
  return String(cantidad);
}

/** "1½ lb", "2 doc", "3 ud" — cantidad + abreviatura de unidad. */
export function formatearCantidadConUnidad(cantidad: number, unidad: UnidadProducto): string {
  return `${formatearCantidad(cantidad)} ${abreviaturaUnidad(unidad)}`;
}

/**
 * Subtotal de una línea de venta en centavos, aplicando precio por docena.
 *
 * Si el producto tiene precio_docena (> 0) y su stock se cuenta por unidad,
 * la cantidad se descompone en el mejor precio para el cliente:
 *   docenas completas × precio_docena
 * + medias docenas    × precio_docena / 2
 * + unidades sueltas  × precio unitario
 *
 * Ej: clavos a C$5 c/u y C$50 la docena; 14 clavos =
 *     1 docena (C$50) + 2 sueltos (C$10) = C$60 (no C$70).
 *
 * Para productos sin precio_docena (o vendidos por peso/volumen) es
 * simplemente precio × cantidad, redondeado a centavo.
 */
export function calcularSubtotalLinea(
  producto: Pick<Producto, 'precio' | 'precio_docena' | 'unidad'>,
  cantidad: number
): number {
  if (
    producto.precio_docena > 0 &&
    producto.unidad === 'unidad' &&
    cantidad >= 6
  ) {
    const docenas = Math.floor(cantidad / 12);
    let resto = cantidad - docenas * 12;
    const mediasDocenas = Math.floor(resto / 6);
    resto -= mediasDocenas * 6;
    return (
      docenas * producto.precio_docena +
      mediasDocenas * Math.round(producto.precio_docena / 2) +
      Math.round(resto * producto.precio)
    );
  }
  return Math.round(cantidad * producto.precio);
}

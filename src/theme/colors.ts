/**
 * Paleta de colores oficial de StockVoz.
 * Fuente única de verdad — todas las pantallas importan de aquí.
 */
export const COLORES = {
  fondo: '#0f172a',
  tarjeta: '#1e293b',
  borde: '#334155',
  texto: '#f1f5f9',
  subtexto: '#94a3b8',
  acento: '#38bdf8',
  verde: '#4ade80',
  rojo: '#f87171',
  amarillo: '#fbbf24',
} as const;

export type ColorToken = keyof typeof COLORES;

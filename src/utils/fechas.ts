/** Helpers de fecha — módulo PURO (sin base de datos, testeable en Node). */

/**
 * Días completos transcurridos desde una fecha ISO.
 * Devuelve null si nunca ocurrió, si la fecha es inválida, o si está en el
 * futuro (reloj del teléfono mal puesto) — en esos casos el llamador debe
 * tratarlo como "sin dato", nunca como "recién hecho".
 */
export function diasDesde(isoFecha: string | null): number | null {
  if (!isoFecha) return null;
  const t = new Date(isoFecha).getTime();
  if (!Number.isFinite(t)) return null;
  const ms = Date.now() - t;
  if (ms < 0) return null;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

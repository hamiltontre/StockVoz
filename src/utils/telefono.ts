/**
 * Normalización de teléfonos nicaragüenses — módulo PURO (testeable en Node).
 *
 * De esta función depende que el dueño recupere el acceso a su negocio, así
 * que tiene que tolerar TODAS las formas en que la gente escribe su número:
 * "8888-7777", "+505 8888 7777", "(505) 88887777" son el mismo teléfono.
 */

/** Deja solo dígitos y quita el código de país 505 (Nicaragua). */
export function normalizarTelefono(tel?: string | null): string {
  if (!tel) return '';
  const soloDigitos = tel.replace(/\D/g, '');
  return soloDigitos.startsWith('505') && soloDigitos.length > 8
    ? soloDigitos.slice(3)
    : soloDigitos;
}

/** ¿Son el mismo número, escritos de cualquier forma? */
export function mismoTelefono(a?: string | null, b?: string | null): boolean {
  const na = normalizarTelefono(a);
  const nb = normalizarTelefono(b);
  // Nunca dar por válida una comparación de vacíos: sin teléfono
  // registrado no debe poder recuperarse el PIN.
  return na.length >= 8 && na === nb;
}

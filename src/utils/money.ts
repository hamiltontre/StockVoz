// Toda la app almacena precios en centavos (enteros) para evitar errores de punto flotante.
// Estas utilidades convierten entre centavos y valores de display.

export function centavosACordobas(centavos: number): string {
  return `C$ ${(centavos / 100).toFixed(2)}`;
}

export function cordobasACentavos(valor: number): number {
  return Math.round(valor * 100);
}

export function centavosADolares(centavos: number): string {
  return `$ ${(centavos / 100).toFixed(2)}`;
}

export function formatearMoneda(centavos: number, moneda: 'NIO' | 'USD'): string {
  return moneda === 'NIO' ? centavosACordobas(centavos) : centavosADolares(centavos);
}

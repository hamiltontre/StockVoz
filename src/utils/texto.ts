/**
 * Normalización de texto para búsquedas robustas en español nicaragüense.
 * - minúsculas
 * - sin acentos (café → cafe)
 * - sin signos de puntuación
 * - trim
 *
 * Se usa tanto al guardar palabras clave como al procesar voz, garantizando
 * que ambos lados usen exactamente la misma forma normalizada.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tildes y diéresis
    // Los símbolos se vuelven ESPACIO, no se borran: el reconocedor escribe
    // "coca-cola" y al borrar el guion quedaba "cocacola" pegado, que ya no
    // coincidía con el producto "Coca Cola". Separar es siempre más seguro.
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

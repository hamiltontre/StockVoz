/**
 * Parser de transcripciones de voz — módulo PURO (sin react-native) para
 * poder probarlo en Node y mantener useVoz enfocado en la sesión de audio.
 */
import { normalizarTexto } from './texto';

// ─── Números en texto ────────────────────────────────────────────────────────
export const NUMEROS_TEXTO: Record<string, number> = {
  un: 1, uno: 1, una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  quince: 15,
  veinte: 20,
  veintiuno: 21,
  veinticinco: 25,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  cien: 100,
};

// Palabras que NO son producto (artículos, preposiciones, muletillas).
// Ya normalizadas: sin acentos, minúsculas.
const PALABRAS_IGNORAR = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'me', 'da', 'dame', 'quiero', 'necesito', 'pon', 'agrega', 'vende', 'vendeme',
  'porfavor', 'por', 'favor', 'gracias', 'y', 'con', 'sin',
  'del', 'al', 'que', 'mas', 'tambien',
]);

// Palabras de unidad de medida: no son nombre de producto, y dichas sin
// cantidad previa implican 1 ("libra de arroz" = 1 libra). La unidad REAL
// con que se descuenta stock la define el producto, no lo dicho.
// OJO: 'docena(s)' NO va aquí — tiene manejo propio (multiplica ×12).
const PALABRAS_UNIDAD = new Set([
  'libra', 'libras', 'litro', 'litros', 'kilo', 'kilos',
  'metro', 'metros', 'paquete', 'paquetes',
  'unidad', 'unidades', 'bolsa', 'bolsas',
  'caja', 'cajas', 'par', 'pares',
]);

export interface SegmentoVoz {
  cantidad: number;
  palabras: string[];
  enDocenas: boolean;
}

/**
 * Extrae cantidad y palabras candidatas de la transcripción (UN producto).
 * Ejemplos:
 *   "dos pastillas de paracetamol" → { cantidad: 2, palabras: ['pastillas','paracetamol'] }
 *   "3 coca cola"                  → { cantidad: 3, palabras: ['coca','cola'] }
 *   "un jabón"                     → { cantidad: 1, palabras: ['jabon'] }
 */
export function parsearTranscripcion(transcripcion: string): { cantidad: number; palabras: string[] } {
  const tokens = normalizarTexto(transcripcion).split(/\s+/).filter(Boolean);

  let cantidad = 1;
  let cantidadEncontrada = false;
  const palabras: string[] = [];

  for (const token of tokens) {
    if (!cantidadEncontrada) {
      const numDigito = parseInt(token, 10);
      if (!isNaN(numDigito) && numDigito > 0 && numDigito <= 999) {
        cantidad = numDigito;
        cantidadEncontrada = true;
        continue;
      }
      // "un"/"una" también son artículos — solo cuentan como cantidad
      // la primera vez, después se ignoran como artículo.
      if (NUMEROS_TEXTO[token]) {
        cantidad = NUMEROS_TEXTO[token];
        cantidadEncontrada = true;
        continue;
      }
    }
    if (PALABRAS_IGNORAR.has(token)) continue;
    if (token.length < 2) continue;
    palabras.push(token);
  }

  return { cantidad, palabras };
}

/**
 * Parsea una transcripción con VARIOS productos en una lista hablada.
 * La cantidad puede ir antes o después del nombre; los números actúan como
 * separadores entre productos. Soporta fracciones ("media libra",
 * "libra y media") y docenas ("media docena de clavos").
 *
 * Ejemplos:
 *   "cinco maruchan seis platano"  → [{5,maruchan},{6,platano}]
 *   "dos coca cola tres fanta"     → [{2,[coca,cola]},{3,[fanta]}]
 *   "media libra de arroz"         → [{0.5,[arroz]}]
 *   "docena y media de tornillos"  → [{1.5,[tornillos],enDocenas}]
 */
export function parsearMultiplesProductos(transcripcion: string): SegmentoVoz[] {
  const tokens = normalizarTexto(transcripcion).split(/\s+/).filter(Boolean);
  const segmentos: SegmentoVoz[] = [];

  let curWords: string[] = [];
  let curQty: number | null = null;
  let curDocena = false;
  let pendingQty: number | null = null;
  let pendingDocena = false;

  const valorNumero = (token: string): number | null => {
    const d = parseInt(token, 10);
    if (!isNaN(d) && d > 0 && d <= 999) return d;
    if (NUMEROS_TEXTO[token]) return NUMEROS_TEXTO[token];
    return null;
  };

  const emitir = () => {
    if (curWords.length > 0) {
      segmentos.push({ cantidad: curQty ?? 1, palabras: curWords, enDocenas: curDocena });
    }
    curWords = [];
    curQty = null;
    curDocena = false;
  };

  for (const token of tokens) {
    // "media"/"medio" = fracción 0.5. Solo el SINGULAR cuenta como fracción:
    // "medias" (plural) puede ser producto (calcetines en Nicaragua).
    // Casos: "media libra de arroz" → 0.5; "libra y media" → 1+0.5 = 1.5;
    //        "dos libras y media" → 2.5; "docena y media" → 1.5 docenas.
    if (token === 'media' || token === 'medio') {
      if (curWords.length === 0) {
        pendingQty = (pendingQty ?? 0) + 0.5;
      } else if (curQty == null) {
        // patrón sufijo poco común ("arroz media") → cantidad 0.5
        curQty = 0.5;
        emitir();
      }
      continue;
    }

    // "docena(s)": la cantidad está dicha en docenas. El flag viaja con el
    // segmento; la conversión a unidades (×12) se decide al agregar al
    // carrito según la unidad del producto.
    if (token === 'docena' || token === 'docenas') {
      if (curWords.length === 0) {
        if (pendingQty == null) pendingQty = 1; // "docena de clavos" = 1 docena
        pendingDocena = true;
      } else {
        curDocena = true;
      }
      continue;
    }

    // Unidades de medida: no son producto; sin cantidad previa implican 1
    // ("libra de arroz" = 1 libra, para que "y media" luego sume 1.5).
    if (PALABRAS_UNIDAD.has(token)) {
      if (curWords.length === 0 && pendingQty == null) pendingQty = 1;
      continue;
    }

    const n = valorNumero(token);
    if (n !== null) {
      if (curWords.length > 0) {
        if (curQty == null) {
          // patrón "nombre cantidad" → cierra este producto con n
          curQty = n;
          emitir();
        } else {
          // este producto ya tenía cantidad (patrón "cantidad nombre");
          // n pertenece al SIGUIENTE producto
          emitir();
          pendingQty = n;
        }
      } else {
        pendingQty = n;
      }
      continue;
    }
    if (PALABRAS_IGNORAR.has(token)) continue;
    if (token.length < 2) continue;
    // palabra de producto: al abrir el segmento captura cantidad y flag
    // de docena pendientes
    if (curWords.length === 0) {
      if (pendingQty != null) { curQty = pendingQty; pendingQty = null; }
      curDocena = pendingDocena;
      pendingDocena = false;
    }
    curWords.push(token);
  }
  emitir();
  return segmentos;
}

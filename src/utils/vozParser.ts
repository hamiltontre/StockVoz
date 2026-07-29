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
  // Pronombres que aparecen cuando el reconocedor falla ("6"→"se") y que
  // nunca son un producto: si se cuelan, ensucian la búsqueda.
  'se', 'le', 'lo', 'te', 'me', 'es', 'esta', 'este',
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

/**
 * Unidades de CONTENIDO del envase: cuando un número va seguido de una de
 * estas y ya se venía nombrando un producto, ese número es parte del
 * NOMBRE, no una cantidad nueva.
 * "tres fanta naranja 12 onzas" = 3 Fanta de 12 onzas — no 3 fantas + 12
 * de otra cosa (ese error sumaba 15 unidades al carrito).
 */
const PALABRAS_CONTENIDO = new Set([
  'onza', 'onzas', 'oz',
  'ml', 'mililitro', 'mililitros', 'cc',
  'gramo', 'gramos', 'gr', 'grs',
]);
// OJO: libra/kilo/litro NO van aquí. En una pulpería son la cantidad que
// se está comprando ("3 libras de arroz"), no la descripción del envase.
// Incluirlas hacía que "6 café presto 3 libras y media de arroz" se
// tragara el arroz dentro del nombre del café.

export interface SegmentoVoz {
  cantidad: number;
  palabras: string[];
  enDocenas: boolean;
}

// ─── Selección por nombre: "lo dicho manda" ─────────────────────────────────

/**
 * ¿La palabra dicha corresponde a una palabra del nombre?
 * Tolera plurales en ambas direcciones: pierna↔piernas, frijol↔frijoles.
 * El límite de 2 caracteres evita falsos positivos (pan ≠ panela).
 */
export function palabraCoincide(dicha: string, delNombre: string): boolean {
  if (dicha === delNombre) return true;
  const [corta, larga] =
    dicha.length <= delNombre.length ? [dicha, delNombre] : [delNombre, dicha];
  if (corta.length < 3) return false;
  return larga.startsWith(corta) && larga.length - corta.length <= 2;
}

/**
 * Clave FONÉTICA: cómo suena una palabra, no cómo se escribe.
 *
 * POR QUÉ EXISTE: el reconocedor casi nunca se equivoca de sonido — se
 * equivoca de ortografía. Oye bien "Xedex" y escribe "sedex"; oye "Eskimo"
 * y escribe "esquimo". Comparando letra por letra son palabras distintas;
 * comparando sonidos son la misma. Y en español latinoamericano las
 * confusiones son SISTEMÁTICAS, no azarosas:
 *
 *   seseo    s = z = c(e,i)     "sedex" = "cedex"
 *   yeísmo   ll = y             "yogurt" = "llogurt"
 *   b = v                       "suavitel" = "suabitel"
 *   h muda                      "hilo" = "ilo"
 *   k = qu = c(a,o,u)           "chiky" = "chiqui"
 *   g(e,i) = j                  "gel" = "jel"
 *
 * Se aplica igual a lo dicho y al nombre del producto, así que lo que
 * importa es que la regla sea CONSISTENTE, no que sea fonética perfecta.
 */
export function claveFonetica(palabra: string): string {
  let p = normalizarTexto(palabra).replace(/\s+/g, '');
  if (!p) return '';
  // La x inicial suena /s/ ("Xedex" se pide /sedeks/); en medio suena /ks/
  // ("taxi" → "taksi"). Distinguirlas hace que ambas grafías converjan.
  p = p.replace(/^x/, 's').replace(/x/g, 'ks');
  p = p
    .replace(/ch/g, 'C')          // se protege: no es c + h
    .replace(/qu([ei])/g, 'k$1')
    .replace(/c([ei])/g, 's$1')   // seseo
    .replace(/c/g, 'k')
    .replace(/z/g, 's')           // seseo
    .replace(/gu([ei])/g, 'g$1')  // "guitarra" suena con g dura
    .replace(/g([ei])/g, 'j$1')
    .replace(/ll/g, 'y')          // yeísmo
    // La y final suena /i/ ("rey", "Chiky"), así que converge con la
    // grafía en i que el reconocedor suele escribir ("chiqui").
    .replace(/y$/, 'i')
    .replace(/v/g, 'b')
    .replace(/w/g, 'b')
    .replace(/h/g, '')            // muda
    .replace(/ñ/g, 'n')
    .replace(/C/g, 'ch');
  // Letras repetidas no cambian el sonido en español ("carro" ya pasó por rr)
  return p.replace(/(.)\1+/g, '$1');
}

/** ¿Dos palabras SUENAN igual, aunque se escriban distinto? */
export function suenanIgual(a: string, b: string): boolean {
  const ca = claveFonetica(a);
  return ca.length > 0 && ca === claveFonetica(b);
}

/** Núcleo del nombre: normalizado y sin artículos/preposiciones.
 *  "Pierna de pollo" → "pierna pollo" (comparable con lo dicho). */
function nucleoNombre(nombre: string): string {
  return normalizarTexto(nombre)
    .split(/\s+/)
    .filter((t) => t && !PALABRAS_IGNORAR.has(t))
    .join(' ');
}

/**
 * Distancia de edición (Levenshtein): cuántos cambios de una letra separan
 * dos palabras. "marucha"→"maruchan" = 1.
 * Se usa para rescatar transcripciones imperfectas, que abundan cuando el
 * reconocimiento corre sin internet o hay ruido en el local.
 */
export function distanciaEdicion(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(
        previa[j] + 1,        // borrar
        actual[j - 1] + 1,    // insertar
        previa[j - 1] + costo // sustituir
      );
    }
    previa = actual;
  }
  return previa[b.length];
}

/**
 * Tolerancia de errores según el largo de la palabra.
 * Hasta 3 letras no se tolera NADA: pan/sal/sol/paz se volverían
 * intercambiables. De 4 en adelante sí, porque el nombre sigue siendo
 * reconocible ("kola"→"cola", "marucha"→"maruchan") y quien elige entre
 * varios candidatos es la distancia más baja, no esta función.
 */
function toleranciaTipografica(largo: number): number {
  if (largo <= 3) return 0;
  if (largo <= 6) return 1;
  return 2;
}

/**
 * Distancia que cuenta para decidir: la menor entre comparar LETRAS y
 * comparar SONIDOS. "esquimo"/"eskimo" son 2 letras de diferencia pero 0
 * de sonido, y lo segundo describe mejor el error del reconocedor.
 */
export function distanciaEfectiva(a: string, b: string): number {
  const porLetras = distanciaEdicion(a, b);
  if (porLetras === 0) return 0;
  return Math.min(porLetras, distanciaEdicion(claveFonetica(a), claveFonetica(b)));
}

/** ¿Dos palabras son "la misma" pese a un error de transcripción? */
export function palabraSimilar(dicha: string, delNombre: string): boolean {
  if (palabraCoincide(dicha, delNombre)) return true;
  // Sonar exactamente igual es señal MÁS fuerte que parecerse de letras:
  // vale incluso en palabras cortas, donde no se tolera ningún error
  // tipográfico (pan/sal/sol no deben volverse intercambiables, pero
  // "sal" y "zal" sí son la misma palabra).
  if (suenanIgual(dicha, delNombre)) return true;
  const tolerancia = toleranciaTipografica(Math.max(dicha.length, delNombre.length));
  if (tolerancia === 0) return false;
  return distanciaEfectiva(dicha, delNombre) <= tolerancia;
}

/**
 * Regla de oro del matching: LO DICHO MANDA.
 * Si lo que el vendedor dijo corresponde al NOMBRE de un producto que
 * existe, ese producto gana — sin importar cuánto se parezca a sinónimos
 * de otros. Los sinónimos (palabras clave) solo deciden cuando lo dicho
 * no es el nombre de nada.
 *
 * 1) Coincidencia EXACTA de núcleo (mismas palabras, mismo orden):
 *    "pierna de pollo" → "Pierna de pollo" (no "Pollo pierna").
 * 2) Nombres que contienen TODAS las palabras dichas (tolerando
 *    plurales), el nombre más corto primero:
 *    "piernas de pollo" → los productos de pierna, nunca "Consomé de pollo".
 * Con una sola palabra solo aplica el nivel exacto — así los sinónimos
 * deliberados del dueño siguen mandando en dichos de una palabra.
 */
export function seleccionarPorNombre<T extends { nombre: string }>(
  palabras: string[],
  productos: T[]
): T[] {
  if (palabras.length === 0) return [];
  const frase = palabras.join(' ');
  const conNucleo = productos.map((p) => ({ p, nucleo: nucleoNombre(p.nombre) }));

  const exactos = conNucleo.filter((c) => c.nucleo === frase);
  if (exactos.length > 0) return exactos.map((c) => c.p);

  if (palabras.length < 2) return [];
  return conNucleo
    .filter((c) => {
      const tokens = c.nucleo.split(' ');
      return palabras.every((pd) => tokens.some((tn) => palabraCoincide(pd, tn)));
    })
    .sort((a, b) => a.nucleo.length - b.nucleo.length)
    .map((c) => c.p);
}

/**
 * Ordena un catálogo por parecido a lo que se dijo, del más al menos
 * probable. NO decide nada: se usa para poner los candidatos arriba cuando
 * el vendedor le va a enseñar a la app qué producto era.
 *
 * Aquí sí conviene ser generoso —el humano elige— al revés que en la
 * búsqueda automática, donde adivinar mal cobra el producto equivocado.
 */
export function ordenarPorParecido<T extends { nombre: string }>(
  palabras: string[],
  productos: T[]
): T[] {
  if (palabras.length === 0) return productos;
  const puntuar = (nombre: string): number => {
    const tokens = nucleoNombre(nombre).split(' ').filter(Boolean);
    if (tokens.length === 0) return Infinity;
    // Suma de la mejor distancia de cada palabra dicha al nombre
    let total = 0;
    for (const dicha of palabras) {
      let mejor = Infinity;
      for (const t of tokens) {
        const d = distanciaEfectiva(dicha, t);
        // El prefijo compartido descuenta a la MITAD, no a un valor fijo:
        // así "pantalones" queda más cerca de "pantalón" (casi igual) que
        // de "pan" (prefijo corto). Con un bonus plano ganaba "Pan simple".
        const esPrefijo = t.startsWith(dicha) || dicha.startsWith(t);
        mejor = Math.min(mejor, esPrefijo ? d / 2 : d);
      }
      total += mejor === Infinity ? 99 : mejor;
    }
    return total;
  };
  return productos
    .map((p) => ({ p, d: puntuar(p.nombre) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.p);
}

/**
 * ÚLTIMO RECURSO: encontrar el producto pese a errores de transcripción.
 *
 * Solo se llama cuando fallaron el nombre exacto y las palabras clave, así
 * que no compite con la regla "lo dicho manda" — entra cuando la
 * alternativa es no encontrar nada. Es lo que salva las transcripciones
 * imperfectas del reconocimiento sin internet y de los locales ruidosos.
 *
 * Devuelve UN solo producto (el más parecido) y solo si el parecido es
 * claramente mejor que el resto; ante un empate prefiere no adivinar, para
 * no vender el producto equivocado.
 */
export function seleccionarPorParecido<T extends { nombre: string }>(
  palabras: string[],
  productos: T[]
): T[] {
  if (palabras.length === 0 || productos.length === 0) return [];

  const puntuados = productos
    .map((p) => {
      const tokens = nucleoNombre(p.nombre).split(' ').filter(Boolean);
      // Cuántas de las palabras dichas encuentran pareja en el nombre, y
      // qué tan lejos quedaron (menos distancia = mejor)
      let aciertos = 0;
      let distanciaTotal = 0;
      for (const dicha of palabras) {
        let mejor = Infinity;
        for (const t of tokens) {
          if (palabraSimilar(dicha, t)) {
            mejor = Math.min(mejor, distanciaEfectiva(dicha, t));
          }
        }
        if (mejor !== Infinity) { aciertos++; distanciaTotal += mejor; }
      }
      return { p, aciertos, distanciaTotal };
    })
    .filter((x) => x.aciertos === palabras.length) // todas las palabras dichas
    .sort((a, b) => a.distanciaTotal - b.distanciaTotal);

  if (puntuados.length === 0) return [];
  // Empate en el mejor puntaje → ambiguo, mejor no adivinar
  if (puntuados.length > 1 && puntuados[0].distanciaTotal === puntuados[1].distanciaTotal) {
    return [];
  }
  return [puntuados[0].p];
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
/**
 * Normaliza las formas en que el reconocedor escribe las fracciones ANTES
 * de limpiar el texto. Sin esto "1/2 libra" se convierte en "1 2 libra"
 * (la normalización borra la barra) y se leería como dos cantidades
 * distintas. Google alterna entre "media", "1/2" y "½" sin previo aviso.
 */
export function normalizarFracciones(texto: string): string {
  return texto
    .replace(/½/g, ' media ')
    .replace(/(\d)\s*\/\s*2\b/g, (_m, entero) =>
      entero === '1' ? ' media ' : ` ${entero} media `
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Elige, entre las varias transcripciones que propone el reconocedor, la que
 * más productos del inventario reconoce.
 *
 * POR QUÉ: el reconocedor no devuelve UNA transcripción sino varias, ordenadas
 * por su propia confianza — y esa confianza mide español general, no el
 * negocio. Para "Arroz Faisán" puede proponer ["ropa y sam", "arroz faisán"]:
 * la correcta viene de segunda y la estábamos descartando. Acá gana la que
 * más productos REALES encuentra, que es lo único que importa en una venta.
 *
 * Ante empate gana la primera, o sea el orden del reconocedor.
 */
export function elegirMejorHipotesis<T extends { nombre: string }>(
  alternativas: string[],
  productos: T[]
): string {
  const utiles = alternativas.map((a) => a?.trim()).filter((a): a is string => !!a);
  if (utiles.length === 0) return '';
  if (utiles.length === 1 || productos.length === 0) return utiles[0];

  let mejor = utiles[0];
  let mejorAciertos = -1;
  for (const alternativa of utiles) {
    let aciertos = 0;
    for (const seg of parsearMultiplesProductos(alternativa)) {
      const porNombre = seleccionarPorNombre(seg.palabras, productos);
      if (porNombre.length > 0) { aciertos++; continue; }
      if (seleccionarPorParecido(seg.palabras, productos).length > 0) aciertos++;
    }
    if (aciertos > mejorAciertos) { mejorAciertos = aciertos; mejor = alternativa; }
  }
  return mejor;
}

export function parsearMultiplesProductos(transcripcion: string): SegmentoVoz[] {
  const tokens = normalizarTexto(normalizarFracciones(transcripcion))
    .split(/\s+/).filter(Boolean);
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

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    const siguiente = tokens[idx + 1];
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
      } else {
        // El producto en curso YA tiene cantidad: este "media" abre uno
        // nuevo. Sin esto "5 huevos media libra de arroz" se fusionaba en
        // un solo item ("5 × huevos arroz") y se le cobraba mal al cliente.
        emitir();
        pendingQty = 0.5;
      }
      continue;
    }

    // "docena(s)": la cantidad está dicha en docenas. El flag viaja con el
    // segmento; la conversión a unidades (×12) se decide al agregar al
    // carrito según la unidad del producto.
    if (token === 'docena' || token === 'docenas') {
      if (curWords.length > 0 && curQty != null) {
        // Igual que "media" y las unidades: el producto en curso ya tiene
        // cantidad, así que esta "docena" abre uno nuevo. Sin esto,
        // "media docena de bananos docena y media de tornillos" perdía el
        // "1" de la docena y los tornillos quedaban en 0.5 en vez de 1.5.
        emitir();
        pendingQty = 1;
        pendingDocena = true;
      } else if (curWords.length === 0) {
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
      if (curWords.length > 0 && curQty != null) {
        // Igual que con "media": el producto en curso ya tiene cantidad, así
        // que esta unidad abre uno nuevo ("2 clavos libra de arroz").
        emitir();
        pendingQty = 1;
      } else if (curWords.length === 0 && pendingQty == null) {
        pendingQty = 1;
      }
      continue;
    }

    const n = valorNumero(token);
    if (n !== null) {
      // ¿Es la medida del envase dentro del nombre? ("fanta naranja 12 onzas")
      // Solo cuando ya se venía nombrando un producto: al inicio de la frase
      // un número siempre es cantidad ("2 libras de arroz").
      if (curWords.length > 0 && siguiente && PALABRAS_CONTENIDO.has(siguiente)) {
        curWords.push(token, siguiente);
        idx++; // consumir también la unidad de contenido
        continue;
      }
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

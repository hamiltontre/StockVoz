import { useState, useEffect, useCallback, useRef } from 'react';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import { normalizarTexto } from '../utils/texto';
import type { Producto } from '../types';

export type EstadoVoz = 'inactivo' | 'escuchando' | 'procesando' | 'error';

/** Un producto reconocido dentro de la lista hablada. */
export interface ItemVoz {
  cantidad: number;
  palabras: string[];
  productosEncontrados: Producto[];
}

export interface ResultadoVoz {
  transcripcion: string;
  items: ItemVoz[];
}

// 'es-419' (código regional Latinoamérica de la ONU) no es reconocido de
// forma confiable por el backend de reconocimiento de voz de Google en
// algunos dispositivos/OEMs — devuelve resultados vacíos aunque detecte
// audio. 'es-US' tiene mejor soporte real y funciona bien con acento
// latinoamericano/nicaragüense.
const LOCALE_ES = 'es-US';

// Opciones del reconocedor: tolerar pausas largas (4s) para que el vendedor
// pueda dictar su lista con calma sin que se corte la sesión, y resultados
// parciales para no perder lo dicho. (Algunos Android ignoran estos extras,
// por eso además re-armamos la escucha al terminar cada segmento.)
const OPCIONES_VOZ = {
  EXTRA_LANGUAGE_MODEL: 'LANGUAGE_MODEL_FREE_FORM',
  EXTRA_PARTIAL_RESULTS: true,
  EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 4000,
  EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
  EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
};

// RCTVoice es null en Expo Go (no hay native build).
// Verificamos ANTES de hacer require para evitar que el constructor
// del módulo haga llamadas async a un bridge nulo.
const VOICE_NATIVO_DISPONIBLE = !!NativeModules.RCTVoice;

function getVoice() {
  if (!VOICE_NATIVO_DISPONIBLE) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-voice/voice').default;
  } catch {
    return null;
  }
}

/**
 * Pide el permiso de micrófono en Android. @react-native-voice NO lo solicita
 * solo al llamar start(), así que sin esto la voz falla silenciosamente en
 * dispositivos donde el usuario aún no lo concedió.
 * Devuelve true si el permiso quedó concedido.
 */
async function asegurarPermisoMicrofono(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const yaConcedido = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    if (yaConcedido) return true;
    const resultado = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Permiso de micrófono',
        message: 'StockVoz necesita el micrófono para registrar ventas por voz.',
        buttonPositive: 'Permitir',
        buttonNegative: 'Cancelar',
      }
    );
    return resultado === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

// ─── Números en texto ────────────────────────────────────────────────────────
const NUMEROS_TEXTO: Record<string, number> = {
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

/**
 * Extrae cantidad y palabras candidatas de la transcripción.
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
 * separadores entre productos.
 *
 * Ejemplos:
 *   "maruchan cinco platano seis pan siete"
 *      → [{2}maruchan? no] → [{5,maruchan},{6,platano},{7,pan}]
 *   "cinco maruchan seis platano"   → [{5,maruchan},{6,platano}]
 *   "dos coca cola tres fanta"       → [{2,[coca,cola]},{3,[fanta]}]
 *   "maruchan"                       → [{1,maruchan}]
 */
export function parsearMultiplesProductos(
  transcripcion: string
): Array<{ cantidad: number; palabras: string[] }> {
  const tokens = normalizarTexto(transcripcion).split(/\s+/).filter(Boolean);
  const segmentos: Array<{ cantidad: number; palabras: string[] }> = [];

  let curWords: string[] = [];
  let curQty: number | null = null;
  let pendingQty: number | null = null;

  const valorNumero = (token: string): number | null => {
    const d = parseInt(token, 10);
    if (!isNaN(d) && d > 0 && d <= 999) return d;
    if (NUMEROS_TEXTO[token]) return NUMEROS_TEXTO[token];
    return null;
  };

  const emitir = () => {
    if (curWords.length > 0) {
      segmentos.push({ cantidad: curQty ?? 1, palabras: curWords });
    }
    curWords = [];
    curQty = null;
  };

  for (const token of tokens) {
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
    // palabra de producto
    if (pendingQty != null && curWords.length === 0) {
      curQty = pendingQty;
      pendingQty = null;
    }
    curWords.push(token);
  }
  emitir();
  return segmentos;
}

/**
 * Estrategia de búsqueda en capas (de más específica a más flexible):
 *
 * Nivel 1: coincidencia exacta de palabra clave normalizada
 * Nivel 2: palabra clave que EMPIEZA con el término (frijol → frijoles)
 * Nivel 3: nombre de producto que contiene el término
 * Nivel 4: combinación de 2 palabras seguidas ("coca cola")
 */
export async function buscarProductosInteligente(palabras: string[]): Promise<Producto[]> {
  if (palabras.length === 0) return [];

  // Nivel 1 y 2: palabras clave (más precisas que el nombre)
  for (const palabra of palabras) {
    const exacta = await ProductoRepository.buscarPorPalabraClaveExacta(palabra);
    if (exacta.ok && exacta.data.length > 0) return exacta.data;

    const prefijo = await ProductoRepository.buscarPorPalabraClavePrefijo(palabra);
    if (prefijo.ok && prefijo.data.length > 0) return prefijo.data;
  }

  // Nivel 3: nombre del producto
  for (const palabra of palabras) {
    if (palabra.length < 3) continue;
    const porNombre = await ProductoRepository.buscarPorNombre(palabra);
    if (porNombre.ok && porNombre.data.length > 0) return porNombre.data;
  }

  // Nivel 4: combinación de 2 palabras seguidas
  if (palabras.length >= 2) {
    for (let i = 0; i < palabras.length - 1; i++) {
      const combinacion = palabras[i] + ' ' + palabras[i + 1];
      const porComb = await ProductoRepository.buscarPorNombre(combinacion);
      if (porComb.ok && porComb.data.length > 0) return porComb.data;
    }
  }

  return [];
}

// Tope de seguridad: si el vendedor olvida apagar el micrófono, se corta solo.
// Tope de seguridad: si el micrófono queda encendido, se corta solo.
const MAX_ESCUCHA_MS = 60_000;

export function useVoz() {
  const [estado, setEstado] = useState<EstadoVoz>('inactivo');
  const [resultado, setResultado] = useState<ResultadoVoz | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0); // tiempo escuchando (informativo)
  const disponible = useRef(VOICE_NATIVO_DISPONIBLE);

  const escuchandoRef = useRef(false);
  const cronometroRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limiteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpiarTimers = useCallback(() => {
    if (cronometroRef.current) { clearInterval(cronometroRef.current); cronometroRef.current = null; }
    if (limiteRef.current) { clearTimeout(limiteRef.current); limiteRef.current = null; }
    setSegundos(0);
  }, []);

  // Procesa la transcripción → lista de productos (uno o varios).
  // Una sola sesión de reconocimiento: el SpeechRecognizer entrega TODO lo
  // dicho (con la tolerancia a pausas de OPCIONES_VOZ) en un único resultado,
  // que aquí dividimos en varios productos. NO re-armamos el reconocedor —
  // eso causaba ANR/crashes por llamar start()/stop() en ráfaga.
  const procesar = useCallback(async (transcripcion: string) => {
    const texto = transcripcion.trim();
    if (!texto) { setEstado('inactivo'); return; }
    setEstado('procesando');
    try {
      const segmentos = parsearMultiplesProductos(texto);
      const items: ItemVoz[] = [];
      for (const seg of segmentos) {
        const productosEncontrados = await buscarProductosInteligente(seg.palabras);
        items.push({ cantidad: seg.cantidad, palabras: seg.palabras, productosEncontrados });
      }
      setResultado({ transcripcion: texto, items });
      setEstado('inactivo');
    } catch {
      setErrorMensaje('Error al procesar el audio');
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 3000);
    }
  }, []);

  // Resultado final de la sesión (fin natural por silencio O tras detener).
  const handleResultados = useCallback((e: { value?: string[] }) => {
    console.warn('[DIAG voz] onSpeechResults e.value=', JSON.stringify(e.value));
    escuchandoRef.current = false;
    limpiarTimers();
    procesar(e.value?.[0] ?? '');
  }, [procesar, limpiarTimers]);

  const handleError = useCallback((e: { error?: { message?: string; code?: string } }) => {
    console.warn('[DIAG voz] onSpeechError e=', JSON.stringify(e));
    escuchandoRef.current = false;
    limpiarTimers();
    const code = String(e.error?.code ?? '');
    // 5=client, 6=speech timeout, 7=no match: el usuario no dijo nada
    // reconocible — no es un error real, simplemente volvemos a inactivo.
    if (code === '5' || code === '6' || code === '7' || code === 'no-speech') {
      setEstado('inactivo');
      return;
    }
    setErrorMensaje(e.error?.message ?? 'Error de reconocimiento');
    setEstado('error');
    setTimeout(() => setEstado('inactivo'), 3000);
  }, [limpiarTimers]);

  useEffect(() => {
    const Voice = getVoice();
    if (!Voice) return;

    Voice.onSpeechResults = handleResultados;
    Voice.onSpeechError = handleError;

    return () => {
      limpiarTimers();
      Voice.destroy()
        .then(() => Voice.removeAllListeners())
        .catch(() => {});
    };
  }, [handleResultados, handleError, limpiarTimers]);

  // Detiene la escucha (toque del vendedor). Voice.stop() hace que el
  // reconocedor entregue el resultado final vía onSpeechResults, que procesa.
  const detenerEscucha = useCallback(async () => {
    if (!escuchandoRef.current) { setEstado('inactivo'); return; }
    escuchandoRef.current = false;
    limpiarTimers();
    const Voice = getVoice();
    if (!Voice) { setEstado('inactivo'); return; }
    setEstado('procesando');
    try { await Voice.stop(); } catch { setEstado('inactivo'); }
  }, [limpiarTimers]);

  const iniciarEscucha = useCallback(async () => {
    const Voice = getVoice();
    if (!Voice) {
      setErrorMensaje('Voz no disponible. Se necesita development build.');
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 4000);
      return;
    }
    const permiso = await asegurarPermisoMicrofono();
    if (!permiso) {
      setErrorMensaje('Activa el permiso de micrófono para usar la voz');
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 4000);
      return;
    }
    try {
      setResultado(null);
      setErrorMensaje(null);
      escuchandoRef.current = true;
      setEstado('escuchando');
      setSegundos(0);
      await Voice.start(LOCALE_ES, OPCIONES_VOZ);

      cronometroRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
      // Tope de seguridad: detener si se pasa el máximo.
      limiteRef.current = setTimeout(() => { detenerEscucha(); }, MAX_ESCUCHA_MS);
    } catch (e) {
      escuchandoRef.current = false;
      limpiarTimers();
      setErrorMensaje(String(e));
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 3000);
    }
  }, [limpiarTimers, detenerEscucha]);

  const limpiar = useCallback(() => {
    setResultado(null);
    setErrorMensaje(null);
    setEstado('inactivo');
    limpiarTimers();
  }, [limpiarTimers]);

  return {
    estado,
    resultado,
    errorMensaje,
    segundos,
    disponible: disponible.current,
    iniciarEscucha,
    detenerEscucha,
    limpiar,
  };
}

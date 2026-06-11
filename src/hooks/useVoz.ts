import { useState, useEffect, useCallback, useRef } from 'react';
import { NativeModules } from 'react-native';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import { normalizarTexto } from '../utils/texto';
import type { Producto } from '../types';

export type EstadoVoz = 'inactivo' | 'escuchando' | 'procesando' | 'error';

export interface ResultadoVoz {
  transcripcion: string;
  productosEncontrados: Producto[];
  cantidad: number;
}

const LOCALE_ES = 'es-419';
const TIMEOUT_MS = 8000;

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

export function useVoz() {
  const [estado, setEstado] = useState<EstadoVoz>('inactivo');
  const [resultado, setResultado] = useState<ResultadoVoz | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const disponible = useRef(VOICE_NATIVO_DISPONIBLE);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const limpiarTimers = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setSegundosRestantes(0);
  }, []);

  const handleResultados = useCallback(async (e: { value?: string[] }) => {
    limpiarTimers();
    const transcripcion = e.value?.[0] ?? '';
    if (!transcripcion.trim()) {
      setEstado('inactivo');
      return;
    }

    setEstado('procesando');
    try {
      const { cantidad, palabras } = parsearTranscripcion(transcripcion);
      const productosEncontrados = await buscarProductosInteligente(palabras);
      setResultado({ transcripcion, productosEncontrados, cantidad });
    } catch {
      setErrorMensaje('Error al procesar el audio');
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 3000);
      return;
    }
    setEstado('inactivo');
  }, [limpiarTimers]);

  const handleError = useCallback((e: { error?: { message?: string; code?: string } }) => {
    limpiarTimers();
    const code = String(e.error?.code ?? '');
    // Código 7 = no match (no se reconoció nada hablado) — no es un error real
    if (code === '7' || code === 'no-speech') {
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

  const iniciarEscucha = useCallback(async () => {
    const Voice = getVoice();
    if (!Voice) {
      setErrorMensaje('Voz no disponible. Se necesita development build.');
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 4000);
      return;
    }
    try {
      setResultado(null);
      setErrorMensaje(null);
      setEstado('escuchando');
      await Voice.start(LOCALE_ES);

      // Countdown visual
      setSegundosRestantes(Math.ceil(TIMEOUT_MS / 1000));
      countdownRef.current = setInterval(() => {
        setSegundosRestantes((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Auto-stop de seguridad
      timeoutRef.current = setTimeout(async () => {
        try { await Voice.stop(); } catch { /* noop */ }
        setEstado((prev) => (prev === 'escuchando' ? 'inactivo' : prev));
      }, TIMEOUT_MS);
    } catch (e) {
      limpiarTimers();
      setErrorMensaje(String(e));
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 3000);
    }
  }, [limpiarTimers]);

  const detenerEscucha = useCallback(async () => {
    limpiarTimers();
    const Voice = getVoice();
    if (!Voice) { setEstado('inactivo'); return; }
    try { await Voice.stop(); } catch { /* noop */ }
    setEstado('inactivo');
  }, [limpiarTimers]);

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
    segundosRestantes,
    disponible: disponible.current,
    iniciarEscucha,
    detenerEscucha,
    limpiar,
  };
}

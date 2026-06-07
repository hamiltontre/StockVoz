import { useState, useEffect, useCallback, useRef } from 'react';
import { NativeModules } from 'react-native';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import type { Producto } from '../types';

export type EstadoVoz = 'inactivo' | 'escuchando' | 'procesando' | 'error';

export interface ResultadoVoz {
  transcripcion: string;
  productosEncontrados: Producto[];
  cantidad: number;
}

const LOCALE_ES = 'es-419';

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

const numerosEscritos: Record<string, number> = {
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

export function useVoz() {
  const [estado, setEstado] = useState<EstadoVoz>('inactivo');
  const [resultado, setResultado] = useState<ResultadoVoz | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const disponible = useRef(VOICE_NATIVO_DISPONIBLE);

  const handleResultados = useCallback(async (e: { value?: string[] }) => {
    const transcripcion = e.value?.[0] ?? '';
    if (!transcripcion) return;

    setEstado('procesando');
    const palabras = transcripcion.toLowerCase().split(/\s+/);
    let productosEncontrados: Producto[] = [];
    let cantidad = 1;

    for (const p of palabras) {
      const num = parseInt(p, 10);
      if (!isNaN(num) && num > 0) { cantidad = num; break; }
      if (numerosEscritos[p]) { cantidad = numerosEscritos[p]; break; }
    }

    for (const palabra of palabras) {
      if (palabra.length < 3) continue;
      const byKeyword = await ProductoRepository.buscarPorPalabraClave(palabra);
      if (byKeyword.ok && byKeyword.data.length > 0) {
        productosEncontrados = byKeyword.data;
        break;
      }
      const byName = await ProductoRepository.buscarPorNombre(palabra);
      if (byName.ok && byName.data.length > 0) {
        productosEncontrados = byName.data;
        break;
      }
    }

    setResultado({ transcripcion, productosEncontrados, cantidad });
    setEstado('inactivo');
  }, []);

  const handleError = useCallback((e: { error?: { message?: string } }) => {
    setErrorMensaje(e.error?.message ?? 'Error de reconocimiento');
    setEstado('error');
  }, []);

  useEffect(() => {
    const Voice = getVoice();
    if (!Voice) return;

    Voice.onSpeechResults = handleResultados;
    Voice.onSpeechError = handleError;

    return () => {
      Voice.destroy()
        .then(() => Voice.removeAllListeners())
        .catch(() => {});
    };
  }, [handleResultados, handleError]);

  const iniciarEscucha = useCallback(async () => {
    const Voice = getVoice();
    if (!Voice) {
      setErrorMensaje('Voz no disponible. Se necesita development build.');
      setEstado('error');
      // Auto-limpiar el error después de 3 segundos
      setTimeout(() => setEstado('inactivo'), 3000);
      return;
    }
    try {
      setResultado(null);
      setErrorMensaje(null);
      setEstado('escuchando');
      await Voice.start(LOCALE_ES);

      // Timeout de seguridad: si en 8s no hay resultado, detener
      setTimeout(async () => {
        try { await Voice.stop(); } catch { /* noop */ }
        setEstado((prev) => prev === 'escuchando' ? 'inactivo' : prev);
      }, 8000);
    } catch (e) {
      setErrorMensaje(String(e));
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 3000);
    }
  }, []);

  const detenerEscucha = useCallback(async () => {
    const Voice = getVoice();
    if (!Voice) { setEstado('inactivo'); return; }
    try { await Voice.stop(); } catch { /* noop */ }
    setEstado('inactivo');
  }, []);

  const limpiar = useCallback(() => {
    setResultado(null);
    setErrorMensaje(null);
    setEstado('inactivo');
  }, []);

  return {
    estado,
    resultado,
    errorMensaje,
    disponible: disponible.current,
    iniciarEscucha,
    detenerEscucha,
    limpiar,
  };
}

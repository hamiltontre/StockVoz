import { useState, useEffect, useCallback, useRef } from 'react';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import type { Producto } from '../types';

// @react-native-voice/voice requires a native build (not Expo Go).
// We import it lazily so the rest of the app works in Expo Go.
let Voice: typeof import('@react-native-voice/voice').default | null = null;
try {
  Voice = require('@react-native-voice/voice').default;
} catch {
  // Native module not available (Expo Go) — voice will be disabled
}

export type EstadoVoz = 'inactivo' | 'escuchando' | 'procesando' | 'error';

export interface ResultadoVoz {
  transcripcion: string;
  productosEncontrados: Producto[];
  cantidad: number;
}

const LOCALE_ES = 'es-419'; // español latinoamericano

export function useVoz() {
  const [estado, setEstado] = useState<EstadoVoz>('inactivo');
  const [resultado, setResultado] = useState<ResultadoVoz | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const disponible = useRef(false);

  useEffect(() => {
    if (!Voice) return;

    Voice.isAvailable().then((avail) => {
      disponible.current = !!avail;
    }).catch(() => {
      disponible.current = false;
    });

    Voice.onSpeechResults = handleResultados;
    Voice.onSpeechError = handleError;

    return () => {
      Voice?.destroy().then(() => Voice?.removeAllListeners()).catch(() => {});
    };
  }, []);

  const handleResultados = useCallback(async (e: { value?: string[] }) => {
    const transcripcion = e.value?.[0] ?? '';
    if (!transcripcion) return;

    setEstado('procesando');

    const palabras = transcripcion.toLowerCase().split(/\s+/);
    let productosEncontrados: Producto[] = [];
    let cantidad = 1;

    // Detectar cantidad: "dos cervezas", "3 aceites", etc.
    const numerosEscritos: Record<string, number> = {
      uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
      seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
    };

    for (const p of palabras) {
      const num = parseInt(p, 10);
      if (!isNaN(num) && num > 0) { cantidad = num; break; }
      if (numerosEscritos[p]) { cantidad = numerosEscritos[p]; break; }
    }

    // Buscar productos por palabras clave y luego por nombre
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
    const msg = e.error?.message ?? 'Error desconocido de reconocimiento';
    setErrorMensaje(msg);
    setEstado('error');
  }, []);

  const iniciarEscucha = useCallback(async () => {
    if (!Voice || !disponible.current) {
      setErrorMensaje('Reconocimiento de voz no disponible. Se requiere build de desarrollo.');
      setEstado('error');
      return;
    }
    try {
      setResultado(null);
      setErrorMensaje(null);
      setEstado('escuchando');
      await Voice.start(LOCALE_ES);
    } catch (e) {
      setErrorMensaje(String(e));
      setEstado('error');
    }
  }, []);

  const detenerEscucha = useCallback(async () => {
    try {
      await Voice?.stop();
    } catch {
      // Si falla al detener, simplemente reseteamos
    }
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

import { useState, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * RF-05 — Detección de conectividad robusta con múltiples endpoints.
 *
 * No depende de un solo proveedor (dns.google puede estar bloqueado en
 * ciertas redes corporativas o ISPs nicaragüenses). Lanza peticiones
 * HEAD en paralelo a varios endpoints — si CUALQUIERA responde,
 * consideramos que hay internet. Esto evita falsos negativos.
 */

const ENDPOINTS = [
  'https://dns.google/resolve?name=google.com',
  'https://cloudflare.com/cdn-cgi/trace',
  'https://www.gstatic.com/generate_204',
];

const TIMEOUT_MS = 3000;

async function ping(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Devuelve true si CUALQUIER endpoint responde — Promise.any() falla
 * solo si todos rechazan/fallan, así un endpoint bloqueado no afecta.
 */
async function hayInternet(): Promise<boolean> {
  try {
    await Promise.any(
      ENDPOINTS.map(async (url) => {
        const ok = await ping(url);
        if (!ok) throw new Error('no');
        return true;
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Último resultado conocido, compartido por toda la app.
 *
 * POR QUÉ: comprobar internet cuesta hasta 3 s. La voz necesita decidir
 * QUÉ MOTOR usar en el instante en que el vendedor toca el micrófono; no
 * puede quedarse esperando un ping. Se usa el último valor conocido —que
 * el hook refresca cada 30 s y al volver del segundo plano— y si todavía
 * no hay ninguno se asume que sí hay conexión (el motor online era el
 * comportamiento anterior, así nunca se degrada por no saber).
 */
let ultimaConexion: boolean | null = null;

/** Estado de conexión sin esperar: null = aún no se ha comprobado. */
export function conexionConocida(): boolean | null {
  return ultimaConexion;
}

export function useConectividad() {
  const [conectado, setConectado] = useState<boolean | null>(ultimaConexion);

  const verificar = async () => {
    const ok = await hayInternet();
    ultimaConexion = ok;
    setConectado(ok);
  };

  useEffect(() => {
    verificar();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') verificar();
    });

    const intervalo = setInterval(verificar, 30_000);

    return () => {
      sub.remove();
      clearInterval(intervalo);
    };
  }, []);

  return { conectado };
}

import { useState, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * RF-05 — Monitorea la conectividad a internet de forma nativa.
 * No requiere librerías externas: usa fetch a un endpoint confiable.
 * La app funciona 100% offline; este hook solo informa el estado.
 */
export function useConectividad() {
  const [conectado, setConectado] = useState<boolean | null>(null);

  const verificar = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      await fetch('https://dns.google/resolve?name=google.com', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      setConectado(true);
    } catch {
      setConectado(false);
    }
  };

  useEffect(() => {
    verificar();

    // Reverificar cuando la app vuelve al primer plano
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') verificar();
    });

    // Reverificar cada 30 segundos
    const intervalo = setInterval(verificar, 30_000);

    return () => {
      sub.remove();
      clearInterval(intervalo);
    };
  }, []);

  return { conectado };
}

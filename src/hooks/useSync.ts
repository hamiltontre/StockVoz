import { useState, useCallback, useEffect } from 'react';
import { SyncRepository } from '../database/repositories/SyncRepository';
import { useConectividad } from './useConectividad';

export type EstadoSync = 'inactivo' | 'sincronizando' | 'exito' | 'error';

// URL del backend Laravel — se configurará desde ajustes en el futuro
const BACKEND_URL = 'https://api.stockvoz.app';

/**
 * RF-06 — Hook que gestiona la sincronización con el backend Laravel.
 * Se ejecuta automáticamente cuando hay conexión.
 */
export function useSync() {
  const { conectado } = useConectividad();
  const [estado, setEstado] = useState<EstadoSync>('inactivo');
  const [pendientes, setPendientes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const contarPendientes = useCallback(async () => {
    const n = await SyncRepository.contarPendientes();
    setPendientes(n);
  }, []);

  const sincronizar = useCallback(async (): Promise<boolean> => {
    if (estado === 'sincronizando') return false;
    if (!conectado) {
      setError('Sin conexión a internet');
      setEstado('error');
      return false;
    }

    setEstado('sincronizando');
    setError(null);

    try {
      const pendientesResult = await SyncRepository.obtenerPendientes();
      if (!pendientesResult.ok) throw new Error(pendientesResult.error);

      const items = pendientesResult.data;
      if (items.length === 0) {
        setEstado('exito');
        await contarPendientes();
        return true;
      }

      for (const item of items) {
        try {
          // POST al backend Laravel con timeout
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10_000);

          const resp = await fetch(`${BACKEND_URL}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tabla: item.tabla,
              operacion: item.operacion,
              payload: JSON.parse(item.payload),
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (resp.ok) {
            await SyncRepository.marcarSincronizado(item.id);
          } else {
            await SyncRepository.incrementarIntento(item.id);
          }
        } catch {
          // Error de red individual — incrementar intentos y seguir
          await SyncRepository.incrementarIntento(item.id);
        }
      }

      await contarPendientes();
      setEstado('exito');

      // Limpieza periódica
      await SyncRepository.limpiarAntiguos();
      return true;
    } catch (e) {
      setError(String(e));
      setEstado('error');
      return false;
    }
  }, [estado, conectado, contarPendientes]);

  // Cargar conteo de pendientes al montar
  useEffect(() => {
    contarPendientes();
  }, [contarPendientes]);

  // Auto-sincronizar cuando se recupere conexión y haya pendientes
  useEffect(() => {
    if (conectado && pendientes > 0 && estado === 'inactivo') {
      sincronizar();
    }
  }, [conectado, pendientes, estado, sincronizar]);

  return {
    estado,
    pendientes,
    conectado,
    error,
    sincronizar,
    contarPendientes,
  };
}

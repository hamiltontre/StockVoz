import { useState, useCallback, useEffect } from 'react';
import { SyncRepository } from '../database/repositories/SyncRepository';
import { ConfigRepository, CLAVES } from '../database/repositories/ConfigRepository';
import { useConectividad } from './useConectividad';
import { API_ENDPOINTS, TIMEOUT_MS } from '../config/api';

export type EstadoSync = 'inactivo' | 'sincronizando' | 'exito' | 'error';

/**
 * RF-06 — Sincronización diferida con el backend Laravel.
 * Envía batch de hasta 200 items por request.
 * Idempotente — el backend usa cliente_id para evitar duplicados.
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

    const token = await ConfigRepository.obtener(CLAVES.API_TOKEN);
    if (!token) {
      setError('No has iniciado sesión en la nube');
      setEstado('error');
      return false;
    }

    setEstado('sincronizando');
    setError(null);

    try {
      const pendientesResult = await SyncRepository.obtenerPendientes(200);
      if (!pendientesResult.ok) throw new Error(pendientesResult.error);

      const items = pendientesResult.data;
      if (items.length === 0) {
        setEstado('exito');
        await contarPendientes();
        return true;
      }

      // Empaquetar para enviar en una sola petición
      const payload = {
        items: items.map((i) => ({
          tabla: i.tabla,
          operacion: i.operacion,
          payload: JSON.parse(i.payload),
        })),
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const resp = await fetch(API_ENDPOINTS.sync, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        const errorBody = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errorBody.slice(0, 200)}`);
      }

      const data = await resp.json() as {
        resultados: Array<{ index: number; ok: boolean; error?: string }>;
      };

      // Marcar como sincronizados los items exitosos, incrementar intentos en los fallidos
      for (let idx = 0; idx < items.length; idx++) {
        const resultado = data.resultados.find((r) => r.index === idx);
        if (resultado?.ok) {
          await SyncRepository.marcarSincronizado(items[idx].id);
        } else {
          await SyncRepository.incrementarIntento(items[idx].id);
        }
      }

      await ConfigRepository.guardar(CLAVES.ULTIMA_SYNC, new Date().toISOString());
      await contarPendientes();
      await SyncRepository.limpiarAntiguos();
      setEstado('exito');
      return true;
    } catch (e) {
      setError(String(e));
      setEstado('error');
      return false;
    }
  }, [estado, conectado, contarPendientes]);

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

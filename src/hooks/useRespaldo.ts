import { useState, useEffect, useCallback } from 'react';
import { Share } from 'react-native';
import { ConfigRepository, CLAVES } from '../database/repositories/ConfigRepository';
import { generarRespaldo } from '../utils/respaldo';
import { diasDesde } from '../utils/fechas';

/**
 * Días sin respaldar tras los cuales se le insiste al dueño.
 * 4 días cubre el caso "algo le pasó al negocio o al teléfono" sin volverse
 * una molestia diaria.
 */
export const DIAS_SIN_RESPALDO_AVISO = 4;

/**
 * Respaldo del negocio a WhatsApp.
 *
 * IMPORTANTE — por qué NO se envía solo: Android no permite que una app
 * mande un WhatsApp sin que el usuario toque "enviar" (es una protección
 * anti-spam del sistema, no una limitación nuestra). Y una app cerrada
 * tampoco se ejecuta sola en gama baja: estos equipos matan agresivamente
 * los procesos en segundo plano. Sobre todo, si el teléfono se perdió o se
 * quebró, NINGÚN código puede correr ahí para enviar nada.
 *
 * Por eso el respaldo automático real es Android Auto Backup (invisible, a
 * la cuenta de Google del dueño) y esto es el respaldo que él controla:
 * la app le insiste cuando lleva días sin hacerlo y lo manda en un toque.
 */
export function useRespaldo() {
  const [ultimoRespaldo, setUltimoRespaldo] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  const cargar = useCallback(async () => {
    setUltimoRespaldo(await ConfigRepository.obtener(CLAVES.ULTIMO_RESPALDO));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const dias = diasDesde(ultimoRespaldo);
  /** true cuando nunca se respaldó o pasaron demasiados días. */
  const necesitaRespaldo = dias === null || dias >= DIAS_SIN_RESPALDO_AVISO;

  const respaldar = useCallback(async (): Promise<boolean> => {
    setGenerando(true);
    try {
      const texto = await generarRespaldo();
      const res = await Share.share({ message: texto });
      // Solo cuenta como respaldado si de verdad lo compartió
      if (res.action === Share.sharedAction) {
        const ahora = new Date().toISOString();
        await ConfigRepository.guardar(CLAVES.ULTIMO_RESPALDO, ahora);
        setUltimoRespaldo(ahora);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setGenerando(false);
    }
  }, []);

  return { ultimoRespaldo, diasSinRespaldo: dias, necesitaRespaldo, generando, respaldar, recargar: cargar };
}

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { UsuarioRepository } from '../database/repositories/UsuarioRepository';
import { ConfigRepository, CLAVES } from '../database/repositories/ConfigRepository';
import type { Usuario, SesionActiva } from '../types';

/**
 * Duración de la sesión. En una pulpería el teléfono se apaga y se guarda
 * decenas de veces al día; pedir el PIN en cada arranque haría que el
 * vendedor lo teclee 100 veces por jornada y termine odiando la app.
 * 6 horas cubre una jornada partida (mañana / tarde) y obliga a re-entrar
 * al día siguiente, que es cuando el PIN realmente protege algo.
 */
const SESION_DURACION_MS = 6 * 60 * 60 * 1000;

interface SesionContextValue {
  sesion: SesionActiva | null;
  cargando: boolean;
  iniciarSesion: (usuario: Usuario) => void;
  cerrarSesion: () => void;
  esAdmin: boolean;
}

const SesionContext = createContext<SesionContextValue | null>(null);

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [sesion, setSesion] = useState<SesionActiva | null>(null);
  const [cargando, setCargando] = useState(true);
  const [hayAdmin, setHayAdmin] = useState<boolean | null>(null);
  const router = useRouter();
  const segments = useSegments();

  /** Borra la sesión guardada (expiró o el usuario cerró sesión). */
  const olvidarSesionGuardada = useCallback(async () => {
    await ConfigRepository.eliminar(CLAVES.SESION_USUARIO_ID).catch(() => {});
    await ConfigRepository.eliminar(CLAVES.SESION_EXPIRA_EN).catch(() => {});
  }, []);

  // Paso 1: al arrancar, restaurar la sesión si sigue vigente
  useEffect(() => {
    (async () => {
      try {
        const existe = await UsuarioRepository.hayAdminConfigurado();
        setHayAdmin(existe);

        if (existe) {
          const [idGuardado, expiraEn] = await Promise.all([
            ConfigRepository.obtener(CLAVES.SESION_USUARIO_ID),
            ConfigRepository.obtener(CLAVES.SESION_EXPIRA_EN),
          ]);
          const vence = expiraEn ? parseInt(expiraEn, 10) : 0;
          if (idGuardado && Number.isFinite(vence) && Date.now() < vence) {
            const r = await UsuarioRepository.obtenerPorId(parseInt(idGuardado, 10));
            if (r.ok && r.data && r.data.activo) {
              const { pin_hash, salt, ...usuarioSeguro } = r.data;
              setSesion({ usuario: usuarioSeguro });
            } else {
              await olvidarSesionGuardada();
            }
          } else if (idGuardado) {
            await olvidarSesionGuardada();
          }
        }
      } catch {
        setHayAdmin(false);
      } finally {
        setCargando(false);
      }
    })();
  }, [olvidarSesionGuardada]);

  // Paso 2: toda la lógica de ruteo en un solo efecto, sin race condition
  useEffect(() => {
    if (cargando || hayAdmin === null) return;

    const enAuth = segments[0] === '(auth)';

    if (!sesion) {
      // Sin sesión activa → ir a setup (primera vez) o a login
      if (!hayAdmin) {
        router.replace('/(auth)/setup');
      } else if (!enAuth) {
        router.replace('/(auth)/login');
      }
    } else {
      // Con sesión activa → si está en auth, llevar a la app
      if (enAuth) {
        router.replace('/(tabs)/ventas');
      }
    }
  }, [sesion, segments, cargando, hayAdmin]);

  const cerrarSesion = useCallback(() => {
    setSesion(null);
    olvidarSesionGuardada();
  }, [olvidarSesionGuardada]);

  // Al volver a primer plano, comprobar si la sesión venció mientras la app
  // estaba cerrada o en segundo plano.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (estado) => {
      if (estado !== 'active' || !sesion) return;
      const expiraEn = await ConfigRepository.obtener(CLAVES.SESION_EXPIRA_EN);
      const vence = expiraEn ? parseInt(expiraEn, 10) : 0;
      if (!vence || Date.now() >= vence) cerrarSesion();
    });
    return () => sub.remove();
  }, [sesion, cerrarSesion]);

  const iniciarSesion = useCallback((usuario: Usuario) => {
    // Nunca conservar credenciales en memoria
    const { pin_hash, salt, ...usuarioSeguro } = usuario;
    setSesion({ usuario: usuarioSeguro });
    setHayAdmin(true);
    // Persistir para no pedir el PIN en cada arranque durante la jornada
    ConfigRepository.guardar(CLAVES.SESION_USUARIO_ID, String(usuario.id)).catch(() => {});
    ConfigRepository.guardar(
      CLAVES.SESION_EXPIRA_EN,
      String(Date.now() + SESION_DURACION_MS)
    ).catch(() => {});
  }, []);

  return (
    <SesionContext.Provider
      value={{
        sesion,
        cargando,
        iniciarSesion,
        cerrarSesion,
        esAdmin: sesion?.usuario.rol === 'admin',
      }}
    >
      {children}
    </SesionContext.Provider>
  );
}

export function useSesion(): SesionContextValue {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return ctx;
}

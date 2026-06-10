import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { UsuarioRepository } from '../database/repositories/UsuarioRepository';
import type { Usuario, SesionActiva } from '../types';

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

  // Paso 1: verificar si hay admin configurado (solo al arrancar)
  useEffect(() => {
    UsuarioRepository.hayAdminConfigurado()
      .then((existe) => {
        setHayAdmin(existe);
        setCargando(false);
      })
      .catch(() => {
        setHayAdmin(false);
        setCargando(false);
      });
  }, []);

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

  const iniciarSesion = useCallback((usuario: Usuario) => {
    // Nunca conservar credenciales en memoria
    const { pin_hash, salt, ...usuarioSeguro } = usuario;
    setSesion({ usuario: usuarioSeguro });
    setHayAdmin(true);
  }, []);

  const cerrarSesion = useCallback(() => {
    setSesion(null);
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

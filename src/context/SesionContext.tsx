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
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Al arrancar: verificar si hay admin configurado
    (async () => {
      const hayAdmin = await UsuarioRepository.hayAdminConfigurado();
      if (!hayAdmin) {
        // Primera vez — redirigir a setup
        router.replace('/(auth)/setup');
      }
      setCargando(false);
    })();
  }, []);

  // Proteger rutas: si no hay sesión y no está en auth, redirigir a login
  useEffect(() => {
    if (cargando) return;
    const enAuth = segments[0] === '(auth)';
    if (!sesion && !enAuth) {
      router.replace('/(auth)/login');
    }
  }, [sesion, segments, cargando]);

  const iniciarSesion = useCallback((usuario: Usuario) => {
    // Guardamos el usuario sin el pin_hash — nunca vive en memoria
    const { pin_hash, ...usuarioSeguro } = usuario;
    setSesion({ usuario: usuarioSeguro });
    router.replace('/(tabs)/ventas');
  }, [router]);

  const cerrarSesion = useCallback(() => {
    setSesion(null);
    router.replace('/(auth)/login');
  }, [router]);

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

import { Platform } from 'react-native';

/**
 * URL base del backend StockVoz.
 *
 * Android emulator usa 10.0.2.2 para alcanzar el host (no localhost).
 * iOS simulator y dispositivos físicos en la misma LAN usan localhost
 * o la IP local de la PC de desarrollo (cambiar abajo si es necesario).
 *
 * En producción esta URL apuntará al VPS Hostinger:
 *   https://api.stockvoz.app
 */
function resolverBackend(): string {
  // Variable de entorno opcional para overrides
  // @ts-ignore
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    // @ts-ignore
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (__DEV__) {
    // Emulador Android — 10.0.2.2 es el alias del host
    if (Platform.OS === 'android') return 'http://10.0.2.2:8000';
    // iOS simulator y web
    return 'http://localhost:8000';
  }

  return 'https://api.stockvoz.app';
}

export const API_BASE_URL = resolverBackend();
export const API_ENDPOINTS = {
  health:    `${API_BASE_URL}/api/health`,
  register:  `${API_BASE_URL}/api/auth/register`,
  login:     `${API_BASE_URL}/api/auth/login`,
  logout:    `${API_BASE_URL}/api/auth/logout`,
  me:        `${API_BASE_URL}/api/auth/me`,
  sync:      `${API_BASE_URL}/api/sync`,
  productos: `${API_BASE_URL}/api/productos`,
} as const;

export const TIMEOUT_MS = 10_000;

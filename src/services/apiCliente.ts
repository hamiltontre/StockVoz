import { API_ENDPOINTS, TIMEOUT_MS } from '../config/api';
import { ConfigRepository, CLAVES } from '../database/repositories/ConfigRepository';

export interface RespuestaAuth {
  usuario: { id: number; nombre: string; email: string; rol: string };
  negocio: { id: number; nombre: string; plan: string };
  token: string;
}

export interface DatosRegistro {
  nombre_negocio: string;
  nombre_admin: string;
  email: string;
  password: string;
  pin: string;
  telefono?: string;
}

async function fetchConTimeout(url: string, opciones: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opciones, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const ApiCliente = {
  async health(): Promise<boolean> {
    try {
      const resp = await fetchConTimeout(API_ENDPOINTS.health, { method: 'GET' });
      return resp.ok;
    } catch {
      return false;
    }
  },

  async login(email: string, password: string): Promise<RespuestaAuth> {
    const resp = await fetchConTimeout(API_ENDPOINTS.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body.error ?? `Error ${resp.status}`);
    }
    const data: RespuestaAuth = await resp.json();
    await ConfigRepository.guardar(CLAVES.API_TOKEN, data.token);
    await ConfigRepository.guardar(CLAVES.NEGOCIO_REMOTO_ID, String(data.negocio.id));
    return data;
  },

  async registrar(datos: DatosRegistro): Promise<RespuestaAuth> {
    const resp = await fetchConTimeout(API_ENDPOINTS.register, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        ...datos,
        password_confirmation: datos.password,
        moneda: 'NIO',
      }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const mensaje = body.message ?? body.error ?? `Error ${resp.status}`;
      throw new Error(mensaje);
    }
    const data: RespuestaAuth = await resp.json();
    await ConfigRepository.guardar(CLAVES.API_TOKEN, data.token);
    await ConfigRepository.guardar(CLAVES.NEGOCIO_REMOTO_ID, String(data.negocio.id));
    return data;
  },

  async logout(): Promise<void> {
    const token = await ConfigRepository.obtener(CLAVES.API_TOKEN);
    if (token) {
      try {
        await fetchConTimeout(API_ENDPOINTS.logout, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch {
        // best-effort
      }
    }
    await ConfigRepository.eliminar(CLAVES.API_TOKEN);
    await ConfigRepository.eliminar(CLAVES.NEGOCIO_REMOTO_ID);
  },

  async estaAutenticado(): Promise<boolean> {
    return (await ConfigRepository.obtener(CLAVES.API_TOKEN)) !== null;
  },
};

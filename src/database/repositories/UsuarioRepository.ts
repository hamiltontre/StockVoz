import { getDb } from '../db';
import { hashPin, verificarPin, generarSalt } from '../../utils/hash';
import type { Usuario, CrearUsuarioDTO, RolUsuario, Result } from '../../types';

const NEGOCIO_ID = 1;

function rowToUsuario(row: Record<string, unknown>): Usuario {
  return {
    id: row.id as number,
    negocio_id: row.negocio_id as number,
    nombre: row.nombre as string,
    rol: row.rol as RolUsuario,
    pin_hash: row.pin_hash as string,
    salt: (row.salt as string) ?? '',
    activo: (row.activo as number) === 1,
    creado_en: row.creado_en as string,
    ultimo_acceso: (row.ultimo_acceso as string) ?? null,
  };
}

function validarPin(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'El PIN debe ser exactamente 4 dígitos numéricos';
  return null;
}

export const UsuarioRepository = {
  async obtenerTodos(): Promise<Result<Usuario[]>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM usuarios WHERE negocio_id = ? ORDER BY rol ASC, nombre ASC',
        [NEGOCIO_ID]
      );
      return { ok: true, data: rows.map(rowToUsuario) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async obtenerPorId(id: number): Promise<Result<Usuario | null>> {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM usuarios WHERE id = ?',
        [id]
      );
      return { ok: true, data: row ? rowToUsuario(row) : null };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async crear(dto: CrearUsuarioDTO): Promise<Result<Usuario>> {
    try {
      if (!dto.nombre.trim()) return { ok: false, error: 'El nombre es requerido' };
      const pinError = validarPin(dto.pin);
      if (pinError) return { ok: false, error: pinError };

      // Solo puede haber un admin
      if (dto.rol === 'admin') {
        const db = await getDb();
        const adminExiste = await db.getFirstAsync<{ count: number }>(
          "SELECT COUNT(*) as count FROM usuarios WHERE negocio_id = ? AND rol = 'admin' AND activo = 1",
          [NEGOCIO_ID]
        );
        if ((adminExiste?.count ?? 0) > 0) {
          return { ok: false, error: 'Ya existe un administrador. Solo puede haber uno.' };
        }
      }

      const db = await getDb();
      const salt = generarSalt();
      const result = await db.runAsync(
        'INSERT INTO usuarios (negocio_id, nombre, rol, pin_hash, salt) VALUES (?, ?, ?, ?, ?)',
        [NEGOCIO_ID, dto.nombre.trim(), dto.rol, hashPin(dto.pin, salt), salt]
      );
      const created = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM usuarios WHERE id = ?',
        [result.lastInsertRowId]
      );
      return { ok: true, data: rowToUsuario(created!) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async cambiarPin(id: number, pinActual: string, pinNuevo: string): Promise<Result<void>> {
    try {
      const pinNuevoError = validarPin(pinNuevo);
      if (pinNuevoError) return { ok: false, error: pinNuevoError };

      const db = await getDb();
      const row = await db.getFirstAsync<{ pin_hash: string; salt: string }>(
        'SELECT pin_hash, salt FROM usuarios WHERE id = ?',
        [id]
      );
      if (!row) return { ok: false, error: 'Usuario no encontrado' };
      if (!verificarPin(pinActual, row.salt, row.pin_hash)) {
        return { ok: false, error: 'PIN actual incorrecto' };
      }

      // Generar NUEVO salt al cambiar el PIN (mejor práctica)
      const nuevoSalt = generarSalt();
      await db.runAsync(
        'UPDATE usuarios SET pin_hash = ?, salt = ? WHERE id = ?',
        [hashPin(pinNuevo, nuevoSalt), nuevoSalt, id]
      );
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async resetearPin(id: number, pinNuevo: string): Promise<Result<void>> {
    try {
      const pinError = validarPin(pinNuevo);
      if (pinError) return { ok: false, error: pinError };

      const db = await getDb();
      const nuevoSalt = generarSalt();
      await db.runAsync(
        'UPDATE usuarios SET pin_hash = ?, salt = ? WHERE id = ?',
        [hashPin(pinNuevo, nuevoSalt), nuevoSalt, id]
      );
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async desactivar(id: number): Promise<Result<void>> {
    try {
      const db = await getDb();
      // No permitir desactivar al único admin activo
      const usuario = await db.getFirstAsync<{ rol: string }>(
        'SELECT rol FROM usuarios WHERE id = ?',
        [id]
      );
      if (usuario?.rol === 'admin') {
        const otrosAdmins = await db.getFirstAsync<{ count: number }>(
          "SELECT COUNT(*) as count FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id != ?",
          [id]
        );
        if ((otrosAdmins?.count ?? 0) === 0) {
          return { ok: false, error: 'No puedes eliminar el único administrador' };
        }
      }
      await db.runAsync('UPDATE usuarios SET activo = 0 WHERE id = ?', [id]);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async autenticar(nombre: string, pin: string): Promise<Result<Usuario>> {
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM usuarios WHERE negocio_id = ? AND activo = 1 AND nombre = ?',
        [NEGOCIO_ID, nombre.trim()]
      );
      if (!rows.length) return { ok: false, error: 'Usuario no encontrado' };

      const usuario = rowToUsuario(rows[0]);
      if (!verificarPin(pin, usuario.salt, usuario.pin_hash)) {
        return { ok: false, error: 'PIN incorrecto' };
      }

      // Actualizar último acceso
      await db.runAsync(
        "UPDATE usuarios SET ultimo_acceso = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        [usuario.id]
      );
      return { ok: true, data: usuario };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async hayAdminConfigurado(): Promise<boolean> {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM usuarios WHERE rol = 'admin' AND activo = 1"
      );
      return (row?.count ?? 0) > 0;
    } catch {
      return false;
    }
  },
};

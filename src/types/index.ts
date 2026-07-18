// ─── Entidades de dominio ────────────────────────────────────────────────────

export type PlanNegocio = 'basico' | 'premium' | 'empresarial';

export interface Negocio {
  id: number;
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  direccion: string | null;
  moneda: string;         // 'NIO' | 'USD'
  plan: 'basico' | 'premium' | 'empresarial';
  creado_en: string;      // ISO-8601
  actualizado_en: string;
}

export interface Categoria {
  id: number;
  nombre: string;
  creado_en: string;
}

export type UnidadProducto =
  | 'unidad' | 'caja' | 'docena' | 'libra'
  | 'litro' | 'metro' | 'par' | 'paquete';

export interface Producto {
  id: number;
  nombre: string;
  codigo_barras: string | null;
  precio: number;            // precio de VENTA en centavos
  precio_costo: number;      // precio de COMPRA en centavos — para calcular ganancia
  precio_docena: number;     // precio por DOCENA en centavos (0 = no se vende por docena)
  stock: number;             // puede ser fraccionario (9.5 libras)
  stock_minimo: number;      // alerta cuando baje de aquí
  fecha_vencimiento: string | null; // ISO-8601 yyyy-mm-dd, null si no aplica
  unidad: UnidadProducto;
  categoria_id: number | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface PalabraClave {
  id: number;
  producto_id: number;
  palabra: string;         // lo que dice el usuario por voz
}

export type EstadoVenta = 'completada' | 'anulada';
export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia';

export interface Venta {
  id: number;
  negocio_id: number;
  total: number;           // en centavos
  descuento: number;       // en centavos
  metodo_pago: MetodoPago;
  estado: EstadoVenta;
  notas: string | null;
  // ─── Fiado (venta al crédito, el "cuaderno" de la pulpería) ───
  es_fiado: boolean;
  fiador_nombre: string | null;   // quién debe
  fiado_pagado_en: string | null; // null = todavía debe
  creado_en: string;
}

/** Resumen del cuaderno de fiados: cuánto debe cada persona. */
export interface FiadorResumen {
  fiador_nombre: string;
  total_deuda: number;      // centavos
  cantidad_ventas: number;
  /** Días desde el fiado MÁS VIEJO sin pagar de esta persona. */
  dias_deuda_mas_vieja: number;
}

export interface DetalleVenta {
  id: number;
  venta_id: number;
  producto_id: number;
  nombre_producto: string; // snapshot para histórico (si cambia el nombre después)
  cantidad: number;
  precio_unitario: number; // snapshot del precio al momento de la venta
  subtotal: number;
}

export interface ItemSyncQueue {
  id: number;
  tabla: string;
  operacion: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string;         // JSON
  intentos: number;
  creado_en: string;
  sincronizado_en: string | null;
}

// ─── DTOs para operaciones ────────────────────────────────────────────────────

export type CrearProductoDTO = Omit<Producto, 'id' | 'creado_en' | 'actualizado_en' | 'activo'>;
export type ActualizarProductoDTO = Partial<CrearProductoDTO>;

export interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

export interface CrearVentaDTO {
  items: ItemCarrito[];
  descuento: number;
  metodo_pago: MetodoPago;
  notas?: string;
  /** Nombre del fiador — su presencia marca la venta como fiada. */
  fiador?: string;
}

export interface VentaConDetalle extends Venta {
  items: DetalleVenta[];
}

// ─── Resultado estándar para operaciones de repositorio ──────────────────────

// ─── Usuarios ─────────────────────────────────────────────────────────────────

export type RolUsuario = 'admin' | 'invitado';

export interface Usuario {
  id: number;
  negocio_id: number;
  nombre: string;
  rol: RolUsuario;
  pin_hash: string;
  salt: string;
  activo: boolean;
  creado_en: string;
  ultimo_acceso: string | null;
}

export type CrearUsuarioDTO = {
  nombre: string;
  rol: RolUsuario;
  pin: string; // 4 dígitos — se hashea antes de guardar
};

// Sesión activa en memoria (nunca persiste credenciales)
export interface SesionActiva {
  usuario: Omit<Usuario, 'pin_hash' | 'salt'>;
}

// ─── Resultado estándar para operaciones de repositorio ──────────────────────

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

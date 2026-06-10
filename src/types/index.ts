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

export interface Producto {
  id: number;
  nombre: string;
  codigo_barras: string | null;
  precio: number;          // en centavos para evitar errores de punto flotante
  stock: number;
  stock_minimo: number;    // alerta cuando baje de aquí
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
  creado_en: string;
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

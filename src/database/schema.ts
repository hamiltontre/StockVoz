// Versión actual del esquema. Incrementar cuando se añadan migraciones.
export const SCHEMA_VERSION = 1;

// Todas las sentencias DDL. Cada array es una transacción atómica.
export const SCHEMA_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS negocios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT    NOT NULL,
    ruc           TEXT,
    telefono      TEXT,
    direccion     TEXT,
    moneda        TEXT    NOT NULL DEFAULT 'NIO'
                          CHECK(moneda IN ('NIO','USD')),
    plan          TEXT    NOT NULL DEFAULT 'basico'
                          CHECK(plan IN ('basico','premium','empresarial')),
    creado_en     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    actualizado_en TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS categorias (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre    TEXT    NOT NULL UNIQUE,
    creado_en TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS productos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre         TEXT    NOT NULL,
    codigo_barras  TEXT    UNIQUE,
    precio         INTEGER NOT NULL CHECK(precio >= 0),
    stock          INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    stock_minimo   INTEGER NOT NULL DEFAULT 1 CHECK(stock_minimo >= 0),
    categoria_id   INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
    activo         INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0,1)),
    creado_en      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    actualizado_en TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo)`,
  `CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id)`,

  `CREATE TABLE IF NOT EXISTS palabras_clave (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    palabra     TEXT    NOT NULL,
    UNIQUE(producto_id, palabra)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_palabras_clave_palabra ON palabras_clave(palabra)`,

  `CREATE TABLE IF NOT EXISTS ventas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    negocio_id  INTEGER NOT NULL REFERENCES negocios(id),
    total       INTEGER NOT NULL CHECK(total >= 0),
    descuento   INTEGER NOT NULL DEFAULT 0 CHECK(descuento >= 0),
    metodo_pago TEXT    NOT NULL DEFAULT 'efectivo'
                        CHECK(metodo_pago IN ('efectivo','tarjeta','transferencia')),
    estado      TEXT    NOT NULL DEFAULT 'completada'
                        CHECK(estado IN ('completada','anulada')),
    notas       TEXT,
    creado_en   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_ventas_creado ON ventas(creado_en)`,
  `CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(estado)`,

  `CREATE TABLE IF NOT EXISTS detalle_ventas (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id         INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id      INTEGER NOT NULL REFERENCES productos(id),
    nombre_producto  TEXT    NOT NULL,
    cantidad         INTEGER NOT NULL CHECK(cantidad > 0),
    precio_unitario  INTEGER NOT NULL CHECK(precio_unitario >= 0),
    subtotal         INTEGER NOT NULL CHECK(subtotal >= 0)
  )`,

  `CREATE TABLE IF NOT EXISTS sync_queue (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    tabla            TEXT    NOT NULL,
    operacion        TEXT    NOT NULL CHECK(operacion IN ('INSERT','UPDATE','DELETE')),
    payload          TEXT    NOT NULL,
    intentos         INTEGER NOT NULL DEFAULT 0,
    creado_en        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    sincronizado_en  TEXT
  )`,

  // Negocio por defecto para v1 (single-tenant)
  `INSERT OR IGNORE INTO negocios (id, nombre, moneda, plan)
   VALUES (1, 'Mi Negocio', 'NIO', 'basico')`,

  // Categoría sin clasificar siempre disponible
  `INSERT OR IGNORE INTO categorias (id, nombre) VALUES (1, 'Sin categoría')`,
];

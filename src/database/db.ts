import * as SQLite from 'expo-sqlite';

// Cacheamos la PROMESA de inicialización, no la conexión ya resuelta.
// Esto es clave: en el arranque muchos componentes llaman a getDb() de
// forma concurrente. Si solo cacheáramos la conexión resuelta, todas esas
// llamadas verían el caché vacío y CADA UNA abriría su propia conexión a la
// misma base (condición de carrera). expo-sqlite invalida las conexiones
// huérfanas y sus prepareAsync fallan con NullPointerException.
// Al cachear la promesa, todos los llamadores concurrentes esperan la MISMA
// inicialización y comparten UNA sola conexión.
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync('stockvoz.db');
    try {
      await configurarPragmas(db);
      await correrMigraciones(db);
      // Consolidar el WAL en el archivo principal para que no crezca sin
      // límite tras muchas migraciones/escrituras.
      try { await db.runAsync('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
    } catch (e) {
      // Si la init falla, descartamos la promesa para reintentar limpio
      // en la próxima llamada (sin dejar una conexión rota cacheada).
      _dbPromise = null;
      try { await db.closeAsync(); } catch {}
      throw e;
    }
    return db;
  })();
  return _dbPromise;
}

/**
 * PRAGMAs de configuración.
 * Usamos runAsync (no execAsync) porque execAsync abre una transacción
 * implícita y WAL no puede cambiar dentro de una transacción.
 */
async function configurarPragmas(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync('PRAGMA journal_mode = WAL');
  await db.runAsync('PRAGMA foreign_keys = ON');
  await db.runAsync('PRAGMA synchronous = NORMAL');
}

/**
 * Sistema de migraciones incremental.
 * Cada migración solo corre una vez: cuando user_version < su número.
 * Agregar nuevas versiones aquí sin tocar las anteriores.
 */
const MIGRACIONES: Array<{ version: number; sentencias: string[] }> = [
  {
    version: 1,
    sentencias: [
      `CREATE TABLE IF NOT EXISTS negocios (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre         TEXT    NOT NULL,
        ruc            TEXT,
        telefono       TEXT,
        direccion      TEXT,
        moneda         TEXT    NOT NULL DEFAULT 'NIO'
                               CHECK(moneda IN ('NIO','USD')),
        plan           TEXT    NOT NULL DEFAULT 'basico'
                               CHECK(plan IN ('basico','premium','empresarial')),
        creado_en      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        actualizado_en TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
      `CREATE INDEX IF NOT EXISTS idx_productos_activo    ON productos(activo)`,
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
      // Datos semilla — idempotentes gracias a OR IGNORE
      `INSERT OR IGNORE INTO negocios (id, nombre, moneda, plan)
       VALUES (1, 'Mi Negocio', 'NIO', 'basico')`,
      `INSERT OR IGNORE INTO categorias (id, nombre) VALUES (1, 'Sin categoria')`,
    ],
  },
  {
    version: 2,
    sentencias: [
      // PIN guardado como SHA-256 hex — nunca en texto plano
      `CREATE TABLE IF NOT EXISTS usuarios (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        negocio_id    INTEGER NOT NULL REFERENCES negocios(id),
        nombre        TEXT    NOT NULL,
        rol           TEXT    NOT NULL DEFAULT 'invitado'
                              CHECK(rol IN ('admin','invitado')),
        pin_hash      TEXT    NOT NULL,
        activo        INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0,1)),
        creado_en     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        ultimo_acceso TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_usuarios_negocio ON usuarios(negocio_id)`,
    ],
  },
  {
    // Migración v3 — salt único por usuario.
    // Reemplaza el salt global hardcodeado por uno aleatorio por usuario,
    // imposibilitando rainbow-tables y aislando el daño si un hash se filtra.
    // Los usuarios existentes deben re-crear su PIN — se vacía la tabla
    // (en un proyecto en producción se haría una migración más sofisticada,
    // pero en esta etapa de desarrollo es seguro).
    version: 3,
    sentencias: [
      `ALTER TABLE usuarios ADD COLUMN salt TEXT NOT NULL DEFAULT ''`,
      // Vaciar usuarios previos — fueron creados con salt global obsoleto
      `DELETE FROM usuarios`,
    ],
  },
  {
    // Migración v4 — config persistente.
    // Tabla key-value para guardar token de API, IDs remotos y futuras prefs
    // sin agregar AsyncStorage como dependencia.
    version: 4,
    sentencias: [
      `CREATE TABLE IF NOT EXISTS app_config (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL,
        actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
    ],
  },
  {
    // Migración v5 — negocio real: rentabilidad y vencimientos.
    // precio_costo permite calcular la ganancia real, no solo el ingreso.
    // fecha_vencimiento es crítico para farmacias y pulperías.
    // unidad de medida hace inteligente la interpretación de voz
    // ("dos cajas de Tylenol" vs "dos pastillas de Tylenol").
    version: 5,
    sentencias: [
      `ALTER TABLE productos ADD COLUMN precio_costo INTEGER NOT NULL DEFAULT 0 CHECK(precio_costo >= 0)`,
      `ALTER TABLE productos ADD COLUMN fecha_vencimiento TEXT`,
      `ALTER TABLE productos ADD COLUMN unidad TEXT NOT NULL DEFAULT 'unidad'
         CHECK(unidad IN ('unidad','caja','docena','libra','litro','metro','par','paquete'))`,
      `CREATE INDEX IF NOT EXISTS idx_productos_vencimiento ON productos(fecha_vencimiento)`,
    ],
  },
  {
    // Migración v6 — precio por docena (ferreterías/pulperías).
    // Un producto puede tener precio por unidad Y por docena (más barato).
    // 0 = no se vende por docena. El stock sigue contándose en la unidad
    // base del producto; vender "una docena" descuenta 12 unidades.
    // NOTA: las cantidades fraccionarias (media libra = 0.5) NO requieren
    // migración: SQLite guarda 0.5 como REAL aunque la columna declare
    // INTEGER (afinidad de tipos), y los CHECK (> 0, >= 0) siguen válidos.
    version: 6,
    sentencias: [
      `ALTER TABLE productos ADD COLUMN precio_docena INTEGER NOT NULL DEFAULT 0 CHECK(precio_docena >= 0)`,
    ],
  },
];

/**
 * Verifica si una columna existe en una tabla.
 */
async function columnExiste(db: SQLite.SQLiteDatabase, tabla: string, columna: string): Promise<boolean> {
  try {
    const info = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${tabla})`
    );
    return info.some((col) => col.name === columna);
  } catch {
    return false;
  }
}

async function correrMigraciones(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let versionActual = row?.user_version ?? 0;

  for (const migracion of MIGRACIONES) {
    if (versionActual >= migracion.version) continue;

    try {
      // Usamos runAsync para BEGIN/COMMIT/ROLLBACK (no withTransactionAsync ni execAsync)
      // porque execAsync abre transacciones implícitas que chocan con las explícitas en Android
      await db.runAsync('BEGIN');
      try {
        for (const sql of migracion.sentencias) {
          if (sql.includes('ALTER TABLE')) {
            const addColMatch = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/i);
            if (addColMatch) {
              const [, tabla, columna] = addColMatch;
              if (await columnExiste(db, tabla, columna)) {
                continue;
              }
            }
          }
          await db.runAsync(sql);
        }
        await db.runAsync('COMMIT');
      } catch (inner) {
        try { await db.runAsync('ROLLBACK'); } catch {}
        throw inner;
      }
      // PRAGMA user_version siempre fuera de transacción
      await db.runAsync(`PRAGMA user_version = ${migracion.version}`);
    } catch (e) {
      console.warn(`[DB] Migración v${migracion.version} error:`, String(e));
      throw e;
    }
    versionActual = migracion.version;
  }
}

export async function closeDb(): Promise<void> {
  if (_dbPromise) {
    const promesa = _dbPromise;
    _dbPromise = null;
    try {
      const db = await promesa;
      await db.closeAsync();
    } catch {
      // si la init había fallado, no hay nada que cerrar
    }
  }
}

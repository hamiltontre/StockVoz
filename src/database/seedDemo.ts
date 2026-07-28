import { getDb } from './db';
import { ProductoRepository } from './repositories/ProductoRepository';
import type { CrearProductoDTO, UnidadProducto } from '../types';

/**
 * Inventario de ejemplo con productos reales del comercio nicaragüense.
 *
 * Sirve para dos cosas: probar la app sin capturar 30 productos a mano, y
 * demostrarla a un cliente potencial con datos que reconoce. Cubre los
 * cuatro rubros del mercado objetivo (pulpería, farmacia, ferretería,
 * ropa) y a propósito incluye los casos difíciles: marcas que el
 * reconocedor no conoce, nombres con medidas adentro ("12 onzas"),
 * productos por libra, por docena y con vencimiento.
 */

interface ProductoDemo extends Omit<CrearProductoDTO, 'codigo_barras' | 'categoria_id'> {
  /** Sinónimos y formas en que el reconocedor suele escribir la marca. */
  claves?: string[];
}

const P = (
  nombre: string,
  precio: number,          // córdobas
  costo: number,
  stock: number,
  unidad: UnidadProducto = 'unidad',
  extra: { docena?: number; vence?: string; claves?: string[]; minimo?: number } = {}
): ProductoDemo => ({
  nombre,
  precio: Math.round(precio * 100),
  precio_costo: Math.round(costo * 100),
  precio_docena: extra.docena ? Math.round(extra.docena * 100) : 0,
  stock,
  stock_minimo: extra.minimo ?? 5,
  fecha_vencimiento: extra.vence ?? null,
  unidad,
  claves: extra.claves,
});

export const PRODUCTOS_DEMO: ProductoDemo[] = [
  // ─── Pulpería ───────────────────────────────────────────────────────
  P('Arroz Faisán', 28, 22, 50, 'libra', { claves: ['arroz faisan', 'faisan', 'ropa sam'] }),
  P('Arroz Tío Pelón', 30, 24, 40, 'libra', { claves: ['tio pelon', 'arroz tio pelon'] }),
  P('Frijol rojo', 35, 28, 60, 'libra', { claves: ['frijoles', 'frijol'] }),
  P('Azúcar', 22, 18, 45, 'libra', { claves: ['azucar'] }),
  P('Maseca', 25, 20, 30, 'libra', { claves: ['masa', 'harina maseca'] }),
  P('Aceite Corona 1 litro', 85, 70, 20, 'unidad', { claves: ['aceite', 'aceite corona'] }),
  P('Leche Eskimo 1 litro', 45, 38, 15, 'unidad', { claves: ['leche', 'eskimo'] }),
  P('Coca Cola 350 ml', 20, 15, 48, 'unidad', { docena: 220, claves: ['coca', 'coca cola', 'gaseosa'] }),
  P('Fanta Naranja 12 onzas', 18, 14, 36, 'unidad', { docena: 200, claves: ['fanta', 'fanta naranja'] }),
  P('Café Presto bolsita', 12, 9, 40, 'unidad', { claves: ['cafe presto', 'presto', 'cafe'] }),
  P('Maruchan', 15, 11, 60, 'unidad', { claves: ['sopa maruchan', 'sopa instantanea'] }),
  P('Consomé de pollo', 5, 3.5, 80, 'unidad', { claves: ['consome pollo', 'consume pollo'] }),
  P('Consomé de res', 5, 3.5, 80, 'unidad', { claves: ['consome res', 'consume res'] }),
  P('Pan simple', 5, 3, 30, 'unidad', { claves: ['pan'] }),
  P('Huevos', 6, 4.5, 90, 'unidad', { docena: 65, claves: ['huevo'] }),
  P('Bananos', 4, 2.5, 60, 'unidad', { docena: 40, claves: ['banano', 'guineo'] }),
  P('Tomate', 25, 18, 25, 'libra', { claves: ['tomates'] }),
  P('Pierna de pollo', 48, 40, 30, 'libra', { claves: ['pierna pollo', 'pierna'] }),
  P('Pechuga de pollo', 62, 52, 25, 'libra', { claves: ['pechuga', 'pechuga pollo'] }),
  P('Jabón Xtra', 14, 10, 40, 'unidad', { claves: ['jabon', 'jabon xtra'] }),
  P('Papel higiénico', 12, 8, 50, 'unidad', { claves: ['papel', 'papel higienico'] }),

  // ─── Farmacia ───────────────────────────────────────────────────────
  P('Acetaminofén 500mg', 3, 2, 200, 'unidad', {
    vence: '2027-06-30', claves: ['acetaminofen', 'pastilla dolor', 'panadol'],
  }),
  P('Ibuprofeno 400mg', 4, 2.5, 150, 'unidad', {
    vence: '2027-03-31', claves: ['ibuprofeno', 'antiinflamatorio'],
  }),
  P('Amoxicilina 500mg', 8, 6, 60, 'unidad', {
    vence: '2026-11-30', claves: ['amoxicilina', 'antibiotico'],
  }),
  P('Suero oral', 18, 14, 40, 'unidad', { vence: '2027-01-31', claves: ['suero', 'electrolitos'] }),
  P('Alcohol 70% 250ml', 35, 28, 25, 'unidad', { claves: ['alcohol'] }),
  P('Curitas', 2, 1.2, 120, 'unidad', { docena: 20, claves: ['curita', 'bandita'] }),

  // ─── Ferretería ─────────────────────────────────────────────────────
  P('Clavos 2 pulgadas', 45, 35, 30, 'libra', { claves: ['clavos', 'clavo'] }),
  P('Tornillos', 3, 2, 200, 'unidad', { docena: 30, claves: ['tornillo'] }),
  P('Martillo', 180, 140, 8, 'unidad', { minimo: 2, claves: ['martillo'] }),
  P('Cinta métrica', 120, 95, 10, 'unidad', { minimo: 2, claves: ['cinta metrica', 'metro'] }),
  P('Foco LED 9W', 65, 50, 24, 'unidad', { docena: 700, claves: ['foco', 'bombillo', 'foco led'] }),
  P('Cemento', 320, 280, 15, 'unidad', { minimo: 3, claves: ['cemento', 'bolsa cemento'] }),
  P('Pintura blanca galón', 450, 380, 6, 'unidad', { minimo: 2, claves: ['pintura', 'pintura blanca'] }),

  // ─── Ropa ───────────────────────────────────────────────────────────
  P('Camiseta blanca', 150, 100, 20, 'unidad', { claves: ['camiseta', 'camisa blanca'] }),
  P('Calcetines', 45, 30, 30, 'par', { docena: 480, claves: ['calcetin', 'medias'] }),
  P('Gorra', 180, 130, 12, 'unidad', { minimo: 3, claves: ['gorra'] }),
  P('Pantalón jeans', 480, 350, 10, 'unidad', { minimo: 2, claves: ['pantalon', 'jeans'] }),
];

export interface ResultadoSeed {
  creados: number;
  omitidos: number;
  claves: number;
  errores: string[];
}

/**
 * Carga el inventario de ejemplo. NO borra nada: si un producto ya existe
 * (mismo nombre) se omite, así se puede correr sobre un negocio real sin
 * riesgo de duplicar o perder datos.
 */
export async function cargarProductosDemo(): Promise<ResultadoSeed> {
  const res: ResultadoSeed = { creados: 0, omitidos: 0, claves: 0, errores: [] };
  const db = await getDb();

  for (const demo of PRODUCTOS_DEMO) {
    try {
      const existe = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM productos WHERE nombre = ? COLLATE NOCASE AND activo = 1',
        [demo.nombre]
      );
      if (existe) { res.omitidos++; continue; }

      const { claves, ...dto } = demo;
      const creado = await ProductoRepository.crear({
        ...dto,
        codigo_barras: null,
        categoria_id: null,
      });
      if (!creado.ok) { res.errores.push(`${demo.nombre}: ${creado.error}`); continue; }
      res.creados++;

      for (const clave of claves ?? []) {
        const r = await ProductoRepository.agregarPalabraClave(creado.data.id, clave);
        if (r.ok) res.claves++;
      }
    } catch (e) {
      res.errores.push(`${demo.nombre}: ${String(e)}`);
    }
  }
  return res;
}

/**
 * Pruebas del motor de voz SIN teléfono.
 *
 * POR QUÉ: cada mejora del reconocimiento se venía comprobando dictando a
 * mano en el teléfono, producto por producto. Eso es lento y no detecta
 * regresiones: se arregla una marca y se rompe otra sin que nadie lo note.
 * Acá el parser y la búsqueda corren en Node contra el inventario real.
 *
 *   node scripts/probar-voz.mjs
 *
 * Falla con código 1 si algo se rompe, para poder meterlo en CI.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const salida = join(tmpdir(), 'stockvoz-parser.mjs');
mkdirSync(tmpdir(), { recursive: true });
execSync(
  `npx esbuild src/utils/vozParser.ts --bundle --format=esm --outfile="${salida}" --log-level=error`,
  { stdio: 'inherit' }
);
const P = await import(pathToFileURL(salida).href);

const nombres = [
  ...readFileSync('src/database/seedDemo.ts', 'utf8').matchAll(/P\('([^']+)'/g),
].map((m) => m[1]);
const productos = nombres.map((n) => ({ nombre: n }));

let fallos = 0;
const check = (cond, etiqueta, detalle = '') => {
  if (!cond) fallos++;
  console.log(`${cond ? '  OK ' : '  FALLA '} ${etiqueta}${detalle ? '  ' + detalle : ''}`);
};

console.log(`\nInventario de prueba: ${productos.length} productos\n`);

// ── 1. Decir el nombre completo debe llevar a ESE producto ───────────────
console.log('1) Nombre exacto por el pipeline completo');
let ok = 0;
const malos = [];
for (const n of nombres) {
  const seg = P.parsearMultiplesProductos('dos ' + n)[0];
  if (!seg) { malos.push([n, '(no parseó)']); continue; }
  let r = P.seleccionarPorNombre(seg.palabras, productos);
  if (!r.length) r = P.seleccionarPorParecido(seg.palabras, productos);
  if (r.length && r.some((x) => x.nombre === n)) ok++;
  else malos.push([n, r[0]?.nombre ?? '(nada)']);
}
check(ok === nombres.length, `${ok}/${nombres.length} productos`);
malos.forEach(([n, g]) => console.log(`       "${n}" → ${g}`));

// ── 2. Errores típicos del reconocedor: oye bien, escribe mal ────────────
console.log('\n2) Errores de ortografía del reconocedor');
const foneticos = [
  ['sedex', 'Detergente Xedex'],
  ['esquimo', 'Leche Eskimo 1 litro'],
  ['faisan', 'Arroz Faisán'],
  ['marucha', 'Maruchan'],
];
for (const [dicho, esperado] of foneticos) {
  const r = P.seleccionarPorParecido(dicho.split(' '), productos);
  check(r[0]?.nombre === esperado, `"${dicho}"`, `→ ${r[0]?.nombre ?? '(nada)'}`);
}

// ── 2b. Una palabra exclusiva alcanza, aunque la otra llegue mal ────────
console.log('\n2b) Palabra exclusiva cuando el reconocedor arruina la otra');
{
  // "sedal" no existe en ningún otro producto: no hay nada que adivinar.
  const r = P.seleccionarPorParecido(['champu', 'sedal'], productos);
  check(r[0]?.nombre === 'Shampoo Sedal', '"champu sedal"', `→ ${r[0]?.nombre ?? '(nada)'}`);
  // Pero si dos palabras señalan productos DISTINTOS, no se adivina:
  // "crema" es un producto y "colgate" es otro.
  const amb = P.seleccionarPorParecido(['crema', 'dental', 'colgate'], productos);
  check(amb.length === 0, 'dos palabras que apuntan a productos distintos', '→ no adivina');
  // Palabras de 3 letras no arrastran productos
  check(P.seleccionarPorParecido(['xyz', 'sal'], productos).length === 0,
    '"sal" (3 letras) no arrastra producto');
  // Basura sigue sin encontrar nada
  check(P.seleccionarPorParecido(['cosas', 'raras'], productos).length === 0,
    'palabras inventadas no encuentran nada');
}

// ── 3. No debe volverse tan flexible que confunda productos ─────────────
console.log('\n3) Seguridad: que no confunda productos');
const claveNombre = (n) =>
  n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
    .map(P.claveFonetica).join(' ');
const vistas = new Map();
const choques = [];
for (const n of nombres) {
  const k = claveNombre(n);
  if (vistas.has(k)) choques.push([vistas.get(k), n]);
  else vistas.set(k, n);
}
check(choques.length === 0, 'dos productos distintos que suenan igual', `(${choques.length})`);
choques.forEach((c) => console.log('       ', c));
// Palabras de 3 letras no pueden volverse intercambiables
check(!P.palabraSimilar('pan', 'sal'), 'pan ≠ sal');
check(!P.palabraSimilar('sal', 'sol'), 'sal ≠ sol');

// ── 4. Cantidades: lo que más usa el vendedor ───────────────────────────
console.log('\n4) Cantidades y fracciones');
const cantidades = [
  ['media libra de arroz', 0.5],
  ['libra y media de arroz', 1.5],
  ['tres maruchan', 3],
  ['docena y media de huevos', 1.5],
];
for (const [frase, esperada] of cantidades) {
  const seg = P.parsearMultiplesProductos(frase)[0];
  check(seg?.cantidad === esperada, `"${frase}"`, `→ ${seg?.cantidad}`);
}

// ── 5. Elegir entre las transcripciones que propone el reconocedor ──────
console.log('\n5) Varias transcripciones propuestas');
{
  // La correcta viene de segunda: la primera no reconoce ningún producto.
  const elegida = P.elegirMejorHipotesis(
    ['ropa y sam', 'arroz faisán', 'ro pais an'],
    productos
  );
  check(elegida === 'arroz faisán', 'gana la que reconoce productos', `→ "${elegida}"`);

  // Si ninguna reconoce nada, se respeta el orden del reconocedor.
  const sinNada = P.elegirMejorHipotesis(['xxxx yyyy', 'zzzz wwww'], productos);
  check(sinNada === 'xxxx yyyy', 'sin coincidencias manda el reconocedor', `→ "${sinNada}"`);

  // Una sola propuesta no cambia nada.
  check(P.elegirMejorHipotesis(['tres maruchan'], productos) === 'tres maruchan',
    'una sola propuesta pasa igual');
}

// ── 6. Varios productos en un solo dictado ──────────────────────────────
console.log('\n6) Listas encadenadas');
const lista = P.parsearMultiplesProductos('tres maruchan dos coca cola cinco pan simple');
check(lista.length === 3, 'tres productos en una frase', `→ ${lista.length}`);

console.log(fallos === 0 ? '\nTodo bien.\n' : `\n${fallos} comprobación(es) fallando.\n`);
process.exit(fallos === 0 ? 0 : 1);

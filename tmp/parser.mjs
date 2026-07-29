// src/utils/texto.ts
function normalizarTexto(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// src/utils/vozParser.ts
var NUMEROS_TEXTO = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  quince: 15,
  veinte: 20,
  veintiuno: 21,
  veinticinco: 25,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  cien: 100
};
var PALABRAS_IGNORAR = /* @__PURE__ */ new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "me",
  "da",
  "dame",
  "quiero",
  "necesito",
  "pon",
  "agrega",
  "vende",
  "vendeme",
  "porfavor",
  "por",
  "favor",
  "gracias",
  "y",
  "con",
  "sin",
  "del",
  "al",
  "que",
  "mas",
  "tambien",
  // Pronombres que aparecen cuando el reconocedor falla ("6"→"se") y que
  // nunca son un producto: si se cuelan, ensucian la búsqueda.
  "se",
  "le",
  "lo",
  "te",
  "me",
  "es",
  "esta",
  "este"
]);
var PALABRAS_UNIDAD = /* @__PURE__ */ new Set([
  "libra",
  "libras",
  "litro",
  "litros",
  "kilo",
  "kilos",
  "metro",
  "metros",
  "paquete",
  "paquetes",
  "unidad",
  "unidades",
  "bolsa",
  "bolsas",
  "caja",
  "cajas",
  "par",
  "pares"
]);
var PALABRAS_CONTENIDO = /* @__PURE__ */ new Set([
  "onza",
  "onzas",
  "oz",
  "ml",
  "mililitro",
  "mililitros",
  "cc",
  "gramo",
  "gramos",
  "gr",
  "grs"
]);
function palabraCoincide(dicha, delNombre) {
  if (dicha === delNombre) return true;
  const [corta, larga] = dicha.length <= delNombre.length ? [dicha, delNombre] : [delNombre, dicha];
  if (corta.length < 3) return false;
  return larga.startsWith(corta) && larga.length - corta.length <= 2;
}
function claveFonetica(palabra) {
  let p = normalizarTexto(palabra).replace(/\s+/g, "");
  if (!p) return "";
  p = p.replace(/^x/, "s").replace(/x/g, "ks");
  p = p.replace(/ch/g, "C").replace(/qu([ei])/g, "k$1").replace(/c([ei])/g, "s$1").replace(/c/g, "k").replace(/z/g, "s").replace(/gu([ei])/g, "g$1").replace(/g([ei])/g, "j$1").replace(/ll/g, "y").replace(/v/g, "b").replace(/w/g, "b").replace(/h/g, "").replace(/ñ/g, "n").replace(/C/g, "ch");
  return p.replace(/(.)\1+/g, "$1");
}
function suenanIgual(a, b) {
  const ca = claveFonetica(a);
  return ca.length > 0 && ca === claveFonetica(b);
}
function nucleoNombre(nombre) {
  return normalizarTexto(nombre).split(/\s+/).filter((t) => t && !PALABRAS_IGNORAR.has(t)).join(" ");
}
function distanciaEdicion(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(
        previa[j] + 1,
        // borrar
        actual[j - 1] + 1,
        // insertar
        previa[j - 1] + costo
        // sustituir
      );
    }
    previa = actual;
  }
  return previa[b.length];
}
function toleranciaTipografica(largo) {
  if (largo <= 3) return 0;
  if (largo <= 6) return 1;
  return 2;
}
function distanciaEfectiva(a, b) {
  const porLetras = distanciaEdicion(a, b);
  if (porLetras === 0) return 0;
  return Math.min(porLetras, distanciaEdicion(claveFonetica(a), claveFonetica(b)));
}
function palabraSimilar(dicha, delNombre) {
  if (palabraCoincide(dicha, delNombre)) return true;
  if (suenanIgual(dicha, delNombre)) return true;
  const tolerancia = toleranciaTipografica(Math.max(dicha.length, delNombre.length));
  if (tolerancia === 0) return false;
  return distanciaEfectiva(dicha, delNombre) <= tolerancia;
}
function seleccionarPorNombre(palabras, productos) {
  if (palabras.length === 0) return [];
  const frase = palabras.join(" ");
  const conNucleo = productos.map((p) => ({ p, nucleo: nucleoNombre(p.nombre) }));
  const exactos = conNucleo.filter((c) => c.nucleo === frase);
  if (exactos.length > 0) return exactos.map((c) => c.p);
  if (palabras.length < 2) return [];
  return conNucleo.filter((c) => {
    const tokens = c.nucleo.split(" ");
    return palabras.every((pd) => tokens.some((tn) => palabraCoincide(pd, tn)));
  }).sort((a, b) => a.nucleo.length - b.nucleo.length).map((c) => c.p);
}
function ordenarPorParecido(palabras, productos) {
  if (palabras.length === 0) return productos;
  const puntuar = (nombre) => {
    const tokens = nucleoNombre(nombre).split(" ").filter(Boolean);
    if (tokens.length === 0) return Infinity;
    let total = 0;
    for (const dicha of palabras) {
      let mejor = Infinity;
      for (const t of tokens) {
        const d = distanciaEfectiva(dicha, t);
        const esPrefijo = t.startsWith(dicha) || dicha.startsWith(t);
        mejor = Math.min(mejor, esPrefijo ? d / 2 : d);
      }
      total += mejor === Infinity ? 99 : mejor;
    }
    return total;
  };
  return productos.map((p) => ({ p, d: puntuar(p.nombre) })).sort((a, b) => a.d - b.d).map((x) => x.p);
}
function seleccionarPorParecido(palabras, productos) {
  if (palabras.length === 0 || productos.length === 0) return [];
  const puntuados = productos.map((p) => {
    const tokens = nucleoNombre(p.nombre).split(" ").filter(Boolean);
    let aciertos = 0;
    let distanciaTotal = 0;
    for (const dicha of palabras) {
      let mejor = Infinity;
      for (const t of tokens) {
        if (palabraSimilar(dicha, t)) {
          mejor = Math.min(mejor, distanciaEfectiva(dicha, t));
        }
      }
      if (mejor !== Infinity) {
        aciertos++;
        distanciaTotal += mejor;
      }
    }
    return { p, aciertos, distanciaTotal };
  }).filter((x) => x.aciertos === palabras.length).sort((a, b) => a.distanciaTotal - b.distanciaTotal);
  if (puntuados.length === 0) return [];
  if (puntuados.length > 1 && puntuados[0].distanciaTotal === puntuados[1].distanciaTotal) {
    return [];
  }
  return [puntuados[0].p];
}
function parsearTranscripcion(transcripcion) {
  const tokens = normalizarTexto(transcripcion).split(/\s+/).filter(Boolean);
  let cantidad = 1;
  let cantidadEncontrada = false;
  const palabras = [];
  for (const token of tokens) {
    if (!cantidadEncontrada) {
      const numDigito = parseInt(token, 10);
      if (!isNaN(numDigito) && numDigito > 0 && numDigito <= 999) {
        cantidad = numDigito;
        cantidadEncontrada = true;
        continue;
      }
      if (NUMEROS_TEXTO[token]) {
        cantidad = NUMEROS_TEXTO[token];
        cantidadEncontrada = true;
        continue;
      }
    }
    if (PALABRAS_IGNORAR.has(token)) continue;
    if (token.length < 2) continue;
    palabras.push(token);
  }
  return { cantidad, palabras };
}
function normalizarFracciones(texto) {
  return texto.replace(/½/g, " media ").replace(
    /(\d)\s*\/\s*2\b/g,
    (_m, entero) => entero === "1" ? " media " : ` ${entero} media `
  ).replace(/\s+/g, " ").trim();
}
function parsearMultiplesProductos(transcripcion) {
  const tokens = normalizarTexto(normalizarFracciones(transcripcion)).split(/\s+/).filter(Boolean);
  const segmentos = [];
  let curWords = [];
  let curQty = null;
  let curDocena = false;
  let pendingQty = null;
  let pendingDocena = false;
  const valorNumero = (token) => {
    const d = parseInt(token, 10);
    if (!isNaN(d) && d > 0 && d <= 999) return d;
    if (NUMEROS_TEXTO[token]) return NUMEROS_TEXTO[token];
    return null;
  };
  const emitir = () => {
    if (curWords.length > 0) {
      segmentos.push({ cantidad: curQty ?? 1, palabras: curWords, enDocenas: curDocena });
    }
    curWords = [];
    curQty = null;
    curDocena = false;
  };
  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    const siguiente = tokens[idx + 1];
    if (token === "media" || token === "medio") {
      if (curWords.length === 0) {
        pendingQty = (pendingQty ?? 0) + 0.5;
      } else if (curQty == null) {
        curQty = 0.5;
        emitir();
      } else {
        emitir();
        pendingQty = 0.5;
      }
      continue;
    }
    if (token === "docena" || token === "docenas") {
      if (curWords.length > 0 && curQty != null) {
        emitir();
        pendingQty = 1;
        pendingDocena = true;
      } else if (curWords.length === 0) {
        if (pendingQty == null) pendingQty = 1;
        pendingDocena = true;
      } else {
        curDocena = true;
      }
      continue;
    }
    if (PALABRAS_UNIDAD.has(token)) {
      if (curWords.length > 0 && curQty != null) {
        emitir();
        pendingQty = 1;
      } else if (curWords.length === 0 && pendingQty == null) {
        pendingQty = 1;
      }
      continue;
    }
    const n = valorNumero(token);
    if (n !== null) {
      if (curWords.length > 0 && siguiente && PALABRAS_CONTENIDO.has(siguiente)) {
        curWords.push(token, siguiente);
        idx++;
        continue;
      }
      if (curWords.length > 0) {
        if (curQty == null) {
          curQty = n;
          emitir();
        } else {
          emitir();
          pendingQty = n;
        }
      } else {
        pendingQty = n;
      }
      continue;
    }
    if (PALABRAS_IGNORAR.has(token)) continue;
    if (token.length < 2) continue;
    if (curWords.length === 0) {
      if (pendingQty != null) {
        curQty = pendingQty;
        pendingQty = null;
      }
      curDocena = pendingDocena;
      pendingDocena = false;
    }
    curWords.push(token);
  }
  emitir();
  return segmentos;
}
export {
  NUMEROS_TEXTO,
  claveFonetica,
  distanciaEdicion,
  distanciaEfectiva,
  normalizarFracciones,
  ordenarPorParecido,
  palabraCoincide,
  palabraSimilar,
  parsearMultiplesProductos,
  parsearTranscripcion,
  seleccionarPorNombre,
  seleccionarPorParecido,
  suenanIgual
};

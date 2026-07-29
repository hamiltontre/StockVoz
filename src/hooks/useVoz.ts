import { useState, useEffect, useCallback, useRef } from 'react';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import { VozLogRepository } from '../database/repositories/VozLogRepository';
import {
  parsearMultiplesProductos,
  seleccionarPorNombre,
  seleccionarPorParecido,
} from '../utils/vozParser';
import { asegurarPermisoMicrofono } from '../voz/motorGoogle';
import { seleccionarMotor, MOTORES } from '../voz/seleccionarMotor';
import type { EventosMotor, MotorVoz } from '../voz/motor';
import { conexionConocida } from './useConectividad';
import type { Producto } from '../types';

// Re-export para compatibilidad: el parser vive en utils/vozParser (módulo
// puro, sin react-native) para poder probarlo en Node.
export { parsearTranscripcion, parsearMultiplesProductos } from '../utils/vozParser';

export type EstadoVoz = 'inactivo' | 'escuchando' | 'procesando' | 'error';

/** Un producto reconocido dentro de la lista hablada. */
export interface ItemVoz {
  cantidad: number;
  palabras: string[];
  productosEncontrados: Producto[];
  /**
   * true si la cantidad fue dicha en docenas ("media docena de clavos").
   * Al agregar al carrito: si el producto se cuenta por unidad, se
   * multiplica ×12; si su unidad ya es 'docena', la cantidad queda igual.
   */
  enDocenas?: boolean;
}

export interface ResultadoVoz {
  transcripcion: string;
  items: ItemVoz[];
}

/**
 * Este hook ya NO conoce ninguna librería de voz: pide un motor a
 * `seleccionarMotor()` y trabaja contra la interfaz `MotorVoz`. Todo lo
 * específico de cada reconocedor (idioma, pitido, códigos de error) vive
 * dentro de su motor. Así se puede cambiar de reconocedor sin tocar la
 * pantalla de ventas, que es lo que nos costó caro con @react-native-voice.
 */

/**
 * Estrategia de búsqueda en capas (de más específica a más flexible):
 *
 * Nivel 0: LO DICHO MANDA — si lo dicho es el nombre de un producto que
 *          existe (exacto en orden, o todas las palabras con tolerancia a
 *          plurales), ese gana sobre cualquier sinónimo de otro producto.
 *          "pierna de pollo" → "Pierna de pollo", nunca "Consomé de pollo".
 * Nivel 1: coincidencia exacta de palabra clave normalizada (sinónimos)
 * Nivel 2: palabra clave que EMPIEZA con el término (frijol → frijoles)
 * Nivel 3: nombre de producto que contiene el término
 * Nivel 4: combinación de 2 palabras seguidas ("coca cola")
 */
export async function buscarProductosInteligente(
  palabras: string[],
  /**
   * Catálogo ya cargado. Al dictar una lista larga se buscan decenas de
   * productos seguidos: sin esto se releía el inventario COMPLETO en cada
   * uno (26 productos dichos = 26 lecturas completas), que en un teléfono
   * de gama baja se siente. Quien procesa la lista lo carga una sola vez.
   */
  catalogo?: Producto[]
): Promise<Producto[]> {
  if (palabras.length === 0) return [];

  // Nivel 0: comparación por nombre en memoria (inventarios pequeños,
  // ≤500 productos) — maneja acentos y plurales mejor que LIKE en SQL.
  let todos = catalogo;
  if (!todos) {
    const todosR = await ProductoRepository.obtenerTodos();
    todos = todosR.ok ? todosR.data : [];
  }
  if (todos.length > 0) {
    const porNombre = seleccionarPorNombre(palabras, todos);
    if (porNombre.length > 0) return porNombre;
  }

  // Nivel 1 y 2: palabras clave (más precisas que el nombre)
  for (const palabra of palabras) {
    const exacta = await ProductoRepository.buscarPorPalabraClaveExacta(palabra);
    if (exacta.ok && exacta.data.length > 0) return exacta.data;

    const prefijo = await ProductoRepository.buscarPorPalabraClavePrefijo(palabra);
    if (prefijo.ok && prefijo.data.length > 0) return prefijo.data;
  }

  // Nivel 3: nombre del producto
  for (const palabra of palabras) {
    if (palabra.length < 3) continue;
    const porNombre = await ProductoRepository.buscarPorNombre(palabra);
    if (porNombre.ok && porNombre.data.length > 0) return porNombre.data;
  }

  // Nivel 4: combinación de 2 palabras seguidas
  if (palabras.length >= 2) {
    for (let i = 0; i < palabras.length - 1; i++) {
      const combinacion = palabras[i] + ' ' + palabras[i + 1];
      const porComb = await ProductoRepository.buscarPorNombre(combinacion);
      if (porComb.ok && porComb.data.length > 0) return porComb.data;
    }
  }

  // Nivel 5 (último recurso): tolerar errores de transcripción.
  // Sin internet el reconocimiento es menos preciso ("maruchan" puede
  // llegar como "marucha") y en un local ruidoso también. Aquí la
  // alternativa es no encontrar nada, así que vale arriesgar — pero solo
  // con un ganador claro, nunca ante un empate.
  return seleccionarPorParecido(palabras, todos);
}

// Tope de seguridad: si el micrófono queda encendido, se corta solo.
// Generoso a propósito: el vendedor atiende, cobra, piensa y sigue
// dictando; cortarlo antes es la queja número uno.
const MAX_ESCUCHA_MS = 180_000;
/** Espera antes de reabrir el micrófono — evita pisar la sesión que cierra. */
const PAUSA_REARME_MS = 350;
/** Tope de re-armes por sesión: acota un posible bucle de fallos. */
const MAX_REARMES = 60;
/** Espera tras onSpeechEnd por si aún llega el resultado del segmento. */
const GRACIA_MS = 900;

// Diagnóstico de la sesión de voz — solo en desarrollo; en producción no
// queremos el costo (ni el ruido) de serializar cada evento del micrófono.
function logVoz(...args: unknown[]) {
  if (__DEV__) console.warn('[DIAG voz]', ...args);
}

export function useVoz() {
  const [estado, setEstado] = useState<EstadoVoz>('inactivo');
  const [resultado, setResultado] = useState<ResultadoVoz | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0); // tiempo escuchando (informativo)
  // Qué motor está atendiendo la venta actual, para diagnóstico y para
  // saber si hay que re-armar el micrófono.
  const [motorActivo, setMotorActivo] = useState<string | null>(null);
  const disponible = useRef(seleccionarMotor(true) !== null);

  const motorRef = useRef<MotorVoz | null>(null);
  // Catálogo cargado al abrir el micrófono: sirve para el vocabulario del
  // motor offline y se reutiliza al procesar, evitando releer el inventario.
  const catalogoRef = useRef<Producto[] | null>(null);
  const escuchandoRef = useRef(false);
  const cronometroRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limiteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Respaldo de la sesión actual:
  // - parcialRef: última transcripción parcial no vacía. Si el resultado final
  //   llega vacío/nulo (visto en algunos OEMs) o la sesión muere con error
  //   6/7 tras haber transcrito algo, rescatamos lo dicho desde aquí.
  // - procesadoRef: evita procesar dos veces la misma sesión (parcial + final).
  // - graciaRef: timer de gracia tras onSpeechEnd, para el caso en que el
  //   nativo cierra la sesión SIN emitir ni resultado ni error (la UI quedaba
  //   pegada en "escuchando" hasta el tope de 60s).
  const parcialRef = useRef('');
  const procesadoRef = useRef(false);
  const graciaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Escucha continua: lo dicho se acumula a través de varios segmentos
  // (Google corta cada 1-2s de silencio) y se procesa todo junto al final.
  const acumuladoRef = useRef('');
  const reiniciandoRef = useRef(false);
  const rearmesRef = useRef(0);

  const limpiarTimers = useCallback(() => {
    if (cronometroRef.current) { clearInterval(cronometroRef.current); cronometroRef.current = null; }
    if (limiteRef.current) { clearTimeout(limiteRef.current); limiteRef.current = null; }
    if (graciaRef.current) { clearTimeout(graciaRef.current); graciaRef.current = null; }
    setSegundos(0);
  }, []);

  // Procesa la transcripción completa → lista de productos (uno o varios).
  const procesar = useCallback(async (transcripcion: string) => {
    const texto = transcripcion.trim();
    if (!texto) { setEstado('inactivo'); return; }
    setEstado('procesando');
    try {
      const segmentos = parsearMultiplesProductos(texto);
      // Catálogo una sola vez para toda la lista dictada, no por producto.
      // Al abrir el micrófono ya se cargó (lo necesita el vocabulario del
      // motor offline), así que normalmente no se vuelve a leer la base.
      let catalogo = catalogoRef.current;
      if (!catalogo) {
        const catR = await ProductoRepository.obtenerTodos();
        catalogo = catR.ok ? catR.data : [];
      }
      const items: ItemVoz[] = [];
      for (const seg of segmentos) {
        const productosEncontrados = await buscarProductosInteligente(seg.palabras, catalogo);
        // La conversión docena→unidades se hace ACÁ, donde ya se conoce el
        // producto: "media docena de esponjas" son 6 esponjas. Antes se
        // hacía en la pantalla y el diagnóstico registraba el 0.5 sin
        // convertir, lo que hacía creer que la app confundía las docenas.
        const p = productosEncontrados[0];
        const cantidad = seg.enDocenas && p && p.unidad !== 'docena'
          ? seg.cantidad * 12
          : seg.cantidad;
        items.push({
          cantidad,
          palabras: seg.palabras,
          productosEncontrados,
          enDocenas: seg.enDocenas,
        });
      }
      setResultado({ transcripcion: texto, items });
      // Registrar para poder medir la precisión de la voz con números
      VozLogRepository.registrar(
        texto,
        items.map((i) => ({
          cantidad: i.cantidad,
          palabras: i.palabras,
          encontrado: i.productosEncontrados.length > 0,
        })),
        motorRef.current?.nombre ?? null
      );
      setEstado('inactivo');
    } catch {
      setErrorMensaje('Error al procesar el audio');
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 3000);
    }
  }, []);

  /** Cierra un segmento: pasa lo reconocido al acumulado de la sesión. */
  const capturarSegmento = useCallback((texto: string) => {
    const t = texto.trim();
    if (t) {
      acumuladoRef.current = (acumuladoRef.current + ' ' + t).trim();
      logVoz('segmento capturado →', JSON.stringify(acumuladoRef.current));
    }
    parcialRef.current = '';
  }, []);

  /** Termina la escucha y procesa TODO lo dicho en la sesión. */
  const finalizar = useCallback(() => {
    if (procesadoRef.current) return;
    procesadoRef.current = true;
    escuchandoRef.current = false;
    // detener() devuelve el sonido del teléfono y cierra el micrófono.
    motorRef.current?.detener().catch(() => { /* noop */ });
    limpiarTimers();
    const texto = (acumuladoRef.current + ' ' + parcialRef.current).trim();
    acumuladoRef.current = '';
    parcialRef.current = '';
    procesar(texto);
  }, [procesar, limpiarTimers]);

  /**
   * Puente estable entre el motor y los manejadores.
   *
   * El motor recibe este objeto UNA sola vez al iniciar, pero los
   * manejadores se recrean en cada render. Si se le pasaran directamente,
   * el motor seguiría llamando a los de la primera vez y la venta se
   * procesaría con datos viejos.
   */
  const manejadoresRef = useRef<EventosMotor | null>(null);
  const eventos = useRef<EventosMotor>({
    onParcial: (t) => manejadoresRef.current?.onParcial(t),
    onFinal: (t) => manejadoresRef.current?.onFinal(t),
    onFinTramo: () => manejadoresRef.current?.onFinTramo(),
    onError: (m, r) => manejadoresRef.current?.onError(m, r),
  }).current;

  /**
   * Vuelve a abrir el micrófono para seguir escuchando al vendedor.
   *
   * Solo hace falta con motores que cierran por silencio (Google corta a
   * ~1-2s e IGNORA los extras de duración que le pedimos). El re-arme está
   * ACOTADO a propósito: guarda de reentrada + espera entre intentos +
   * tope de re-armes. Un bucle de start() sin freno satura el hilo
   * principal y Android mata la app por ANR (ya nos pasó).
   */
  const rearmar = useCallback(() => {
    const motor = motorRef.current;
    if (!motor || !escuchandoRef.current || reiniciandoRef.current) return;
    if (rearmesRef.current >= MAX_REARMES) {
      logVoz('tope de re-armes alcanzado → finalizando');
      finalizar();
      return;
    }
    reiniciandoRef.current = true;
    rearmesRef.current += 1;
    setTimeout(async () => {
      reiniciandoRef.current = false;
      if (!escuchandoRef.current) return;
      try {
        await motor.iniciar(eventos);
        logVoz('re-armado #' + rearmesRef.current);
      } catch {
        // Si no se pudo reabrir, cerramos con lo que ya se entendió
        finalizar();
      }
    }, PAUSA_REARME_MS);
  }, [finalizar, eventos]);

  /** Sigue escuchando si el vendedor no ha apagado el micrófono. */
  const continuar = useCallback(() => {
    if (!escuchandoRef.current) { finalizar(); return; }
    // Un motor que no se corta por silencio (Vosk) sigue escuchando solo;
    // re-armarlo lo reiniciaría a media venta y perdería audio.
    if (motorRef.current?.cierraPorSilencio) rearmar();
  }, [rearmar, finalizar]);

  // Parciales: texto en vivo mientras el vendedor habla.
  const onParcial = useCallback((texto: string) => {
    if (texto && texto !== parcialRef.current) {
      parcialRef.current = texto;
      logVoz('parcial →', JSON.stringify(texto));
    }
  }, []);

  // Tramo terminado (una frase, no la sesión completa).
  const onFinal = useCallback((texto: string) => {
    logVoz('final =', JSON.stringify(texto));
    if (procesadoRef.current) return;
    if (graciaRef.current) { clearTimeout(graciaRef.current); graciaRef.current = null; }
    // Algunos equipos devuelven el final vacío aunque hayan transcrito: el
    // parcial es entonces la fuente real de lo dicho.
    capturarSegmento(texto || parcialRef.current);
    continuar();
  }, [capturarSegmento, continuar]);

  // El motor cerró el micrófono. El timer de gracia cubre el caso en que
  // cierre sin emitir resultado ni error (la UI quedaba pegada en
  // "escuchando" hasta el tope de seguridad).
  const onFinTramo = useCallback(() => {
    logVoz('fin de tramo (escuchando=' + escuchandoRef.current + ')');
    if (procesadoRef.current) return;
    if (graciaRef.current) clearTimeout(graciaRef.current);
    graciaRef.current = setTimeout(() => {
      graciaRef.current = null;
      if (procesadoRef.current) return;
      capturarSegmento(parcialRef.current);
      continuar();
    }, GRACIA_MS);
  }, [capturarSegmento, continuar]);

  const onError = useCallback((mensaje: string, recuperable: boolean) => {
    logVoz('error=' + mensaje + ' recuperable=' + recuperable + ' escuchando=' + escuchandoRef.current);
    if (procesadoRef.current) return;
    if (graciaRef.current) { clearTimeout(graciaRef.current); graciaRef.current = null; }

    // Recuperable = fue el silencio de alguien pensando, no una falla. Se
    // rescata lo que haya y se sigue escuchando.
    if (recuperable) {
      capturarSegmento(parcialRef.current);
      continuar();
      return;
    }

    // Error de verdad (sin permiso, micrófono ocupado por otra app, etc.)
    capturarSegmento(parcialRef.current);
    if (acumuladoRef.current) {
      finalizar(); // no perder lo que ya se había entendido
      return;
    }
    escuchandoRef.current = false;
    motorRef.current?.detener().catch(() => { /* noop */ });
    limpiarTimers();
    setErrorMensaje(mensaje || 'Error de reconocimiento');
    setEstado('error');
    setTimeout(() => setEstado('inactivo'), 3000);
  }, [capturarSegmento, continuar, finalizar, limpiarTimers]);

  // Mantener el puente apuntando a los manejadores de este render.
  manejadoresRef.current = { onParcial, onFinal, onFinTramo, onError };

  useEffect(() => {
    // Adelantar el trabajo pesado del motor offline mientras el vendedor
    // todavía está mirando la pantalla, no cuando toque el micrófono. Si
    // falla no importa: se reintenta al iniciar la escucha.
    for (const m of MOTORES) {
      if (m.estaDisponible()) m.precargar?.().catch(() => { /* noop */ });
    }

    return () => {
      limpiarTimers();
      escuchandoRef.current = false;
      // Salir de Ventas nunca debe dejar el teléfono mudo ni el modelo de
      // voz ocupando memoria.
      for (const m of MOTORES) m.liberar().catch(() => { /* noop */ });
    };
  }, [limpiarTimers]);

  // El vendedor apaga el micrófono: se cierra el segmento en curso y se
  // procesa TODO lo acumulado en la sesión.
  const detenerEscucha = useCallback(async () => {
    if (!escuchandoRef.current) { setEstado('inactivo'); return; }
    escuchandoRef.current = false; // corta el ciclo de re-armes
    if (limiteRef.current) { clearTimeout(limiteRef.current); limiteRef.current = null; }
    if (cronometroRef.current) { clearInterval(cronometroRef.current); cronometroRef.current = null; }
    setEstado('procesando');
    const motor = motorRef.current;
    if (!motor) { finalizar(); return; }
    try { await motor.detener(); } catch { /* noop */ }
    // Darle un momento al nativo para emitir el último resultado; si no
    // llega, se cierra igual con lo acumulado.
    if (graciaRef.current) clearTimeout(graciaRef.current);
    graciaRef.current = setTimeout(() => { graciaRef.current = null; finalizar(); }, GRACIA_MS);
  }, [finalizar]);

  const iniciarEscucha = useCallback(async () => {
    // Sin conexión conocida todavía se asume que sí hay: es el
    // comportamiento de siempre, así nunca se degrada por no saber.
    const eleccion = seleccionarMotor(conexionConocida() ?? true);
    if (!eleccion) {
      setErrorMensaje('Voz no disponible. Se necesita development build.');
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 4000);
      return;
    }
    const { motor, razon } = eleccion;
    const permiso = await asegurarPermisoMicrofono();
    if (!permiso) {
      setErrorMensaje('Activa el permiso de micrófono para usar la voz');
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 4000);
      return;
    }
    try {
      setResultado(null);
      setErrorMensaje(null);
      parcialRef.current = '';
      acumuladoRef.current = '';
      procesadoRef.current = false;
      reiniciandoRef.current = false;
      rearmesRef.current = 0;
      escuchandoRef.current = true;
      motorRef.current = motor;
      setMotorActivo(motor.nombre);
      setEstado('escuchando');
      setSegundos(0);

      // El catálogo se lee ANTES de abrir el micrófono: un motor de
      // vocabulario cerrado necesita saber qué productos existen para
      // reconocer "Arroz Faisán" o "Xedex". Se reutiliza al procesar.
      const catR = await ProductoRepository.obtenerTodos();
      catalogoRef.current = catR.ok ? catR.data : [];
      if (motor.prepararVocabulario) {
        const clavesR = await ProductoRepository.obtenerPalabrasClaveTodas();
        await motor.prepararVocabulario(
          catalogoRef.current,
          clavesR.ok ? clavesR.data : []
        );
      }

      logVoz('motor=' + motor.nombre + ' (' + razon + ')');
      await motor.iniciar(eventos);

      cronometroRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
      // Tope de seguridad: detener si se pasa el máximo.
      limiteRef.current = setTimeout(() => { detenerEscucha(); }, MAX_ESCUCHA_MS);
    } catch (e) {
      escuchandoRef.current = false;
      motor.detener().catch(() => { /* noop */ });
      limpiarTimers();
      setErrorMensaje(String(e));
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 3000);
    }
  }, [limpiarTimers, detenerEscucha, eventos]);

  const limpiar = useCallback(() => {
    setResultado(null);
    setErrorMensaje(null);
    setEstado('inactivo');
    limpiarTimers();
  }, [limpiarTimers]);

  return {
    estado,
    resultado,
    errorMensaje,
    segundos,
    /** Motor que atendió la última escucha ("google" | "vosk"). */
    motorActivo,
    disponible: disponible.current,
    iniciarEscucha,
    detenerEscucha,
    limpiar,
  };
}

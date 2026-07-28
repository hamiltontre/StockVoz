import { useState, useEffect, useCallback, useRef } from 'react';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import {
  parsearMultiplesProductos,
  seleccionarPorNombre,
  seleccionarPorParecido,
} from '../utils/vozParser';
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

// 'es-419' (código regional Latinoamérica de la ONU) no es reconocido de
// forma confiable por el backend de reconocimiento de voz de Google en
// algunos dispositivos/OEMs — devuelve resultados vacíos aunque detecte
// audio. 'es-US' tiene mejor soporte real y funciona bien con acento
// latinoamericano/nicaragüense.
const LOCALE_ES = 'es-US';

// Opciones del reconocedor: tolerar pausas largas (4s) para que el vendedor
// pueda dictar su lista con calma sin que se corte la sesión, y resultados
// parciales como respaldo. OJO: el servicio de Google en Android moderno
// suele IGNORAR los extras de silencio (cierra a ~1-2s de pausa igual);
// por eso los parciales se acumulan en parcialRef y se rescatan si el
// resultado final llega vacío o la sesión muere con error 6/7. NO se
// re-arma el reconocedor (eso causaba ANR/crashes).
const OPCIONES_VOZ = {
  EXTRA_LANGUAGE_MODEL: 'LANGUAGE_MODEL_FREE_FORM',
  EXTRA_PARTIAL_RESULTS: true,
  EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 4000,
  EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
  EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
};

// RCTVoice es null en Expo Go (no hay native build).
// Verificamos ANTES de hacer require para evitar que el constructor
// del módulo haga llamadas async a un bridge nulo.
const VOICE_NATIVO_DISPONIBLE = !!NativeModules.RCTVoice;

function getVoice() {
  if (!VOICE_NATIVO_DISPONIBLE) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-voice/voice').default;
  } catch {
    return null;
  }
}

/**
 * Pide el permiso de micrófono en Android. @react-native-voice NO lo solicita
 * solo al llamar start(), así que sin esto la voz falla silenciosamente en
 * dispositivos donde el usuario aún no lo concedió.
 * Devuelve true si el permiso quedó concedido.
 */
async function asegurarPermisoMicrofono(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const yaConcedido = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    if (yaConcedido) return true;
    const resultado = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Permiso de micrófono',
        message: 'StockVoz necesita el micrófono para registrar ventas por voz.',
        buttonPositive: 'Permitir',
        buttonNegative: 'Cancelar',
      }
    );
    return resultado === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

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
export async function buscarProductosInteligente(palabras: string[]): Promise<Producto[]> {
  if (palabras.length === 0) return [];

  // Nivel 0: comparación por nombre en memoria (inventarios pequeños,
  // ≤500 productos) — maneja acentos y plurales mejor que LIKE en SQL.
  const todosR = await ProductoRepository.obtenerTodos();
  const todos = todosR.ok ? todosR.data : [];
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
  const disponible = useRef(VOICE_NATIVO_DISPONIBLE);

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
      const items: ItemVoz[] = [];
      for (const seg of segmentos) {
        const productosEncontrados = await buscarProductosInteligente(seg.palabras);
        items.push({
          cantidad: seg.cantidad,
          palabras: seg.palabras,
          productosEncontrados,
          enDocenas: seg.enDocenas,
        });
      }
      setResultado({ transcripcion: texto, items });
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
    limpiarTimers();
    const texto = (acumuladoRef.current + ' ' + parcialRef.current).trim();
    acumuladoRef.current = '';
    parcialRef.current = '';
    procesar(texto);
  }, [procesar, limpiarTimers]);

  /**
   * Vuelve a abrir el micrófono para seguir escuchando al vendedor.
   *
   * Google corta la sesión a ~1-2s de silencio e IGNORA los extras de
   * duración que le pedimos, así que la única forma de dejar pensar al
   * vendedor es re-armar el reconocedor. El re-arme está ACOTADO a
   * propósito: guarda de reentrada + espera entre intentos + tope de
   * re-armes. Un bucle de start() sin freno satura el hilo principal y
   * Android mata la app por ANR (ya nos pasó).
   */
  const rearmar = useCallback(() => {
    const Voice = getVoice();
    if (!Voice || !escuchandoRef.current || reiniciandoRef.current) return;
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
        await Voice.start(LOCALE_ES, OPCIONES_VOZ);
        logVoz('re-armado #' + rearmesRef.current);
      } catch {
        // Si no se pudo reabrir, cerramos con lo que ya se entendió
        finalizar();
      }
    }, PAUSA_REARME_MS);
  }, [finalizar]);

  // Parciales: Google los emite en vivo mientras el vendedor habla.
  const handleParciales = useCallback((e: { value?: string[] }) => {
    const texto = e.value?.find((v) => v && v.trim().length > 0)?.trim() ?? '';
    if (texto && texto !== parcialRef.current) {
      parcialRef.current = texto;
      logVoz('parcial →', JSON.stringify(texto));
    }
  }, []);

  // Fin de un segmento por silencio. Si el vendedor sigue con el micrófono
  // encendido, reabrimos; el timer de gracia cubre el caso en que el nativo
  // cierre sin emitir resultado ni error.
  const handleFinDeVoz = useCallback(() => {
    logVoz('onSpeechEnd (escuchando=' + escuchandoRef.current + ')');
    if (procesadoRef.current) return;
    if (graciaRef.current) clearTimeout(graciaRef.current);
    graciaRef.current = setTimeout(() => {
      graciaRef.current = null;
      if (procesadoRef.current) return;
      capturarSegmento(parcialRef.current);
      if (escuchandoRef.current) rearmar();
      else finalizar();
    }, GRACIA_MS);
  }, [capturarSegmento, rearmar, finalizar]);

  // Resultado de un segmento (no de la sesión completa).
  const handleResultados = useCallback((e: { value?: string[] }) => {
    logVoz('onSpeechResults =', JSON.stringify(e.value));
    if (procesadoRef.current) return;
    if (graciaRef.current) { clearTimeout(graciaRef.current); graciaRef.current = null; }
    const final = e.value?.find((v) => v && v.trim().length > 0)?.trim() ?? '';
    // Este OEM devuelve el final vacío aunque haya transcrito: el parcial
    // es la fuente real de lo dicho.
    capturarSegmento(final || parcialRef.current);
    if (escuchandoRef.current) rearmar();
    else finalizar();
  }, [capturarSegmento, rearmar, finalizar]);

  const handleError = useCallback((e: { error?: { message?: string; code?: string } }) => {
    const code = String(e.error?.code ?? '');
    logVoz('onSpeechError code=' + code + ' escuchando=' + escuchandoRef.current);
    if (procesadoRef.current) return;
    if (graciaRef.current) { clearTimeout(graciaRef.current); graciaRef.current = null; }

    // 5=client, 6=speech timeout, 7=no match, 8=busy: no son errores reales,
    // son el silencio de alguien que está pensando. Se rescata lo que haya
    // y se sigue escuchando.
    const esSilencio = code === '5' || code === '6' || code === '7' || code === '8' || code === 'no-speech';
    if (esSilencio) {
      capturarSegmento(parcialRef.current);
      if (escuchandoRef.current) rearmar();
      else finalizar();
      return;
    }

    // Error de verdad (sin permiso, micrófono ocupado por otra app, etc.)
    capturarSegmento(parcialRef.current);
    if (acumuladoRef.current) {
      finalizar(); // no perder lo que ya se había entendido
      return;
    }
    escuchandoRef.current = false;
    limpiarTimers();
    setErrorMensaje(e.error?.message ?? 'Error de reconocimiento');
    setEstado('error');
    setTimeout(() => setEstado('inactivo'), 3000);
  }, [capturarSegmento, rearmar, finalizar, limpiarTimers]);

  useEffect(() => {
    const Voice = getVoice();
    if (!Voice) return;

    Voice.onSpeechResults = handleResultados;
    Voice.onSpeechPartialResults = handleParciales;
    Voice.onSpeechEnd = handleFinDeVoz;
    Voice.onSpeechError = handleError;

    return () => {
      limpiarTimers();
      Voice.destroy()
        .then(() => Voice.removeAllListeners())
        .catch(() => {});
    };
  }, [handleResultados, handleParciales, handleFinDeVoz, handleError, limpiarTimers]);

  // El vendedor apaga el micrófono: se cierra el segmento en curso y se
  // procesa TODO lo acumulado en la sesión.
  const detenerEscucha = useCallback(async () => {
    if (!escuchandoRef.current) { setEstado('inactivo'); return; }
    escuchandoRef.current = false; // corta el ciclo de re-armes
    if (limiteRef.current) { clearTimeout(limiteRef.current); limiteRef.current = null; }
    if (cronometroRef.current) { clearInterval(cronometroRef.current); cronometroRef.current = null; }
    setEstado('procesando');
    const Voice = getVoice();
    if (!Voice) { finalizar(); return; }
    try { await Voice.stop(); } catch { /* noop */ }
    // Darle un momento al nativo para emitir el último resultado; si no
    // llega, se cierra igual con lo acumulado.
    if (graciaRef.current) clearTimeout(graciaRef.current);
    graciaRef.current = setTimeout(() => { graciaRef.current = null; finalizar(); }, GRACIA_MS);
  }, [finalizar]);

  const iniciarEscucha = useCallback(async () => {
    const Voice = getVoice();
    if (!Voice) {
      setErrorMensaje('Voz no disponible. Se necesita development build.');
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 4000);
      return;
    }
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
      setEstado('escuchando');
      setSegundos(0);
      await Voice.start(LOCALE_ES, OPCIONES_VOZ);

      cronometroRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
      // Tope de seguridad: detener si se pasa el máximo.
      limiteRef.current = setTimeout(() => { detenerEscucha(); }, MAX_ESCUCHA_MS);
    } catch (e) {
      escuchandoRef.current = false;
      limpiarTimers();
      setErrorMensaje(String(e));
      setEstado('error');
      setTimeout(() => setEstado('inactivo'), 3000);
    }
  }, [limpiarTimers, detenerEscucha]);

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
    disponible: disponible.current,
    iniciarEscucha,
    detenerEscucha,
    limpiar,
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import { parsearMultiplesProductos } from '../utils/vozParser';
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
 * Nivel 1: coincidencia exacta de palabra clave normalizada
 * Nivel 2: palabra clave que EMPIEZA con el término (frijol → frijoles)
 * Nivel 3: nombre de producto que contiene el término
 * Nivel 4: combinación de 2 palabras seguidas ("coca cola")
 */
export async function buscarProductosInteligente(palabras: string[]): Promise<Producto[]> {
  if (palabras.length === 0) return [];

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

  return [];
}

// Tope de seguridad: si el vendedor olvida apagar el micrófono, se corta solo.
// Tope de seguridad: si el micrófono queda encendido, se corta solo.
const MAX_ESCUCHA_MS = 60_000;

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

  const limpiarTimers = useCallback(() => {
    if (cronometroRef.current) { clearInterval(cronometroRef.current); cronometroRef.current = null; }
    if (limiteRef.current) { clearTimeout(limiteRef.current); limiteRef.current = null; }
    if (graciaRef.current) { clearTimeout(graciaRef.current); graciaRef.current = null; }
    setSegundos(0);
  }, []);

  // Procesa la transcripción → lista de productos (uno o varios).
  // Una sola sesión de reconocimiento: el SpeechRecognizer entrega TODO lo
  // dicho (con la tolerancia a pausas de OPCIONES_VOZ) en un único resultado,
  // que aquí dividimos en varios productos. NO re-armamos el reconocedor —
  // eso causaba ANR/crashes por llamar start()/stop() en ráfaga.
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

  // Parciales: Google los emite en vivo mientras el vendedor habla.
  // Guardamos el último no vacío como respaldo de la sesión.
  const handleParciales = useCallback((e: { value?: string[] }) => {
    const texto = e.value?.find((v) => v && v.trim().length > 0)?.trim() ?? '';
    if (texto && texto !== parcialRef.current) {
      parcialRef.current = texto;
      console.warn('[DIAG voz] onSpeechPartialResults →', JSON.stringify(texto));
    }
  }, []);

  // Timer de gracia: si tras onSpeechEnd (o tras stop()) no llega NINGÚN
  // evento en 2s, cerramos la sesión nosotros con lo que haya en el parcial.
  const programarGracia = useCallback(() => {
    if (graciaRef.current) clearTimeout(graciaRef.current);
    graciaRef.current = setTimeout(() => {
      graciaRef.current = null;
      if (procesadoRef.current) return;
      escuchandoRef.current = false;
      limpiarTimers();
      if (parcialRef.current) {
        console.warn('[DIAG voz] sin resultado tras onSpeechEnd → usando parcial');
        procesadoRef.current = true;
        procesar(parcialRef.current);
      } else {
        setEstado('inactivo');
      }
    }, 2000);
  }, [procesar, limpiarTimers]);

  const handleFinDeVoz = useCallback(() => {
    console.warn('[DIAG voz] onSpeechEnd');
    if (!procesadoRef.current) programarGracia();
  }, [programarGracia]);

  // Resultado final de la sesión (fin natural por silencio O tras detener).
  const handleResultados = useCallback((e: { value?: string[] }) => {
    console.warn('[DIAG voz] onSpeechResults e.value=', JSON.stringify(e.value));
    escuchandoRef.current = false;
    limpiarTimers();
    const final = e.value?.find((v) => v && v.trim().length > 0)?.trim() ?? '';
    if (final) {
      procesadoRef.current = true;
      procesar(final);
      return;
    }
    // Resultado final vacío o nulo (visto en algunos OEMs con este motor):
    // rescatar el último parcial en vez de descartar lo dicho.
    if (!procesadoRef.current && parcialRef.current) {
      console.warn('[DIAG voz] final vacío → usando parcial:', JSON.stringify(parcialRef.current));
      procesadoRef.current = true;
      procesar(parcialRef.current);
      return;
    }
    if (!procesadoRef.current) setEstado('inactivo');
  }, [procesar, limpiarTimers]);

  const handleError = useCallback((e: { error?: { message?: string; code?: string } }) => {
    console.warn('[DIAG voz] onSpeechError e=', JSON.stringify(e));
    escuchandoRef.current = false;
    limpiarTimers();
    if (procesadoRef.current) return; // la sesión ya se resolvió con parcial/final
    const code = String(e.error?.code ?? '');
    // 6=speech timeout, 7=no match: si Google alcanzó a transcribir parciales,
    // lo dicho es rescatable aunque el "final" haya fallado.
    if ((code === '6' || code === '7') && parcialRef.current) {
      console.warn('[DIAG voz] error', code, '→ rescatando parcial:', JSON.stringify(parcialRef.current));
      procesadoRef.current = true;
      procesar(parcialRef.current);
      return;
    }
    // 5=client, 6=speech timeout, 7=no match: el usuario no dijo nada
    // reconocible — no es un error real, simplemente volvemos a inactivo.
    if (code === '5' || code === '6' || code === '7' || code === 'no-speech') {
      setEstado('inactivo');
      return;
    }
    setErrorMensaje(e.error?.message ?? 'Error de reconocimiento');
    setEstado('error');
    setTimeout(() => setEstado('inactivo'), 3000);
  }, [procesar, limpiarTimers]);

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

  // Detiene la escucha (toque del vendedor). Voice.stop() hace que el
  // reconocedor entregue el resultado final vía onSpeechResults, que procesa.
  const detenerEscucha = useCallback(async () => {
    if (!escuchandoRef.current) { setEstado('inactivo'); return; }
    escuchandoRef.current = false;
    limpiarTimers();
    const Voice = getVoice();
    if (!Voice) { setEstado('inactivo'); return; }
    setEstado('procesando');
    try {
      await Voice.stop();
      // Si el nativo no responde con resultado ni error, la gracia cierra
      // la sesión con el último parcial (o vuelve a inactivo).
      programarGracia();
    } catch {
      setEstado('inactivo');
    }
  }, [limpiarTimers, programarGracia]);

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
      procesadoRef.current = false;
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

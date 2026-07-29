import type { Producto } from '../types';

/**
 * Contrato de un motor de reconocimiento de voz.
 *
 * POR QUÉ EXISTE: la voz es el diferenciador de StockVoz y a la vez su
 * dependencia más frágil. Ya nos pasó con @react-native-voice (sin
 * mantenimiento: le corregimos dos bugs nosotros) y con el servicio de
 * Google (cambió de comportamiento sin aviso y devolvía resultados
 * vacíos). Con esta interfaz, cambiar de motor no toca ni la pantalla de
 * ventas ni el parser: solo se escribe otra implementación.
 *
 * La app NUNCA debe importar una librería de voz directamente.
 */

/** Lo que un motor devuelve mientras escucha. */
export interface EventosMotor {
  /** Texto provisional; puede cambiar en el siguiente evento. */
  onParcial: (texto: string) => void;
  /** Texto consolidado de un tramo. */
  onFinal: (texto: string) => void;
  /** El motor cerró el tramo (silencio). El hook decide si reabrir. */
  onFinTramo: () => void;
  /** Error real; `recuperable` = fue silencio, no una falla. */
  onError: (mensaje: string, recuperable: boolean) => void;
}

export interface MotorVoz {
  /** Identificador para diagnóstico ("google", "vosk"). */
  readonly nombre: string;

  /** ¿Se puede usar en este dispositivo ahora mismo? */
  estaDisponible(): boolean;

  /**
   * Necesita conexión para funcionar bien. Define qué motor se elige
   * cuando el negocio se queda sin internet.
   */
  readonly requiereInternet: boolean;

  /**
   * true = el motor cierra el micrófono solo al detectar silencio, así que
   * quien lo usa debe volver a abrirlo para seguir escuchando (es el caso
   * de Google: corta a 1-2 s e ignora los extras de duración que se le
   * piden). false = el motor escucha de corrido hasta que le pidan parar y
   * va emitiendo un `onFinal` por cada frase (Vosk).
   *
   * Importa porque re-armar un motor que no lo necesita reinicia el
   * reconocedor a media venta y pierde audio.
   */
  readonly cierraPorSilencio: boolean;

  /**
   * Motores con vocabulario restringido (Vosk) reconocen MUCHO mejor si
   * saben qué productos existen: "Arroz Faisán" deja de ser una palabra
   * desconocida. Los motores generales (Google) lo ignoran.
   *
   * `palabrasClave` son los sinónimos que el dueño le enseñó a la voz. Van
   * aparte porque un motor de vocabulario cerrado solo entiende lo que
   * está en la lista: sin ellas, enseñarle una palabra no serviría de nada
   * cuando el negocio se queda sin internet.
   */
  prepararVocabulario?(productos: Producto[], palabrasClave: string[]): Promise<void>;

  /**
   * Deja el motor listo ANTES de que lo necesiten. El motor offline copia
   * un modelo de ~58 MB al teléfono la primera vez; si eso ocurriera al
   * tocar el micrófono, el vendedor esperaría varios segundos creyendo que
   * ya lo están escuchando. Se llama al entrar a la pantalla de ventas y
   * puede fallar en silencio: es solo un adelanto de trabajo.
   */
  precargar?(): Promise<void>;

  iniciar(eventos: EventosMotor): Promise<void>;
  detener(): Promise<void>;
  liberar(): Promise<void>;
}

/**
 * Palabras que conviene que un motor de vocabulario restringido reconozca:
 * los nombres de los productos, sus palabras clave, los números y las
 * unidades que usa el vendedor. Fuera de esta lista el motor no reconocerá
 * nada, así que debe incluir todo lo que se pueda decir en una venta.
 */
export const PALABRAS_BASE: readonly string[] = [
  // números que se dicen al vender
  'un', 'uno', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete',
  'ocho', 'nueve', 'diez', 'once', 'doce', 'quince', 'veinte', 'veinticinco',
  'treinta', 'cuarenta', 'cincuenta', 'cien',
  // fracciones y unidades
  'media', 'medio', 'docena', 'docenas', 'libra', 'libras', 'litro', 'litros',
  'metro', 'metros', 'kilo', 'kilos', 'onza', 'onzas', 'unidad', 'unidades',
  'paquete', 'paquetes', 'caja', 'cajas', 'par', 'pares', 'bolsa', 'bolsas',
  // conectores frecuentes
  'de', 'y', 'con', 'la', 'el', 'los', 'las', 'del',
];

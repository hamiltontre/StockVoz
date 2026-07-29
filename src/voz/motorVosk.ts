import type { EventSubscription } from 'react-native';
import { PALABRAS_BASE, type EventosMotor, type MotorVoz } from './motor';
import type { Producto } from '../types';

/**
 * Motor Vosk: reconocimiento 100% dentro del teléfono, sin Google ni
 * internet.
 *
 * DOS MODOS, y la diferencia importa mucho en un punto de venta:
 *
 * - 'libre': Vosk usa su modelo de lenguaje completo y escribe lo que oye,
 *   igual que Google. No conoce "Xedex" ni "Tortrix" —ningún reconocedor de
 *   este tipo puede escribir una palabra que no esté en su léxico— pero
 *   escribe algo parecido y SIEMPRE lo mismo, porque es determinista. Con
 *   la búsqueda por parecido y "enseñar a la voz", enseñarle una vez lo deja
 *   resuelto para siempre.
 *
 * - 'gramatica': solo puede devolver palabras del inventario. Suena mejor,
 *   pero tiene un riesgo grave: si el vendedor dice una marca que no está en
 *   la gramática, Vosk devuelve la palabra del inventario que más se le
 *   parezca — un PRODUCTO EQUIVOCADO en el carrito, sin aviso. Se mitiga con
 *   '[unk]', y entonces lo dicho simplemente se pierde.
 *
 * Se comprobó en el teléfono que el léxico del modelo español pequeño no
 * contiene ~17 de las marcas del inventario de prueba, así que el modo
 * cerrado no cumple lo que prometía. Por eso el valor por defecto es
 * 'libre'. Cambiar MODO_POR_DEFECTO y comparar con el diagnóstico por
 * motor, que registra cada modo por separado.
 */

export type ModoVosk = 'libre' | 'gramatica';

/**
 * Modo con el que se crea el motor offline. Se deja a la vista para poder
 * medir los dos contra el mismo inventario real.
 */
export const MODO_POR_DEFECTO: ModoVosk = 'libre';

/** Nombre de la carpeta del modelo dentro de los assets nativos. */
const RUTA_MODELO = 'vosk-model-small-es-0.42';

/**
 * Prepara una palabra para la GRAMÁTICA de Vosk.
 *
 * CON ACENTOS, a diferencia de normalizarTexto(). El léxico español de Vosk
 * está escrito en ortografía correcta: si se le pide "instantanea",
 * "calcetin" o "antibiotico" sin tilde, no los encuentra y los DESCARTA
 * (visto en el log del teléfono: "Ignoring word missing in vocabulary").
 * Escritas con tilde sí las reconoce. Quitar acentos sirve para comparar
 * contra el inventario, no para hablarle al reconocedor.
 */
function normalizarParaGramatica(frase: string): string[] {
  return frase
    .toLowerCase()
    .replace(/[^a-záéíóúüñ0-9\s]/g, ' ')
    .split(/\s+/)
    // Nada que lleve dígitos ("1211", "250ml", "400mg", "9w") existe en el
    // léxico: Vosk transcribe "doscientos cincuenta mililitros", y esas
    // palabras ya vienen en PALABRAS_BASE.
    .filter((t) => t.length >= 2 && !/\d/.test(t));
}

function getVosk() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-vosk');
  } catch {
    return null;
  }
}

export class MotorVosk implements MotorVoz {
  /** Distingue los modos en el diagnóstico: "vosk-libre" vs "vosk-gramatica". */
  readonly nombre: string;
  readonly requiereInternet = false;
  // Vosk no se corta por silencio: escucha hasta que se le pida parar y va
  // entregando una frase reconocida a la vez.
  readonly cierraPorSilencio = false;

  private modeloCargado = false;
  private cargando: Promise<void> | null = null;
  private vocabulario: string[] = [...PALABRAS_BASE];
  private subs: EventSubscription[] = [];
  /** Última frase entregada, para no contar dos veces la del cierre. */
  private ultimoFinal = '';

  constructor(private readonly modo: ModoVosk = MODO_POR_DEFECTO) {
    this.nombre = `vosk-${modo}`;
  }

  estaDisponible(): boolean {
    return getVosk() !== null;
  }

  /**
   * El modelo pesa ~58 MB y tarda en cargar: se hace una sola vez y se
   * comparte la promesa para que varias llamadas no lo carguen dos veces.
   */
  private async asegurarModelo(): Promise<void> {
    if (this.modeloCargado) return;
    if (this.cargando) { await this.cargando; return; }
    const vosk = getVosk();
    if (!vosk) throw new Error('Motor Vosk no disponible');
    this.cargando = vosk
      .loadModel(RUTA_MODELO)
      .then(() => { this.modeloCargado = true; })
      .finally(() => { this.cargando = null; });
    await this.cargando;
  }

  /**
   * Arma la gramática con lo que el vendedor puede decir: cada palabra de
   * los nombres de producto, sus palabras clave, y los números/unidades.
   * Vosk trabaja con palabras sueltas, así que los nombres se separan.
   *
   * En modo 'libre' no se usa: el reconocedor escribe con todo su léxico.
   */
  async prepararVocabulario(productos: Producto[], palabrasClave: string[] = []): Promise<void> {
    if (this.modo === 'libre') return;
    const palabras = new Set<string>(PALABRAS_BASE);
    const agregar = (frase: string) => {
      for (const t of normalizarParaGramatica(frase)) palabras.add(t);
    };
    for (const p of productos) agregar(p.nombre);
    // Lo que el dueño le enseñó a la voz pesa tanto como el nombre: es la
    // palabra con la que su barrio pide el producto.
    for (const clave of palabrasClave) agregar(clave);
    this.vocabulario = [...palabras];
  }

  /** Copia y carga el modelo por adelantado (ver MotorVoz.precargar). */
  async precargar(): Promise<void> {
    await this.asegurarModelo();
  }

  async iniciar(eventos: EventosMotor): Promise<void> {
    const vosk = getVosk();
    if (!vosk) throw new Error('Motor Vosk no disponible');
    await this.asegurarModelo();

    // Una venta nueva no debe heredar la última frase de la anterior: si no,
    // se descartaría una primera frase legítimamente idéntica.
    this.ultimoFinal = '';
    this.limpiarSubs();
    this.subs.push(
      vosk.onPartialResult((t: string) => { if (t?.trim()) eventos.onParcial(t.trim()); }),
      // Cada frase terminada es un tramo CERRADO, no un parcial: si se
      // informara como parcial, la frase siguiente pisaría a la anterior y
      // se perdería la mitad de la lista dictada.
      vosk.onResult((t: string) => {
        const texto = t?.trim();
        if (!texto) return;
        this.ultimoFinal = texto;
        eventos.onFinal(texto);
      }),
      // Al parar, Vosk vacía su buffer y puede repetir la última frase que
      // ya entregó. En un punto de venta eso sería cobrarle dos veces al
      // cliente, así que se ignora la repetición inmediata.
      vosk.onFinalResult((t: string) => {
        const texto = t?.trim();
        if (!texto || texto === this.ultimoFinal) return;
        this.ultimoFinal = texto;
        eventos.onFinal(texto);
      }),
      vosk.onTimeout(() => eventos.onFinTramo()),
      vosk.onError((e: unknown) => {
        // Vosk no distingue "silencio" de "falla": se trata como recuperable
        // para que el hook reabra el micrófono en vez de cortar la venta.
        eventos.onError(String(e), true);
      })
    );

    if (this.modo === 'libre') {
      // Sin `grammar`, el nativo usa Recognizer(model, sampleRate): el
      // modelo de lenguaje completo. Escribe lo que oye, y de ahí en
      // adelante trabajan la búsqueda por parecido y las palabras enseñadas.
      await vosk.start();
      return;
    }

    // "[unk]" permite que Vosk marque como desconocido lo que no está en el
    // vocabulario, en vez de forzar la palabra más parecida (que produciría
    // productos equivocados en el carrito).
    await vosk.start({ grammar: [...this.vocabulario, '[unk]'] });
  }

  async detener(): Promise<void> {
    const vosk = getVosk();
    try { vosk?.stop(); } catch { /* noop */ }
  }

  async liberar(): Promise<void> {
    this.limpiarSubs();
    const vosk = getVosk();
    try { vosk?.unload(); } catch { /* noop */ }
    this.modeloCargado = false;
  }

  private limpiarSubs() {
    for (const s of this.subs) {
      try { s.remove(); } catch { /* noop */ }
    }
    this.subs = [];
  }
}

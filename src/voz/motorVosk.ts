import type { EventSubscription } from 'react-native';
import { PALABRAS_BASE, type EventosMotor, type MotorVoz } from './motor';
import type { Producto } from '../types';

/**
 * Motor Vosk: reconocimiento 100% dentro del teléfono, sin Google ni
 * internet.
 *
 * POR QUÉ IMPORTA MÁS QUE SER OFFLINE: acepta un VOCABULARIO RESTRINGIDO.
 * Se le pasa la lista de productos del negocio y solo reconoce esas
 * palabras, así que "Arroz Faisán" o "Xedex" —que Google convierte en
 * "ropa y sam" o "cedex" porque no las conoce— se transcriben bien desde
 * el primer intento. Es lo que el dueño esperaba desde el principio: que
 * el reconocedor conozca SU inventario.
 *
 * A cambio, fuera de ese vocabulario no entiende nada. Por eso el
 * vocabulario incluye también números, fracciones y unidades (PALABRAS_BASE).
 */

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
  readonly nombre = 'vosk';
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
   */
  async prepararVocabulario(productos: Producto[], palabrasClave: string[] = []): Promise<void> {
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

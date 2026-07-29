import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { EventosMotor, MotorVoz } from './motor';

/**
 * Motor basado en el SpeechRecognizer de Android (@react-native-voice).
 *
 * Es el que veníamos usando: excelente para habla libre CON internet, pero
 * desconoce las marcas locales ("Arroz Faisán" sale como "ropa y sam"),
 * pita al abrir y cerrar el micrófono, y sin conexión pierde precisión
 * porque el paquete de idioma offline falla en varios equipos.
 *
 * Se conserva porque cuando hay internet transcribe habla libre mejor que
 * un motor de vocabulario cerrado.
 */

const LOCALE_ES = 'es-US';

const OPCIONES = {
  EXTRA_LANGUAGE_MODEL: 'LANGUAGE_MODEL_FREE_FORM',
  EXTRA_PARTIAL_RESULTS: true,
  EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 4000,
  EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
  EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
};

// RCTVoice es null sin build nativo (Expo Go).
const NATIVO_OK = !!NativeModules.RCTVoice;

function getVoice() {
  if (!NATIVO_OK) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-voice/voice').default;
  } catch {
    return null;
  }
}

/** Silenciador del pitido (módulo nativo propio). */
const Silenciador = NativeModules.SilenciadorAudio as
  | { silenciar: () => void; restaurar: () => void }
  | undefined;

function pitido(silenciar: boolean) {
  try {
    if (silenciar) Silenciador?.silenciar();
    else Silenciador?.restaurar();
  } catch { /* nunca romper la venta por el sonido */ }
}

export async function asegurarPermisoMicrofono(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) return true;
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Permiso de micrófono',
        message: 'StockVoz necesita el micrófono para registrar ventas por voz.',
        buttonPositive: 'Permitir',
        buttonNegative: 'Cancelar',
      }
    );
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export class MotorGoogle implements MotorVoz {
  readonly nombre = 'google';
  readonly requiereInternet = true;
  readonly cierraPorSilencio = true;

  estaDisponible(): boolean {
    return NATIVO_OK;
  }

  async iniciar(eventos: EventosMotor): Promise<void> {
    const Voice = getVoice();
    if (!Voice) throw new Error('Motor de voz no disponible (falta build nativo)');

    Voice.onSpeechPartialResults = (e: { value?: string[] }) => {
      const t = e.value?.find((v) => v && v.trim())?.trim();
      if (t) eventos.onParcial(t);
    };
    Voice.onSpeechResults = (e: { value?: string[] }) => {
      // Este OEM devuelve el final vacío aunque haya transcrito; el hook
      // ya rescata el último parcial, así que se informa igual.
      eventos.onFinal(e.value?.find((v) => v && v.trim())?.trim() ?? '');
    };
    Voice.onSpeechEnd = () => eventos.onFinTramo();
    Voice.onSpeechError = (e: { error?: { message?: string; code?: string } }) => {
      const code = String(e.error?.code ?? '');
      // 5=cliente, 6=timeout, 7=sin coincidencia, 8=ocupado: es alguien
      // pensando en silencio, no una falla.
      const recuperable = ['5', '6', '7', '8', 'no-speech'].includes(code);
      eventos.onError(e.error?.message ?? `código ${code}`, recuperable);
    };

    pitido(true); // silenciar ANTES de abrir el micrófono
    await Voice.start(LOCALE_ES, OPCIONES);
  }

  async detener(): Promise<void> {
    const Voice = getVoice();
    pitido(false);
    if (!Voice) return;
    try { await Voice.stop(); } catch { /* noop */ }
  }

  async liberar(): Promise<void> {
    const Voice = getVoice();
    pitido(false);
    if (!Voice) return;
    try {
      await Voice.destroy();
      Voice.removeAllListeners();
    } catch { /* noop */ }
  }
}

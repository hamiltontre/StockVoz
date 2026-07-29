import { MotorGoogle } from './motorGoogle';
import { MotorVosk } from './motorVosk';
import type { MotorVoz } from './motor';

/**
 * Elige qué motor usa la app en cada momento.
 *
 * ESTRATEGIA (decidida con datos de campo):
 *
 * - SIN internet → Vosk. Es el único que funciona de verdad sin conexión:
 *   el paquete offline de Google falla en varios equipos (visto en el
 *   Infinix de pruebas) y la transcripción se degrada mucho.
 *
 * - CON internet → Google. Su léxico es mucho más grande y se actualiza del
 *   lado del servidor, así que escribe marcas y palabras nuevas que el
 *   modelo pequeño de Vosk (39 MB, dentro del teléfono) no trae.
 *
 * NINGUNO de los dos "aprende" marcas: un reconocedor solo puede escribir
 * palabras de su léxico. Lo que hace que "Xedex" o "Tortrix" terminen en el
 * carrito no es el motor, sino la búsqueda por parecido y las palabras que
 * el dueño le enseña — y eso funciona igual con los dos.
 *
 * Si el preferido no está disponible se usa el otro: la venta nunca se
 * queda sin voz por culpa de un motor.
 */

const google = new MotorGoogle();
const vosk = new MotorVosk();

export interface EleccionMotor {
  motor: MotorVoz;
  /** Para mostrarle al vendedor por qué está funcionando distinto. */
  razon: 'offline-vosk' | 'online-google' | 'unico-disponible';
}

export function seleccionarMotor(hayInternet: boolean): EleccionMotor | null {
  const voskOk = vosk.estaDisponible();
  const googleOk = google.estaDisponible();

  if (!voskOk && !googleOk) return null;

  if (!hayInternet) {
    if (voskOk) return { motor: vosk, razon: 'offline-vosk' };
    return { motor: google, razon: 'unico-disponible' };
  }

  if (googleOk) return { motor: google, razon: 'online-google' };
  return { motor: vosk, razon: 'unico-disponible' };
}

/** Motores existentes, para liberar recursos al salir de la pantalla. */
export const MOTORES: readonly MotorVoz[] = [google, vosk];

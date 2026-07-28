package com.stockvoz.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioManager;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Silencia el pitido del reconocedor de voz mientras StockVoz escucha.
 *
 * POR QUÉ EXISTE: Android emite un beep al abrir y al cerrar el micrófono y
 * no hay API para desactivarlo. En StockVoz la escucha es continua (el
 * reconocedor se re-arma cada vez que Google corta por silencio, para dejar
 * pensar al vendedor), así que se oiría un pitido cada dos segundos:
 * inusable detrás de un mostrador.
 *
 * QUÉ SILENCIA: solo MUSIC y SYSTEM. NO toca llamadas, alarmas ni
 * notificaciones — el dueño no puede perderse una llamada por usar la app.
 *
 * RED DE SEGURIDAD: el estado se persiste. Si la app muere con el sonido
 * silenciado, se restaura en el siguiente arranque. Nunca se desilencia
 * algo que no hayamos silenciado nosotros.
 *
 * Vive en el código de la app (no en un parche a la librería de voz) para
 * que sobreviva a actualizaciones de esa dependencia.
 */
public class SilenciadorAudioModule extends ReactContextBaseJavaModule {

  private static final String PREFS = "stockvoz_audio";
  private static final String KEY_SILENCIADO = "silenciado_por_voz";
  private static final int[] STREAMS = {
    AudioManager.STREAM_MUSIC, AudioManager.STREAM_SYSTEM
  };

  private final ReactApplicationContext contexto;
  private boolean silenciado = false;

  public SilenciadorAudioModule(ReactApplicationContext contexto) {
    super(contexto);
    this.contexto = contexto;
    // Un cierre inesperado pudo dejar el sonido apagado: restaurarlo.
    try {
      SharedPreferences prefs = contexto.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      if (prefs.getBoolean(KEY_SILENCIADO, false)) {
        silenciado = true;
        restaurar();
      }
    } catch (Exception ignored) { }
  }

  @Override
  public String getName() {
    return "SilenciadorAudio";
  }

  private AudioManager audio() {
    try {
      return (AudioManager) contexto.getSystemService(Context.AUDIO_SERVICE);
    } catch (Exception e) {
      return null;
    }
  }

  private void marcar(boolean valor) {
    try {
      contexto.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putBoolean(KEY_SILENCIADO, valor).apply();
    } catch (Exception ignored) { }
  }

  private void aplicar(int direccion) {
    AudioManager am = audio();
    if (am == null) return;
    for (int stream : STREAMS) {
      try {
        am.adjustStreamVolume(stream, direccion, 0);
      } catch (Exception ignored) {
        // Sin permiso o bloqueado por No Molestar: seguimos sin romper nada,
        // el peor caso es que se oiga el pitido.
      }
    }
  }

  /** Silencia mientras dura la escucha. Idempotente. */
  @ReactMethod
  public void silenciar() {
    if (silenciado) return;
    silenciado = true;
    marcar(true);
    aplicar(AudioManager.ADJUST_MUTE);
  }

  /** Devuelve el sonido. Idempotente. */
  @ReactMethod
  public void restaurar() {
    if (!silenciado) return;
    silenciado = false;
    marcar(false);
    aplicar(AudioManager.ADJUST_UNMUTE);
  }
}

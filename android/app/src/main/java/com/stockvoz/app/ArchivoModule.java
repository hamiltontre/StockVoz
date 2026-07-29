package com.stockvoz.app;

import android.content.Context;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

/**
 * Guarda un reporte de texto en un archivo del teléfono.
 *
 * POR QUÉ EXISTE: el diagnóstico de voz solo se podía sacar con el botón
 * Compartir, que obliga a mandárselo a un contacto de WhatsApp o al correo
 * para poder leerlo. Eso es incómodo para el dueño (tiene que auto-enviarse
 * mensajes) y hace imposible revisar los resultados de una prueba sin
 * publicar los datos del negocio en algún chat.
 *
 * Escribe en getExternalFilesDir, que es la carpeta propia de la app dentro
 * del almacenamiento compartido:
 *   Android/data/com.stockvoz.app/files/
 * Se puede abrir con cualquier explorador de archivos y adjuntar donde sea,
 * no necesita permisos y Android la borra al desinstalar la app.
 *
 * No se usa una librería para esto: son treinta líneas y ya teníamos un
 * módulo nativo propio, así que no vale sumar otra dependencia nativa.
 */
public class ArchivoModule extends ReactContextBaseJavaModule {

  private final ReactApplicationContext contexto;

  public ArchivoModule(ReactApplicationContext contexto) {
    super(contexto);
    this.contexto = contexto;
  }

  @Override
  public String getName() {
    return "ArchivoStockVoz";
  }

  /**
   * Guarda `texto` en un archivo y devuelve su ruta completa.
   * Rechaza con el error real para que la pantalla pueda avisarle al dueño
   * en vez de fallar en silencio.
   */
  @ReactMethod
  public void guardarTexto(String nombre, String texto, Promise promesa) {
    try {
      File carpeta = contexto.getExternalFilesDir(null);
      if (carpeta == null) {
        promesa.reject("sin_almacenamiento", "No hay almacenamiento disponible");
        return;
      }
      if (!carpeta.exists() && !carpeta.mkdirs()) {
        promesa.reject("sin_carpeta", "No se pudo crear la carpeta");
        return;
      }
      // Nunca dejar que el nombre escape de la carpeta.
      String limpio = nombre.replaceAll("[^A-Za-z0-9._-]", "_");
      File destino = new File(carpeta, limpio);
      try (OutputStreamWriter w = new OutputStreamWriter(
              new FileOutputStream(destino), StandardCharsets.UTF_8)) {
        w.write(texto);
      }
      promesa.resolve(destino.getAbsolutePath());
    } catch (Exception e) {
      promesa.reject("error_al_guardar", String.valueOf(e));
    }
  }
}

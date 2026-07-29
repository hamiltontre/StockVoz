#!/bin/bash
# Descarga el modelo de voz offline (Vosk español) y lo deja donde Android
# lo empaqueta. El modelo pesa ~58 MB descomprimido y NO se versiona en el
# repo, así que este script es obligatorio antes del primer build nativo.
#
#   bash scripts/descargar-modelo-voz.sh
set -e

MODELO="vosk-model-small-es-0.42"
URL="https://alphacephei.com/vosk/models/${MODELO}.zip"
DESTINO="android/app/src/main/assets"
# La descarga se guarda FUERA de assets/ a propósito: Expo empaqueta todo
# lo que hay en assets/, así que tenerla ahí metía el modelo dos veces en
# el APK (57 MB de más, la mitad del peso de la app).
TEMP=".cache/modelo-voz"

cd "$(dirname "$0")/.."

if [ -d "$DESTINO/$MODELO" ]; then
  echo "✓ El modelo ya está en $DESTINO/$MODELO"
  exit 0
fi

mkdir -p "$TEMP" "$DESTINO"

if [ ! -f "$TEMP/${MODELO}.zip" ]; then
  echo "Descargando el modelo de voz (~38 MB)..."
  curl -L -# -o "$TEMP/${MODELO}.zip" "$URL"
fi

echo "Descomprimiendo..."
unzip -q -o "$TEMP/${MODELO}.zip" -d "$TEMP"
cp -r "$TEMP/$MODELO" "$DESTINO/"

# OBLIGATORIO: la librería de Vosk copia el modelo de los assets al
# almacenamiento del teléfono y usa este archivo para saber si ya lo copió
# antes. Si no existe, StorageService.unpack lanza FileNotFoundException y
# el motor offline NUNCA carga. Los modelos oficiales no lo incluyen.
# El contenido solo debe ser estable entre ejecuciones; al cambiar de
# modelo cambia y el teléfono vuelve a copiarlo.
echo "$MODELO" > "$DESTINO/$MODELO/uuid"

echo "✓ Modelo listo en $DESTINO/$MODELO"
echo "  Ahora se puede compilar: npx expo run:android"

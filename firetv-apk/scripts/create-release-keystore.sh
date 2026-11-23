#!/usr/bin/env bash
# Genera un keystore de release ESTABLE para firmar el APK de Fire TV.
# Ejecutar UNA vez en tu máquina; luego sube los valores como Secrets de GitHub.
# NO commits ni subas el .jks al repositorio.
set -euo pipefail

OUT_DIR="${1:-.}"
KEYSTORE_PATH="${OUT_DIR}/igc-firetv-release.jks"
ALIAS="${KEY_ALIAS:-igc_firetv}"

if [ -f "$KEYSTORE_PATH" ]; then
  echo "Ya existe: $KEYSTORE_PATH — no se sobrescribe."
  exit 1
fi

echo "Se creará: $KEYSTORE_PATH (alias: $ALIAS)"
echo "Guarda las contraseñas en un lugar seguro; GitHub Actions las usará como secrets."
keytool -genkeypair \
  -v \
  -keystore "$KEYSTORE_PATH" \
  -storetype JKS \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias "$ALIAS"

echo
echo "=== Configura estos Secrets en GitHub → Settings → Secrets and variables → Actions ==="
echo "  ANDROID_KEYSTORE_BASE64   = $(base64 -w0 "$KEYSTORE_PATH" 2>/dev/null || base64 "$KEYSTORE_PATH" | tr -d '\n')"
echo "  ANDROID_KEYSTORE_PASSWORD = (la store password que acabas de elegir)"
echo "  ANDROID_KEY_ALIAS         = $ALIAS"
echo "  ANDROID_KEY_PASSWORD      = (la key password; suele ser la misma que la store)"
echo
echo "CUIDADO: el base64 de arriba es el keystore completo. No lo pegues en issues/PRs públicos."
echo "Copia ANDROID_KEYSTORE_BASE64 desde el archivo con:"
echo "  base64 -w0 \"$KEYSTORE_PATH\" | pbcopy   # o xclip / wl-copy"
echo
echo "Después de configurar los secrets, re-ejecuta el workflow Build Fire TV APK."
echo "Si el Fire TV ya tiene la app con firma debug: desinstalar una vez e instalar el nuevo APK."

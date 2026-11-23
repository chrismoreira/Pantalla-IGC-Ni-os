# Pantalla IGC · APK Nativa Gratuita para Amazon Fire TV

Este proyecto Android/Kotlin genera una **aplicación nativa gratuita (`.apk`)** para **Amazon Fire TV Stick** sin depender de apps de kiosco de pago:
- **Ícono y Banner Leanback oficiales** de Iglesia Gran Comisión (`ic_igc_launcher`, `tv_banner`).
- **Modo Kiosco 1920x1080**: pantalla siempre encendida (`FLAG_KEEP_SCREEN_ON`), pantalla completa y aceleración por hardware.
- **Autoplay de YouTube** habilitado (`mediaPlaybackRequiresUserGesture = false`).
- **Control remoto Fire TV nativo**: `OK/Centro`, `Menú`, `Izq/Der`, `Arriba/Abajo` y `Atrás` mapeados a los atajos del menú en pantalla.
- **Limpieza automática de códecs** en `onStop()` para evitar bloqueos de video en Fire OS.

## Firma / actualizaciones (importante)

Android y Fire OS **bloquean la actualización** si el certificado de firma del APK nuevo no coincide con el de la app ya instalada (“App no instalada”).

| Situación | Qué pasa |
|-----------|----------|
| Builds antiguos con `assembleDebug` en GitHub Actions | Cada runner genera un **keystore debug temporal distinto** → no se puede actualizar encima. |
| Builds `assembleRelease` con el **mismo** keystore en Secrets | Misma firma siempre → **sí se puede actualizar** (auto-update / `adb install -r`). |
| App instalada con firma A, APK nuevo con firma B | Hay que **desinstalar** la app e instalar de nuevo. |

### Migración una sola vez (debug → release estable)

Si el Fire TV ya tiene Pantalla IGC instalada desde un APK **debug** (o cualquier firma distinta):

1. En el Fire TV: **Configuración → Aplicaciones → Administrar aplicaciones instaladas → Pantalla IGC → Desinstalar**.
2. Instala el APK del release [`firetv-latest`](https://github.com/chrismoreira/Pantalla-IGC-Ni-os/releases/tag/firetv-latest) firmado con el keystore estable.
3. A partir de ahí, las nuevas versiones del mismo keystore se actualizan **sin** desinstalar.

### Secrets de GitHub Actions (keystore estable)

El workflow `.github/workflows/build-firetv-apk.yml` **exige** estos secrets del repositorio para publicar `firetv-latest`. Sin ellos el job falla (no vuelve a publicar un APK debug por accidente).

| Secret | Contenido |
|--------|-----------|
| `ANDROID_KEYSTORE_BASE64` | Archivo `.jks` / `.keystore` codificado en base64 (una sola línea) |
| `ANDROID_KEYSTORE_PASSWORD` | Contraseña del keystore |
| `ANDROID_KEY_ALIAS` | Alias de la clave (p. ej. `igc_firetv`) |
| `ANDROID_KEY_PASSWORD` | Contraseña de la clave |

Generar el keystore **una vez** en tu máquina (no lo subas al repo):

```bash
cd firetv-apk
chmod +x scripts/create-release-keystore.sh
./scripts/create-release-keystore.sh .
# Luego: Settings → Secrets and variables → Actions → New repository secret
# ANDROID_KEYSTORE_BASE64=$(base64 -w0 igc-firetv-release.jks)
```

Tras guardar los cuatro secrets, vuelve a ejecutar **Actions → Build Fire TV APK** (o haz push a `main`). El release `firetv-latest` quedará firmado de forma estable.

Para un artefacto debug de prueba (sin publicar release): **workflow_dispatch** con `allow_debug_only=true`.

## Opción 1: Compilar el `.apk` gratis en la nube (sin instalar Android Studio)
1. Sube este proyecto a un repositorio en **GitHub**.
2. Configura los secrets de firma (tabla de arriba).
3. El flujo `.github/workflows/build-firetv-apk.yml` compila el APK **release** firmado y publica el tag `firetv-latest`.
4. Descarga desde [Releases / firetv-latest](https://github.com/chrismoreira/Pantalla-IGC-Ni-os/releases/tag/firetv-latest) o desde el artifact del run en **Actions**.

## Opción 2: Compilar el `.apk` gratis en tu computadora con Android Studio
1. Abre la carpeta `firetv-apk/` en **Android Studio** (gratuito).
2. Verifica en `app/src/main/res/values/strings.xml` que `kiosk_url` apunte a la URL pública de la aplicación.
3. Para release firmado, exporta las mismas variables de entorno (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) y ejecuta `./gradlew assembleRelease`.
4. O usa **Build > Build Bundle(s) / APK(s) > Build APK(s)** (debug local; no sirve para actualizar sobre el APK de Releases).

## Cómo instalar el `.apk` en el Fire TV
1. En el Fire TV ve a **Configuración > Mi Fire TV > Opciones para desarrolladores** y activa **Apps de origen desconocido** (o **Depuración ADB**).
2. Instala el `.apk` de cualquiera de estas dos formas gratuitas:
   - **Con la app gratuita Downloader** (en la tienda de Amazon): escribe la URL directa de tu `.apk` e instala.
   - **Desde tu computadora por Wi-Fi con ADB**:
     ```bash
     adb connect IP_DEL_FIRE_TV:5555
     adb install -r Pantalla-IGC-FireTV.apk
     ```
     Si falla por firma distinta: `adb uninstall org.igc.cuidadoninos.tv` y luego `adb install Pantalla-IGC-FireTV.apk`.

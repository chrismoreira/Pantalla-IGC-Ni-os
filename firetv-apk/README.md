# Pantalla IGC · APK Nativa Gratuita para Amazon Fire TV

Este proyecto Android/Kotlin genera una **aplicación nativa gratuita (`.apk`)** para **Amazon Fire TV Stick** sin depender de apps de kiosco de pago:
- **Ícono y Banner Leanback oficiales** de Iglesia Gran Comisión (`ic_igc_launcher`, `tv_banner`).
- **Modo Kiosco 1920x1080**: pantalla siempre encendida (`FLAG_KEEP_SCREEN_ON`), pantalla completa y aceleración por hardware.
- **Autoplay de YouTube** habilitado (`mediaPlaybackRequiresUserGesture = false`).
- **Control remoto Fire TV nativo**: `OK/Centro`, `Menú`, `Izq/Der`, `Arriba/Abajo` y `Atrás` mapeados a los atajos del menú en pantalla.
- **Limpieza automática de códecs** en `onStop()` para evitar bloqueos de video en Fire OS.

## Opción 1: Compilar el `.apk` gratis en la nube (sin instalar Android Studio)
1. Sube este proyecto a un repositorio en **GitHub**.
2. El flujo incluido en `.github/workflows/build-firetv-apk.yml` compila automáticamente el APK en GitHub Actions.
3. En la pestaña **Actions**, descarga el archivo **`Pantalla-IGC-FireTV-APK`** (`app-debug.apk`).

## Opción 2: Compilar el `.apk` gratis en tu computadora con Android Studio
1. Abre la carpeta `firetv-apk/` en **Android Studio** (gratuito).
2. Verifica en `app/src/main/res/values/strings.xml` que `kiosk_url` apunte a la URL pública de la aplicación.
3. Ve a **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

## Cómo instalar el `.apk` en el Fire TV
1. En el Fire TV ve a **Configuración > Mi Fire TV > Opciones para desarrolladores** y activa **Apps de origen desconocido** (o **Depuración ADB**).
2. Instala el `.apk` de cualquiera de estas dos formas gratuitas:
   - **Con la app gratuita Downloader** (en la tienda de Amazon): escribe la URL directa de tu `.apk` e instala.
   - **Desde tu computadora por Wi-Fi con ADB**:
     ```bash
     adb connect IP_DEL_FIRE_TV:5555
     adb install -r app-debug.apk
     ```

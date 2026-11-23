package org.igc.cuidadoninos.tv

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var rootContainer: FrameLayout
    private lateinit var webView: WebView
    private var customVideoView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private val updateExecutor = Executors.newSingleThreadExecutor()
    private var updatePromptedInSession = false
    private var lastUpdateCheckMs = 0L
    private var webPageLoaded = false
    private var activePinDialog: AlertDialog? = null

    private val kioskUrl: String by lazy {
        getString(R.string.kiosk_url)
    }

    private val prefs by lazy {
        getSharedPreferences("igc_kiosk_prefs", Context.MODE_PRIVATE)
    }

    private fun getExitPin(): String {
        val saved = prefs.getString("exit_pin", null)?.trim()
        return if (!saved.isNullOrEmpty() && Regex("^\\d{4,8}$").matches(saved)) {
            saved
        } else {
            getString(R.string.default_kiosk_pin)
        }
    }

    inner class KioskJsBridge {
        @JavascriptInterface
        fun isNativeKiosk(): Boolean = true

        @JavascriptInterface
        fun setExitPin(pin: String?) {
            val cleaned = pin?.trim() ?: return
            if (Regex("^\\d{4,8}$").matches(cleaned)) {
                prefs.edit().putString("exit_pin", cleaned).apply()
            }
        }

        @JavascriptInterface
        fun requestExitWithPin() {
            runOnUiThread {
                showExitPinDialog()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        rootContainer = FrameLayout(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
        }

        webView = WebView(this).apply {
            // Fondo transparente y sin LAYER_TYPE_HARDWARE para no tapar ni poner en negro la capa de video en Fire OS
            setBackgroundColor(Color.TRANSPARENT)
            isFocusable = true
            isFocusableInTouchMode = true

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                loadWithOverviewMode = true
                useWideViewPort = true
                textZoom = 100
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            }

            addJavascriptInterface(KioskJsBridge(), "IGCKiosk")

            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    if (url != null && url != "about:blank") {
                        webPageLoaded = true
                    }
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    if (request?.isForMainFrame == true) {
                        webPageLoaded = false
                        view?.postDelayed({ view.loadUrl(kioskUrl) }, 5000)
                    }
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                    if (view == null) return
                    customVideoView = view
                    customViewCallback = callback
                    rootContainer.addView(
                        view,
                        FrameLayout.LayoutParams(
                            FrameLayout.LayoutParams.MATCH_PARENT,
                            FrameLayout.LayoutParams.MATCH_PARENT
                        )
                    )
                    webView.visibility = View.GONE
                }

                override fun onHideCustomView() {
                    customVideoView?.let { rootContainer.removeView(it) }
                    customVideoView = null
                    customViewCallback?.onCustomViewHidden()
                    customViewCallback = null
                    webView.visibility = View.VISIBLE
                }
            }
        }

        rootContainer.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(rootContainer)
        enableImmersiveMode()
        webView.loadUrl(kioskUrl)
        checkGitHubReleaseForUpdate()
    }

    override fun onResume() {
        super.onResume()
        enableImmersiveMode()
        webView.onResume()
        if (webView.url == null || webView.url == "about:blank") {
            webView.loadUrl(kioskUrl)
        }
        checkGitHubReleaseForUpdate()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onStop() {
        super.onStop()
        // Libera decodificadores de video en Fire OS al salir a segundo plano
        webView.loadUrl("about:blank")
    }

    override fun onDestroy() {
        activePinDialog?.dismiss()
        activePinDialog = null
        updateExecutor.shutdownNow()
        webView.destroy()
        super.onDestroy()
    }

    private fun showExitPinDialog() {
        if (activePinDialog?.isShowing == true) return

        val expectedPin = getExitPin()
        val entered = StringBuilder()

        val dp = resources.displayMetrics.density
        fun px(value: Int): Int = (value * dp).toInt()

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(px(28), px(24), px(28), px(24))
            setBackgroundColor(Color.parseColor("#16403D"))
        }

        val titleView = TextView(this).apply {
            text = "Modo administrador Fire TV"
            textSize = 20f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#FAF2E6"))
            gravity = Gravity.CENTER
        }

        val subtitleView = TextView(this).apply {
            text = "Ingresa el PIN para salir o configurar red"
            textSize = 14f
            setTextColor(Color.parseColor("#E9D0AC"))
            gravity = Gravity.CENTER
            setPadding(0, px(6), 0, px(14))
        }

        val pinDisplay = TextView(this).apply {
            textSize = 26f
            typeface = Typeface.MONOSPACE
            setTextColor(Color.parseColor("#FEC34C"))
            gravity = Gravity.CENTER
            setPadding(px(16), px(12), px(16), px(12))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#0D2725"))
                cornerRadius = px(10).toFloat()
            }
        }

        val errorView = TextView(this).apply {
            text = ""
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#FD7D42"))
            gravity = Gravity.CENTER
            setPadding(0, px(8), 0, px(10))
        }

        fun refreshDisplay() {
            if (entered.isEmpty()) {
                pinDisplay.text = "_ _ _ _"
            } else {
                pinDisplay.text = "* ".repeat(entered.length).trim()
            }
        }
        refreshDisplay()

        container.addView(titleView)
        container.addView(subtitleView)
        container.addView(
            pinDisplay,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        )
        container.addView(errorView)

        val grid = GridLayout(this).apply {
            columnCount = 3
            rowCount = 4
        }

        lateinit var dialog: AlertDialog

        fun verifyPin() {
            if (entered.toString() == expectedPin) {
                dialog.dismiss()
                showUnlockedActionsDialog()
            } else {
                errorView.text = "PIN incorrecto. Intenta de nuevo."
                entered.clear()
                refreshDisplay()
            }
        }

        val keys = listOf(
            "1", "2", "3",
            "4", "5", "6",
            "7", "8", "9",
            "Borrar", "0", "Entrar"
        )

        var firstFocusBtn: Button? = null
        keys.forEach { label ->
            val isAction = label == "Entrar" || label == "Borrar"
            val btnBg = if (label == "Entrar") "#4DB8AF" else "#1D4D49"
            val btn = createTvButton(
                label = label,
                normalColor = Color.parseColor(btnBg),
                focusedColor = Color.parseColor("#FEC34C"),
                normalTextColor = if (label == "Entrar") Color.parseColor("#0D2725") else Color.parseColor("#FAF2E6"),
                focusedTextColor = Color.parseColor("#0D2725"),
                textSizeSp = if (isAction) 14f else 18f
            ) {
                errorView.text = ""
                when (label) {
                    "Borrar" -> {
                        if (entered.isNotEmpty()) {
                            entered.deleteCharAt(entered.length - 1)
                            refreshDisplay()
                        }
                    }
                    "Entrar" -> verifyPin()
                    else -> {
                        if (entered.length < 8) {
                            entered.append(label)
                            refreshDisplay()
                            if (entered.length == expectedPin.length && entered.toString() == expectedPin) {
                                verifyPin()
                            }
                        }
                    }
                }
            }

            if (firstFocusBtn == null) firstFocusBtn = btn

            val params = GridLayout.LayoutParams().apply {
                width = px(92)
                height = px(48)
                setMargins(px(5), px(5), px(5), px(5))
            }
            grid.addView(btn, params)
        }

        container.addView(grid)

        val cancelBtn = createTvButton(
            label = "Cancelar y volver a Pantalla IGC",
            normalColor = Color.parseColor("#0D2725"),
            focusedColor = Color.parseColor("#FD7D42"),
            normalTextColor = Color.parseColor("#E9D0AC"),
            focusedTextColor = Color.parseColor("#0D2725"),
            textSizeSp = 14f
        ) {
            dialog.dismiss()
        }
        container.addView(
            cancelBtn,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                px(46)
            ).apply {
                topMargin = px(12)
            }
        )

        dialog = AlertDialog.Builder(this)
            .setView(container)
            .setCancelable(true)
            .create()

        dialog.setOnDismissListener {
            activePinDialog = null
            enableImmersiveMode()
        }

        activePinDialog = dialog
        dialog.show()
        firstFocusBtn?.requestFocus()
    }

    private fun showUnlockedActionsDialog() {
        val dp = resources.displayMetrics.density
        fun px(value: Int): Int = (value * dp).toInt()

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(28), px(24), px(28), px(24))
            setBackgroundColor(Color.parseColor("#16403D"))
        }

        val titleView = TextView(this).apply {
            text = "Acceso autorizado"
            textSize = 20f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#4DB8AF"))
            gravity = Gravity.CENTER
        }
        container.addView(titleView)

        val versionView = TextView(this).apply {
            text = "Versión instalada: v${getLocalVersionName()}"
            textSize = 13f
            setTextColor(Color.parseColor("#E9D0AC"))
            gravity = Gravity.CENTER
            setPadding(0, px(4), 0, px(8))
        }
        container.addView(versionView)

        val updateStatusView = TextView(this).apply {
            text = ""
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#FEC34C"))
            gravity = Gravity.CENTER
            visibility = View.GONE
            setPadding(0, 0, 0, px(12))
        }
        container.addView(updateStatusView)

        lateinit var dialog: AlertDialog
        lateinit var updateBtn: Button
        var isCheckingUpdate = false

        val homeBtn = createTvButton(
            label = "Ir al inicio de Fire TV (Salir)",
            normalColor = Color.parseColor("#FD7D42"),
            focusedColor = Color.parseColor("#FEC34C"),
            normalTextColor = Color.parseColor("#0D2725"),
            focusedTextColor = Color.parseColor("#0D2725"),
            textSizeSp = 16f
        ) {
            dialog.dismiss()
            val homeIntent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(homeIntent)
            finish()
        }

        updateBtn = createTvButton(
            label = "Buscar actualizaciones ahora",
            normalColor = Color.parseColor("#4DB8AF"),
            focusedColor = Color.parseColor("#FEC34C"),
            normalTextColor = Color.parseColor("#0D2725"),
            focusedTextColor = Color.parseColor("#0D2725"),
            textSizeSp = 16f
        ) {
            if (isCheckingUpdate) return@createTvButton
            isCheckingUpdate = true
            updateBtn.text = "Buscando actualizaciones..."
            updateStatusView.visibility = View.VISIBLE
            updateStatusView.setTextColor(Color.parseColor("#FEC34C"))
            updateStatusView.text = "Consultando última versión en GitHub..."

            checkGitHubReleaseForUpdate(manual = true) { message, inProgress, isError ->
                if (!dialog.isShowing) return@checkGitHubReleaseForUpdate
                updateStatusView.visibility = View.VISIBLE
                updateStatusView.setTextColor(
                    when {
                        isError -> Color.parseColor("#FD7D42")
                        inProgress -> Color.parseColor("#FEC34C")
                        else -> Color.parseColor("#4DB8AF")
                    }
                )
                updateStatusView.text = message
                if (!inProgress) {
                    isCheckingUpdate = false
                    updateBtn.text = "Buscar actualizaciones ahora"
                }
            }
        }

        val wifiBtn = createTvButton(
            label = "Configurar Wi-Fi y red",
            normalColor = Color.parseColor("#1D4D49"),
            focusedColor = Color.parseColor("#FEC34C"),
            normalTextColor = Color.parseColor("#FAF2E6"),
            focusedTextColor = Color.parseColor("#0D2725"),
            textSizeSp = 16f
        ) {
            dialog.dismiss()
            try {
                startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) {
                startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }

        val settingsBtn = createTvButton(
            label = "Ajustes del dispositivo Fire TV",
            normalColor = Color.parseColor("#1D4D49"),
            focusedColor = Color.parseColor("#FEC34C"),
            normalTextColor = Color.parseColor("#FAF2E6"),
            focusedTextColor = Color.parseColor("#0D2725"),
            textSizeSp = 16f
        ) {
            dialog.dismiss()
            startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }

        val stayBtn = createTvButton(
            label = "Volver a Pantalla IGC",
            normalColor = Color.parseColor("#0D2725"),
            focusedColor = Color.parseColor("#4DB8AF"),
            normalTextColor = Color.parseColor("#E9D0AC"),
            focusedTextColor = Color.parseColor("#0D2725"),
            textSizeSp = 15f
        ) {
            dialog.dismiss()
        }

        listOf(homeBtn, updateBtn, wifiBtn, settingsBtn, stayBtn).forEach { btn ->
            container.addView(
                btn,
                LinearLayout.LayoutParams(px(340), px(50)).apply {
                    bottomMargin = px(10)
                }
            )
        }

        dialog = AlertDialog.Builder(this)
            .setView(container)
            .setCancelable(true)
            .create()

        dialog.setOnDismissListener {
            activePinDialog = null
            enableImmersiveMode()
        }

        activePinDialog = dialog
        dialog.show()
        homeBtn.requestFocus()
    }

    private fun createTvButton(
        label: String,
        normalColor: Int,
        focusedColor: Int,
        normalTextColor: Int,
        focusedTextColor: Int,
        textSizeSp: Float,
        onClick: () -> Unit
    ): Button {
        val dp = resources.displayMetrics.density
        val radius = 10f * dp

        val normalDrawable = GradientDrawable().apply {
            setColor(normalColor)
            cornerRadius = radius
        }
        val focusedDrawable = GradientDrawable().apply {
            setColor(focusedColor)
            cornerRadius = radius
        }
        val bg = StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), focusedDrawable)
            addState(intArrayOf(android.R.attr.state_selected), focusedDrawable)
            addState(intArrayOf(), normalDrawable)
        }
        val textColors = ColorStateList(
            arrayOf(
                intArrayOf(android.R.attr.state_focused),
                intArrayOf(android.R.attr.state_selected),
                intArrayOf()
            ),
            intArrayOf(focusedTextColor, focusedTextColor, normalTextColor)
        )

        return Button(this).apply {
            text = label
            textSize = textSizeSp
            isAllCaps = false
            typeface = Typeface.DEFAULT_BOLD
            isFocusable = true
            isFocusableInTouchMode = false
            background = bg
            setTextColor(textColors)
            setOnClickListener { onClick() }
        }
    }

    private fun checkGitHubReleaseForUpdate(
        manual: Boolean = false,
        onStatus: ((message: String, inProgress: Boolean, isError: Boolean) -> Unit)? = null
    ) {
        if (!manual) {
            if (updatePromptedInSession) return
            val now = System.currentTimeMillis()
            if (now - lastUpdateCheckMs < 10 * 60 * 1000L) return
            lastUpdateCheckMs = now
        }

        val releaseApi = getString(R.string.github_release_api)
        if (releaseApi.isBlank()) {
            if (manual) {
                onStatus?.invoke("No hay repositorio de actualizaciones configurado.", false, true)
            }
            return
        }

        fun reportStatus(message: String, inProgress: Boolean, isError: Boolean = false) {
            if (onStatus == null || isFinishing || isDestroyed) return
            runOnUiThread {
                onStatus(message, inProgress, isError)
            }
        }

        updateExecutor.execute {
            try {
                val localVersionCode = getLocalVersionCode()
                val localVersionName = getLocalVersionName()
                val conn = (URL(releaseApi).openConnection() as HttpURLConnection).apply {
                    useCaches = false
                    connectTimeout = 8000
                    readTimeout = 8000
                    setRequestProperty("Accept", "application/vnd.github+json")
                    setRequestProperty("Cache-Control", "no-cache")
                    setRequestProperty("User-Agent", "PantallaIGC-FireTV")
                }
                if (conn.responseCode != 200) {
                    reportStatus(
                        "No se pudo consultar GitHub (código ${conn.responseCode}).",
                        false,
                        true
                    )
                    return@execute
                }

                val jsonText = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(jsonText)
                val body = json.optString("body", "")
                val vcMatch = Regex("\\[vc:(\\d+)]").find(body)
                val remoteVersionCode = vcMatch?.groupValues?.getOrNull(1)?.toLongOrNull()
                if (remoteVersionCode == null) {
                    reportStatus("No se encontró versión válida en el Release.", false, true)
                    return@execute
                }

                if (remoteVersionCode <= localVersionCode) {
                    reportStatus(
                        "Ya tienes la última versión (v$localVersionName).",
                        false,
                        false
                    )
                    return@execute
                }

                val assets = json.optJSONArray("assets")
                var apkDownloadUrl: String? = null
                if (assets != null) {
                    for (i in 0 until assets.length()) {
                        val asset = assets.getJSONObject(i)
                        if (asset.optString("name").endsWith(".apk")) {
                            apkDownloadUrl = asset.optString("browser_download_url")
                            break
                        }
                    }
                }
                if (apkDownloadUrl.isNullOrBlank()) {
                    reportStatus("El Release nuevo aún no tiene archivo APK.", false, true)
                    return@execute
                }

                reportStatus(
                    "Nueva versión v1.0.$remoteVersionCode encontrada. Descargando...",
                    true,
                    false
                )

                val updatesDir = File(cacheDir, "updates").apply { mkdirs() }
                val apkFile = File(updatesDir, "Pantalla-IGC-FireTV-update.apk")

                val apkConn = (URL(apkDownloadUrl).openConnection() as HttpURLConnection).apply {
                    useCaches = false
                    instanceFollowRedirects = true
                    connectTimeout = 15000
                    readTimeout = 30000
                    setRequestProperty("User-Agent", "PantallaIGC-FireTV")
                }
                if (apkConn.responseCode != 200) {
                    reportStatus(
                        "Error al descargar actualización (${apkConn.responseCode}).",
                        false,
                        true
                    )
                    return@execute
                }

                apkConn.inputStream.use { input ->
                    apkFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }

                updatePromptedInSession = true
                runOnUiThread {
                    onStatus?.invoke("Descarga lista. Abriendo instalador...", false, false)
                    activePinDialog?.dismiss()
                    val uri = FileProvider.getUriForFile(
                        this,
                        "${packageName}.fileprovider",
                        apkFile
                    )
                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, "application/vnd.android.package-archive")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    startActivity(intent)
                }
            } catch (_: Exception) {
                if (manual) {
                    reportStatus(
                        "No se pudo buscar actualizaciones. Revisa tu conexión.",
                        false,
                        true
                    )
                }
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun getLocalVersionCode(): Long {
        val pkgInfo = packageManager.getPackageInfo(packageName, 0)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            pkgInfo.longVersionCode
        } else {
            pkgInfo.versionCode.toLong()
        }
    }

    @Suppress("DEPRECATION")
    private fun getLocalVersionName(): String {
        val pkgInfo = packageManager.getPackageInfo(packageName, 0)
        return pkgInfo.versionName ?: "1.0.${getLocalVersionCode()}"
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (activePinDialog?.isShowing == true) {
            return super.dispatchKeyEvent(event)
        }

        val mappedJsKey = when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER -> "Enter"
            KeyEvent.KEYCODE_MENU -> "m"
            KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
            KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
            KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
            KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
            KeyEvent.KEYCODE_BACK -> "Escape"
            else -> null
        }

        if (mappedJsKey != null) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                if (
                    !webPageLoaded &&
                    (event.keyCode == KeyEvent.KEYCODE_BACK ||
                        event.keyCode == KeyEvent.KEYCODE_MENU ||
                        event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                        event.keyCode == KeyEvent.KEYCODE_ENTER)
                ) {
                    showExitPinDialog()
                    return true
                }

                val script =
                    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'$mappedJsKey',bubbles:true,cancelable:true}));"
                webView.evaluateJavascript(script, null)
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun enableImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )
        }
    }
}

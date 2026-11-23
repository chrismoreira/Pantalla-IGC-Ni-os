package org.igc.cuidadoninos.tv

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
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

    private val kioskUrl: String by lazy {
        getString(R.string.kiosk_url)
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
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            }

            webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    if (request?.isForMainFrame == true) {
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
        updateExecutor.shutdownNow()
        webView.destroy()
        super.onDestroy()
    }

    private fun checkGitHubReleaseForUpdate() {
        if (updatePromptedInSession) return
        val now = System.currentTimeMillis()
        if (now - lastUpdateCheckMs < 10 * 60 * 1000L) return
        lastUpdateCheckMs = now
        val releaseApi = getString(R.string.github_release_api)
        if (releaseApi.isBlank()) return

        updateExecutor.execute {
            try {
                val localVersionCode = getLocalVersionCode()
                val conn = (URL(releaseApi).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 8000
                    readTimeout = 8000
                    setRequestProperty("Accept", "application/vnd.github+json")
                    setRequestProperty("User-Agent", "PantallaIGC-FireTV")
                }
                if (conn.responseCode != 200) return@execute

                val jsonText = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(jsonText)
                val body = json.optString("body", "")
                val vcMatch = Regex("\\[vc:(\\d+)]").find(body) ?: return@execute
                val remoteVersionCode = vcMatch.groupValues[1].toLongOrNull() ?: return@execute

                if (remoteVersionCode <= localVersionCode) return@execute

                val assets = json.optJSONArray("assets") ?: return@execute
                var apkDownloadUrl: String? = null
                for (i in 0 until assets.length()) {
                    val asset = assets.getJSONObject(i)
                    if (asset.optString("name").endsWith(".apk")) {
                        apkDownloadUrl = asset.optString("browser_download_url")
                        break
                    }
                }
                if (apkDownloadUrl.isNullOrBlank()) return@execute

                val updatesDir = File(cacheDir, "updates").apply { mkdirs() }
                val apkFile = File(updatesDir, "Pantalla-IGC-FireTV-update.apk")

                val apkConn = (URL(apkDownloadUrl).openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = true
                    connectTimeout = 15000
                    readTimeout = 30000
                    setRequestProperty("User-Agent", "PantallaIGC-FireTV")
                }
                if (apkConn.responseCode != 200) return@execute

                apkConn.inputStream.use { input ->
                    apkFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }

                updatePromptedInSession = true
                runOnUiThread {
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
                // Ignora fallos de red silenciosamente para no interrumpir la pantalla
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

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val jsKey = when (event.keyCode) {
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

            if (jsKey != null) {
                val script =
                    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'$jsKey',bubbles:true,cancelable:true}));"
                webView.evaluateJavascript(script, null)
                return true
            }
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

package io.nexalink.app.ui

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.Window
import android.view.WindowManager
import android.webkit.*
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.nexalink.app.BuildConfig

/**
 * NexaLink WebView Activity — главный экран приложения.
 *
 * Загружает NexaLink web-приложение в WebView.
 * Поддерживает:
 *   - E2EE через IndexedDB (crypto.subtle в WebView)
 *   - Камера и микрофон для звонков
 *   - Уведомления
 *   - Загрузка и скачивание файлов
 *   - Жест «назад» → навигация в WebView
 */
class WebViewActivity : Activity() {

    private lateinit var webView: WebView
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private val FILE_CHOOSER_REQUEST = 1001
    private val PERMISSIONS_REQUEST = 1002

    private val serverUrl: String by lazy {
        // Сначала из сохранённых настроек, потом из BuildConfig
        getSharedPreferences("nexalink_prefs", MODE_PRIVATE)
            .getString("server_url", BuildConfig.SERVER_URL) ?: BuildConfig.SERVER_URL
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Полноэкранный режим
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )

        // Цвет статус-бара (тёмный, как у WhatsApp)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.statusBarColor = 0xFF0A0A18.toInt()
        }

        // Запрос прав на первом запуске
        requestPermissionsIfNeeded()

        webView = WebView(this)
        setContentView(webView)
        configureWebView()

        // Восстановить состояние или загрузить URL
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(serverUrl)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val settings = webView.settings

        // JavaScript обязателен для React-приложения
        settings.javaScriptEnabled = true

        // DOM Storage / IndexedDB для локального хранения сообщений
        settings.domStorageEnabled = true
        settings.databaseEnabled = true

        // Медиа без жеста пользователя (для входящих звонков)
        settings.mediaPlaybackRequiresUserGesture = false

        // Загрузка файлов
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        // User-agent с пометкой NexaLink (для обнаружения нативного приложения)
        settings.userAgentString = settings.userAgentString + " NexaLinkAndroid/1.0"

        // Масштаб
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.builtInZoomControls = false
        settings.displayZoomControls = false

        // Кэш — использовать по умолчанию (IndexedDB в памяти + диск)
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // Безопасность
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.safeBrowsingEnabled = false
        }

        // Cookies
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        // Навигация внутри приложения
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                return if (url.startsWith(serverUrl) || url.startsWith("about:")) {
                    false // загрузить в WebView
                } else {
                    // Внешние ссылки — открыть в браузере
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    true
                }
            }
        }

        // Права: камера, микрофон, уведомления
        webView.webChromeClient = object : WebChromeClient() {

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = callback
                val intent = params.createIntent()
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST)
                } catch (e: Exception) {
                    fileUploadCallback = null
                    return false
                }
                return true
            }
        }

        // JavaScript-мост: позволяет веб-приложению знать что оно внутри нативного
        webView.addJavascriptInterface(NexaLinkBridge(this), "nexalink")
    }

    private fun requestPermissionsIfNeeded() {
        val needed = mutableListOf<String>()
        val perms = arrayOf(
            android.Manifest.permission.RECORD_AUDIO,
            android.Manifest.permission.CAMERA,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.plus(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        for (p in perms) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                needed.add(p)
            }
        }
        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), PERMISSIONS_REQUEST)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            val results: Array<Uri>? = if (resultCode == RESULT_OK && data != null) {
                data.dataString?.let { arrayOf(Uri.parse(it)) }
            } else null
            fileUploadCallback?.onReceiveValue(results)
            fileUploadCallback = null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            moveTaskToBack(true) // свернуть, не убивать
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        webView.pauseTimers()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }
}

/**
 * JavaScript-мост: веб-приложение может вызвать nexalink.isDesktop() и т.д.
 */
class NexaLinkBridge(private val activity: Activity) {

    @JavascriptInterface
    fun isDesktop() = false

    @JavascriptInterface
    fun isAndroid() = true

    @JavascriptInterface
    fun getVersion() = "1.0.0"

    @JavascriptInterface
    fun getServerUrl(): String = activity
        .getSharedPreferences("nexalink_prefs", Activity.MODE_PRIVATE)
        .getString("server_url", BuildConfig.SERVER_URL) ?: BuildConfig.SERVER_URL

    @JavascriptInterface
    fun setServerUrl(url: String) {
        activity.getSharedPreferences("nexalink_prefs", Activity.MODE_PRIVATE)
            .edit().putString("server_url", url).apply()
    }

    @JavascriptInterface
    fun showToast(message: String) {
        activity.runOnUiThread {
            Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
        }
    }
}

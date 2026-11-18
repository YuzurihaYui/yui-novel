package com.paperlantern.novels

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val netExecutor = Executors.newFixedThreadPool(4)

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = Color.parseColor("#0D1015")
        window.navigationBarColor = Color.parseColor("#0D1015")
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = false

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0D1015"))
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        setContentView(webView, webView.layoutParams)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            loadWithOverviewMode = false
            useWideViewPort = false
            textZoom = 100
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }

        webView.addJavascriptInterface(WebBridge(), "PaperLanternNative")

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                } catch (e: Exception) {
                    true
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback
                return try {
                    startActivityForResult(fileChooserParams.createIntent(), REQ_FILE)
                    true
                } catch (e: Exception) {
                    this@MainActivity.filePathCallback = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    "(function(){return window.__paperlanternBack ? window.__paperlanternBack() : false})()"
                ) { result ->
                    if (result.trim('"') != "true") {
                        moveTaskToBack(true)
                    }
                }
            }
        })

        if (savedInstanceState != null) {
            val restored = webView.restoreState(savedInstanceState)
            if (restored == null) {
                webView.loadUrl(APP_URL)
            }
        } else {
            webView.loadUrl(APP_URL)
        }
    }

    private inner class WebBridge {
        @JavascriptInterface
        fun httpGet(requestId: String, url: String, headersJson: String) {
            netExecutor.execute {
                var ok = false
                var body = ""
                var error = ""
                var connection: HttpURLConnection? = null
                try {
                    val parsed = URL(url)
                    val scheme = parsed.protocol.lowercase()
                    if (scheme != "http" && scheme != "https") throw IllegalArgumentException("BAD_PROTOCOL")
                    connection = (parsed.openConnection() as HttpURLConnection).apply {
                        connectTimeout = 15000
                        readTimeout = 20000
                        instanceFollowRedirects = true
                        setRequestProperty("User-Agent", DEFAULT_UA)
                        setRequestProperty(
                            "Accept",
                            "text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8"
                        )
                    }
                    applyHeaders(connection, headersJson)
                    val code = connection.responseCode
                    if (code in 200..299) {
                        val bytes = connection.inputStream.use { readLimited(it, MAX_BYTES) }
                        body = decodeBytes(bytes, connection.contentType)
                        ok = true
                    } else {
                        error = "HTTP_$code"
                    }
                } catch (e: Exception) {
                    error = e.message ?: "NETWORK_ERROR"
                } finally {
                    connection?.disconnect()
                }
                runOnUiThread {
                    if (!isFinishing && !isDestroyed) {
                        webView.evaluateJavascript(
                            "window.__plHttpDone&&window.__plHttpDone(${jsString(requestId)},$ok,${jsString(body)},${jsString(error)})",
                            null
                        )
                    }
                }
            }
        }
    }

    private fun applyHeaders(connection: HttpURLConnection, headersJson: String) {
        if (headersJson.isBlank()) return
        try {
            val obj = JSONObject(headersJson)
            val blocked = setOf("host", "content-length", "connection", "transfer-encoding")
            for (key in obj.keys()) {
                val name = key.trim()
                if (name.isEmpty() || name.lowercase() in blocked) continue
                val value = obj.optString(name, "")
                if (value.isNotEmpty()) connection.setRequestProperty(name, value)
            }
        } catch (e: Exception) {
        }
    }

    private fun readLimited(input: InputStream, limit: Int): ByteArray {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        var total = 0
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            if (total > limit) throw IOException("RESPONSE_TOO_LARGE")
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }

    private fun decodeBytes(bytes: ByteArray, contentType: String?): String {
        val charsetName = contentType?.let {
            Regex("charset\\s*=\\s*[\"']?([\\w-]+)", RegexOption.IGNORE_CASE)
                .find(it)?.groupValues?.get(1)
        }
        if (!charsetName.isNullOrBlank()) {
            try {
                return String(bytes, Charset.forName(charsetName))
            } catch (e: Exception) {
            }
        }
        if (bytes.size >= 3 &&
            bytes[0] == 0xEF.toByte() &&
            bytes[1] == 0xBB.toByte() &&
            bytes[2] == 0xBF.toByte()
        ) {
            return String(bytes, 3, bytes.size - 3, Charsets.UTF_8)
        }
        return try {
            val decoder = Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
            decoder.decode(ByteBuffer.wrap(bytes)).toString()
        } catch (e: Exception) {
            try {
                String(bytes, Charset.forName("GBK"))
            } catch (inner: Exception) {
                String(bytes, Charsets.UTF_8)
            }
        }
    }

    private fun jsString(value: String): String {
        return JSONObject.quote(value)
            .replace("\u2028", "\\u2028")
            .replace("\u2029", "\\u2029")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FILE) {
            val result = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            filePathCallback?.onReceiveValue(result)
            filePathCallback = null
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onDestroy() {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        netExecutor.shutdownNow()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val REQ_FILE = 1001
        private const val APP_URL = "https://appassets.androidplatform.net/assets/www/index.html"
        private const val MAX_BYTES = 4 * 1024 * 1024
        private const val DEFAULT_UA =
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    }
}
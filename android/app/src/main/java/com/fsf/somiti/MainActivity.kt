package com.fsf.somiti

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

/**
 * Native shell for the Somiti MS web app (Next.js + NextAuth on Vercel).
 *
 * Flow: boot.html (bundled asset) resolves the server — the build-time
 * DEFAULT_SERVER_URL (the Vercel deployment) or an address entered once on
 * first launch — then opens the login page, or /portal straight away when a
 * NextAuth session cookie already exists. The web app's own middleware then
 * routes MEMBER logins to /portal and ADMIN/SUPER_ADMIN to /dashboard, so
 * both interfaces come from one APK.
 *
 * The WebView keeps cookies + DOM storage across launches, so sessions
 * survive app restarts, and it wires up:
 *   - file uploads (deposit slips) via the Chrome file chooser
 *   - PDF/receipt downloads via the system DownloadManager (with auth cookies)
 *   - mailto:/tel:/whatsapp: links via external apps
 *   - a retry / change-server dialog when the server is unreachable
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val BOOT_URL = "file:///android_asset/boot.html"
    }

    private lateinit var webView: WebView
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var fileChooserLauncher: ActivityResultLauncher<Intent>

    /**
     * Bridge for boot.html: build-time server URL, app version, native
     * persistence for the chosen server URL (some device WebViews restrict
     * localStorage on file:// pages), and the login/portal startup decision.
     */
    inner class BootBridge {
        @JavascriptInterface
        fun defaultServerUrl(): String = BuildConfig.DEFAULT_SERVER_URL

        @JavascriptInterface
        fun appVersion(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun saveServerUrl(url: String) {
            getSharedPreferences("somiti_boot", Context.MODE_PRIVATE)
                .edit().putString("server_url", url).apply()
        }

        @JavascriptInterface
        fun savedServerUrl(): String =
            getSharedPreferences("somiti_boot", Context.MODE_PRIVATE)
                .getString("server_url", "") ?: ""

        /**
         * Startup entry point for a server: with no NextAuth session cookie,
         * open the login page; with a session, open /portal — the web app's
         * middleware then routes members to /portal and admins to /dashboard.
         */
        @JavascriptInterface
        fun entryUrlFor(server: String): String {
            val base = server.trim().trimEnd('/')
            val cookies = try {
                CookieManager.getInstance().getCookie(base)
            } catch (e: Exception) {
                null
            }
            // Matches both next-auth.session-token and the __Secure- variant.
            val hasSession = cookies?.contains("next-auth.session-token") == true
            return if (hasSession) "$base/portal" else "$base/login"
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            fitsSystemWindows = true
            setBackgroundColor(0xFF1A1A1A.toInt())
        }
        setContentView(webView)

        setupWebView()

        fileChooserLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            val callback = fileUploadCallback ?: return@registerForActivityResult
            fileUploadCallback = null
            val uris = mutableListOf<Uri>()
            result.data?.data?.let { uris.add(it) }
            result.data?.clipData?.let { clip ->
                for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
            }
            callback.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
            }
        })

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
            if (webView.copyBackForwardList().size == 0) webView.loadUrl(BOOT_URL)
        } else {
            webView.loadUrl(BOOT_URL)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadsImagesAutomatically = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            // Pin text zoom to 100%: device font-scale (Display > Font size)
            // otherwise inflates stat-card figures and breaks the layout —
            // the web app's own responsive type handles mobile sizing.
            textZoom = 100
            // Drop the "; wv" marker so sites that sniff WebViews serve the
            // normal mobile experience, and tag our shell for analytics.
            userAgentString = userAgentString.replace("; wv", "") +
                " SomitiAndroid/" + BuildConfig.VERSION_NAME
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.addJavascriptInterface(BootBridge(), "SomitiApp")
        webView.webViewClient = object : WebViewClient() {

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean = when (request.url.scheme) {
                "http", "https" -> false
                else -> {
                    openExternal(request.url)
                    true
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                // Ignore sub-frame failures (broken images/trackers must not
                // trigger the offline dialog), and never intercept the local
                // boot page itself.
                if (!request.isForMainFrame) return
                val failedUrl = request.url.toString()
                if (failedUrl.startsWith("file://")) return
                runOnUiThread { showServerErrorDialog(failedUrl) }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = callback
                val intent = params.createIntent().apply {
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
                return try {
                    fileChooserLauncher.launch(intent)
                    true
                } catch (e: ActivityNotFoundException) {
                    fileUploadCallback = null
                    toast("No file picker available on this device")
                    false
                }
            }
        }

        webView.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            downloadFile(url, contentDisposition, mimeType)
        }
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (e: ActivityNotFoundException) {
            toast("No app found to open this link")
        }
    }

    /** Server-generated PDFs (receipts, ID cards) go to the Downloads folder. */
    private fun downloadFile(url: String, contentDisposition: String?, mimeType: String?) {
        try {
            val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle(fileName)
                setDescription("Somiti MS")
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                mimeType?.let { setMimeType(it) }
                // The web app only serves receipts to authenticated sessions.
                CookieManager.getInstance().getCookie(url)?.let { addRequestHeader("Cookie", it) }
                setAllowedOverMetered(true)
                setAllowedOverRoaming(true)
            }
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            toast("Downloading $fileName")
        } catch (e: Exception) {
            openExternal(Uri.parse(url))
        }
    }

    private fun showServerErrorDialog(failedUrl: String) {
        if (isFinishing) return
        val host = try {
            Uri.parse(failedUrl).host ?: failedUrl
        } catch (e: Exception) {
            failedUrl
        }
        AlertDialog.Builder(this)
            .setTitle("Cannot reach server")
            .setMessage(
                "The server at $host could not be reached.\n\n" +
                    "Check your internet connection, make sure the server is running, " +
                    "or change the server address."
            )
            .setPositiveButton("Retry") { _, _ -> webView.loadUrl(failedUrl) }
            .setNeutralButton("Change server") { _, _ -> webView.loadUrl("$BOOT_URL#setup") }
            .setCancelable(false)
            .show()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
}

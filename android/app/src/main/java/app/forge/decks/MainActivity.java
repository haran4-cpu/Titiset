package app.forge.decks;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import java.io.File;
import java.io.FileOutputStream;

/** FORGE in a WebView: the web app from the APK's assets, served over https://appassets.androidplatform.net (a secure origin,
 *  so the AudioWorklet, the workers and IndexedDB all work), the screen kept on while it plays, files picked for samples and
 *  sets, and files saved through the system "Create document" picker. Nothing leaves the phone. */
public class MainActivity extends Activity {
    private static final int PICK = 1, SAVE = 2;
    private WebView web; private ValueCallback<Uri[]> picked; private byte[] pendingSave;

    @SuppressLint("SetJavaScriptEnabled") @Override protected void onCreate(Bundle b) {
        super.onCreate(b); getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web = new WebView(this); setContentView(web);
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true); s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false); s.setAllowContentAccess(true); s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return loader.shouldInterceptRequest(r.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { Uri u = r.getUrl(); if ("appassets.androidplatform.net".equals(u.getHost())) return false; startActivity(new Intent(Intent.ACTION_VIEW, u)); return true; } });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) { if (picked != null) picked.onReceiveValue(null); picked = cb;
                try { startActivityForResult(p.createIntent(), PICK); } catch (Exception e) { picked = null; return false; } return true; } });
        web.addJavascriptInterface(new Bridge(), "ForgeAndroid");
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }
    /** window.ForgeAndroid.save(name, base64, mime): the page's exports (WAV, stems zip, set files) go to a file the person picks */
    class Bridge { @JavascriptInterface public void save(String name, String b64, String mime) { pendingSave = Base64.decode(b64, Base64.DEFAULT);
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime); i.putExtra(Intent.EXTRA_TITLE, name);
        runOnUiThread(() -> startActivityForResult(i, SAVE)); } }
    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK && picked != null) { picked.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); picked = null; }
        else if (req == SAVE && res == RESULT_OK && data != null && pendingSave != null) { try (java.io.OutputStream o = getContentResolver().openOutputStream(data.getData())) { o.write(pendingSave); } catch (Exception e) { /* the page keeps its copy */ } pendingSave = null; }
        else super.onActivityResult(req, res, data); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}

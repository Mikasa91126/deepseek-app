package com.deepseekclone.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.LruCache;
import android.util.Size;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Collections;

/**
 * DeepSeek 手机端 WebView 壳：
 * 以 https://appassets.local 作为安全来源托管 dist 静态资源（IndexedDB / 麦克风可用），
 * 处理文件选择（拍照 / 相册 / 文件）与导出文件保存到系统下载目录。
 */
public class MainActivity extends Activity {
    private static final String ASSET_HOST = "appassets.local";
    private static final int REQ_FILE = 1001;
    private static final int REQ_AUDIO = 1002;
    private static final int REQ_NATIVE_ZIP = 1003;
    private static final int REQ_MEDIA_IMAGES = 1004;
    private static final int REQ_CAMERA = 1005;
    private static final int REQ_WRITE_STORAGE = 1006;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri pendingCameraUri;
    private PermissionRequest pendingAudioRequest;
    /** 相册缩略图缓存：避免每次打开「+」面板都重新解码 */
    private final LruCache<String, String> thumbCache = new LruCache<>(80);

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView.setWebContentsDebuggingEnabled(true);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebViewClient(new AssetClient());
        webView.setWebChromeClient(new Chrome());
        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

        setContentView(webView);
        applySystemBars();
        webView.setBackgroundColor(isSystemDark() ? Color.BLACK : Color.WHITE);
        webView.loadUrl("https://" + ASSET_HOST + "/index.html");
    }

    /** 系统是否处于深色模式（WebView 的 prefers-color-scheme 不可靠，网页通过桥接读取） */
    private boolean isSystemDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    /** 状态栏 / 导航栏图标随系统深浅色切换 */
    private void applySystemBars() {
        boolean dark = isSystemDark();
        int background = dark ? Color.BLACK : Color.WHITE;
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        View decor = getWindow().getDecorView();
        int flags = decor.getSystemUiVisibility();
        if (dark) {
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        } else {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decor.setSystemUiVisibility(flags);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applySystemBars();
        if (webView != null) {
            webView.setBackgroundColor(isSystemDark() ? Color.BLACK : Color.WHITE);
            webView.evaluateJavascript(
                    "window.__onNativeThemeChanged && window.__onNativeThemeChanged()", null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 从系统设置改完深浅色返回应用时，配置可能没有触发 onConfigurationChanged
        if (webView != null) {
            applySystemBars();
            webView.setBackgroundColor(isSystemDark() ? Color.BLACK : Color.WHITE);
            webView.evaluateJavascript(
                    "window.__onNativeThemeChanged && window.__onNativeThemeChanged()", null);
        }
    }

    /** 从 assets/www 以 https 来源提供页面与静态资源 */
    private class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null || !ASSET_HOST.equals(uri.getHost())) {
                return null;
            }
            String path = uri.getPath();
            // 安卓端通过系统选择器挑中的历史 ZIP：先拷到缓存，再以同源 URL 提供给页面
            if (path != null && path.startsWith("/__picked__/")) {
                String name = path.substring("/__picked__/".length());
                if (!name.matches("[A-Za-z0-9._-]+")) {
                    return emptyResponse(404);
                }
                File file = new File(new File(getCacheDir(), "picked"), name);
                if (!file.isFile()) {
                    return emptyResponse(404);
                }
                try {
                    return new WebResourceResponse(
                            guessMime(name), null, 200, "OK",
                            Collections.emptyMap(), new FileInputStream(file));
                } catch (IOException e) {
                    return emptyResponse(500);
                }
            }
            if (path == null || path.equals("/")) {
                path = "/index.html";
            }
            InputStream stream = openAsset(path);
            if (stream == null && !path.contains(".")) {
                stream = openAsset("/index.html");
            }
            if (stream == null) {
                return new WebResourceResponse(
                        "text/plain", "utf-8", 404, "Not Found",
                        Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            String mime = guessMime(path);
            boolean text = mime.startsWith("text/")
                    || mime.contains("javascript")
                    || mime.contains("json")
                    || mime.contains("svg")
                    || mime.contains("xml");
            return new WebResourceResponse(
                    mime, text ? "utf-8" : null, 200, "OK",
                    Collections.emptyMap(), stream);
        }

        private InputStream openAsset(String path) {
            try {
                return getAssets().open("www" + path);
            } catch (IOException e) {
                return null;
            }
        }
    }

    private static WebResourceResponse emptyResponse(int code) {
        return new WebResourceResponse(
                "text/plain", "utf-8", code, "Error",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private static String guessMime(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            boolean wantsAudio = false;
            boolean onlyAudio = true;
            for (String resource : request.getResources()) {
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                    wantsAudio = true;
                } else {
                    onlyAudio = false;
                }
            }
            if (!wantsAudio || !onlyAudio) {
                request.deny();
                return;
            }
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                pendingAudioRequest = request;
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_AUDIO);
                return;
            }
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
            }
            filePathCallback = callback;
            pendingCameraUri = null;

            boolean wantsImage = false;
            boolean onlyImages = true;
            for (String type : params.getAcceptTypes()) {
                if (type == null || type.isEmpty()) {
                    continue;
                }
                if (type.startsWith("image/")) {
                    wantsImage = true;
                } else {
                    onlyImages = false;
                }
            }
            boolean multiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;

            Intent intent;
            int requestCode = REQ_FILE;
            if (params.isCaptureEnabled() && wantsImage) {
                // 应用内相机（官方同款拍摄页），结果写入 MediaStore
                pendingCameraUri = createCameraUri();
                intent = new Intent(MainActivity.this, CameraActivity.class);
                if (pendingCameraUri != null) {
                    intent.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraUri);
                }
                requestCode = REQ_CAMERA;
            } else if (wantsImage && onlyImages && multiple && Build.VERSION.SDK_INT >= 33) {
                // 系统照片选择器，多选上限与官方一致为 20 张
                intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
                intent.setType("image/*");
                intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, 20);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            } else {
                intent = params.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                if (multiple) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
            }

            try {
                startActivityForResult(intent, requestCode);
            } catch (Exception e) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                    filePathCallback = null;
                }
                pendingCameraUri = null;
                Toast.makeText(MainActivity.this, "无法打开选择器", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage message) {
            return true;
        }
    }

    private Uri createCameraUri() {
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME,
                    "IMG_" + System.currentTimeMillis() + ".jpg");
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            if (Build.VERSION.SDK_INT >= 29) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/DeepSeek");
            }
            return getContentResolver().insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_NATIVE_ZIP) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                copyPickedZip(data.getData());
            }
            return;
        }
        if (requestCode == REQ_CAMERA) {
            if (filePathCallback == null) {
                pendingCameraUri = null;
                return;
            }
            Uri fromData = data == null ? null : data.getData();
            Uri resultUri = fromData != null ? fromData : pendingCameraUri;
            Uri[] result = null;
            if (resultCode == RESULT_OK && resultUri != null) {
                result = new Uri[]{resultUri};
            }
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
            pendingCameraUri = null;
            return;
        }
        if (requestCode == REQ_FILE) {
            if (filePathCallback == null) {
                return;
            }
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                if (pendingCameraUri != null) {
                    Uri fromData = data == null ? null : data.getData();
                    result = new Uri[]{fromData != null ? fromData : pendingCameraUri};
                } else if (data != null) {
                    ClipData clip = data.getClipData();
                    if (clip != null) {
                        result = new Uri[clip.getItemCount()];
                        for (int i = 0; i < clip.getItemCount(); i++) {
                            result[i] = clip.getItemAt(i).getUri();
                        }
                    } else if (data.getData() != null) {
                        result = new Uri[]{data.getData()};
                    }
                }
            }
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
            pendingCameraUri = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /** 系统选择器返回的 ZIP：后台拷贝到缓存，再通知网页以同源地址读取 */
    private void copyPickedZip(Uri uri) {
        new Thread(() -> {
            try {
                String name = queryDisplayName(uri);
                if (name == null || name.trim().isEmpty()) {
                    name = "deepseek_data.zip";
                }
                File dir = new File(getCacheDir(), "picked");
                if (!dir.exists() && !dir.mkdirs()) {
                    throw new IOException("cache dir unavailable");
                }
                File[] olds = dir.listFiles();
                if (olds != null) {
                    for (File old : olds) {
                        //noinspection ResultOfMethodCallIgnored
                        old.delete();
                    }
                }
                File out = new File(dir, "import.zip");
                try (InputStream in = getContentResolver().openInputStream(uri);
                     OutputStream os = new FileOutputStream(out)) {
                    if (in == null) {
                        throw new IOException("cannot open picked file");
                    }
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        os.write(buffer, 0, read);
                    }
                }
                String script = "window.__onNativeZipPicked && window.__onNativeZipPicked("
                        + "'https://" + ASSET_HOST + "/__picked__/import.zip', "
                        + JSONObject.quote(name) + ")";
                runOnUiThread(() -> webView.evaluateJavascript(script, null));
            } catch (Exception e) {
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "读取所选文件失败", Toast.LENGTH_SHORT).show();
                    webView.evaluateJavascript(
                            "window.__onNativeZipPickedFailed && window.__onNativeZipPickedFailed()",
                            null);
                });
            }
        }).start();
    }

    private String queryDisplayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(
                uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getString(0);
            }
        } catch (Exception ignored) {
            // 部分来源不支持查询名称，使用默认文件名
        }
        return null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions,
                                           int[] grantResults) {
        if (requestCode == REQ_MEDIA_IMAGES) {
            // 授权结果通知网页刷新「+」面板的相册图片条
            webView.evaluateJavascript(
                    "window.__onNativeGalleryReady && window.__onNativeGalleryReady()", null);
            return;
        }
        if (requestCode == REQ_WRITE_STORAGE) {
            Toast.makeText(this,
                    grantResults.length > 0
                            && grantResults[0] == PackageManager.PERMISSION_GRANTED
                            ? "已获得存储权限，请重新导出"
                            : "未获得存储权限，无法保存到下载目录",
                    Toast.LENGTH_SHORT).show();
            return;
        }
        if (requestCode == REQ_AUDIO && pendingAudioRequest != null) {
            if (grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingAudioRequest.grant(
                        new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                pendingAudioRequest.deny();
            }
            pendingAudioRequest = null;
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        // 先交给网页处理应用内返回层级；未消费时才退出（或按 WebView 历史后退）
        webView.evaluateJavascript(
                "(function(){try{return typeof window.__handleAndroidBack === 'function'"
                        + " && window.__handleAndroidBack() === true}catch(e){return false}})()",
                value -> {
                    if ("true".equals(value)) {
                        return;
                    }
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        finish();
                    }
                });
    }

    /** 导出历史对话等文件保存到系统「下载」目录；pickZip / 相册相关能力供网页调用 */
    public class Bridge {
        @JavascriptInterface
        public boolean pickZip() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(intent, REQ_NATIVE_ZIP);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                }
            });
            return true;
        }

        @JavascriptInterface
        public boolean saveFile(String name, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    values.put(MediaStore.Downloads.MIME_TYPE,
                            name.endsWith(".zip") ? "application/zip" : "application/octet-stream");
                    values.put(MediaStore.Downloads.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(
                            MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) {
                        return false;
                    }
                    try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                        if (output == null) {
                            return false;
                        }
                        output.write(bytes);
                    }
                } else {
                    // Android 10 及以下：官方会申请写入外置存储权限，把文件存到公共「下载」目录
                    if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                            != PackageManager.PERMISSION_GRANTED) {
                        runOnUiThread(() -> {
                            requestPermissions(
                                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                                    REQ_WRITE_STORAGE);
                            Toast.makeText(MainActivity.this,
                                    "请允许存储权限后重新导出", Toast.LENGTH_SHORT).show();
                        });
                        return false;
                    }
                    File dir = Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) {
                        return false;
                    }
                    if (!dir.exists() && !dir.mkdirs()) {
                        return false;
                    }
                    File file = new File(dir, name);
                    try (FileOutputStream output = new FileOutputStream(file)) {
                        output.write(bytes);
                    }
                }
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this, "已保存：" + name, Toast.LENGTH_SHORT).show());
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** 系统相册最近图片（同步版本，保留兼容），返回 [{id, name, dataUrl}]（缩略图 base64） */
        @JavascriptInterface
        public String listRecentImages(int limit) {
            return buildRecentImages(limit);
        }

        /** 异步版本：缩略图解码放到工作线程，完成后回调网页，打开「+」面板不会被阻塞 */
        @JavascriptInterface
        public void listRecentImagesAsync(int limit) {
            new Thread(() -> {
                String json = buildRecentImages(limit);
                runOnUiThread(() -> webView.evaluateJavascript(
                        "window.__onNativeGalleryReady && window.__onNativeGalleryReady("
                                + JSONObject.quote(json) + ")",
                        null));
            }).start();
        }

        /** 系统是否深色模式：网页「跟随系统」主题通过它取色 */
        @JavascriptInterface
        public boolean isSystemDark() {
            return MainActivity.this.isSystemDark();
        }

        private String buildRecentImages(int limit) {
            if (!hasGalleryPermission()) {
                requestGalleryPermission();
                return "[]";
            }
            JSONArray out = new JSONArray();
            int max = Math.max(1, Math.min(limit, 60));
            String[] projection = {
                    MediaStore.Images.Media._ID,
                    MediaStore.Images.Media.DISPLAY_NAME,
                    MediaStore.Images.Media.DATE_ADDED,
            };
            String order = MediaStore.Images.Media.DATE_ADDED + " DESC";
            try (Cursor cursor = getContentResolver().query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    projection, null, null, order)) {
                if (cursor == null) {
                    return "[]";
                }
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                int count = 0;
                while (cursor.moveToNext() && count < max) {
                    long id = cursor.getLong(idColumn);
                    Uri uri = ContentUris.withAppendedId(
                            MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
                    String name = cursor.getString(nameColumn);
                    if (name == null || name.trim().isEmpty()) {
                        name = "image-" + id + ".jpg";
                    }
                    String dataUrl = thumbnailDataUrl(uri, id);
                    if (dataUrl == null) {
                        continue;
                    }
                    JSONObject item = new JSONObject();
                    item.put("id", uri.toString());
                    item.put("name", name);
                    item.put("dataUrl", dataUrl);
                    out.put(item);
                    count++;
                }
            } catch (Exception e) {
                return "[]";
            }
            return out.toString();
        }

        /** 用户在「+」面板点选相册图片：把原图拷到缓存，再通知网页读取并加入附件 */
        @JavascriptInterface
        public boolean pickGalleryImage(String id) {
            final Uri uri;
            try {
                uri = Uri.parse(id);
            } catch (Exception e) {
                return false;
            }
            new Thread(() -> {
                try {
                    File dir = new File(getCacheDir(), "picked");
                    if (!dir.exists() && !dir.mkdirs()) {
                        throw new IOException("cache dir unavailable");
                    }
                    File[] olds = dir.listFiles();
                    if (olds != null) {
                        for (File old : olds) {
                            if (old.getName().startsWith("gallery-")) {
                                //noinspection ResultOfMethodCallIgnored
                                old.delete();
                            }
                        }
                    }
                    String mime = getContentResolver().getType(uri);
                    String extension = mimeToExtension(mime);
                    File out = new File(dir, "gallery-" + System.currentTimeMillis() + extension);
                    copyUriToFile(uri, out);
                    String name = queryDisplayName(uri);
                    if (name == null || name.trim().isEmpty()) {
                        name = "image" + extension;
                    } else if (!name.contains(".")) {
                        name = name + extension;
                    }
                    String script = "window.__onNativeImagePicked && window.__onNativeImagePicked("
                            + "'https://" + ASSET_HOST + "/__picked__/" + out.getName() + "', "
                            + JSONObject.quote(name) + ")";
                    runOnUiThread(() -> webView.evaluateJavascript(script, null));
                } catch (Exception e) {
                    runOnUiThread(() -> webView.evaluateJavascript(
                            "window.__onNativeImagePickFailed && window.__onNativeImagePickFailed()",
                            null));
                }
            }).start();
            return true;
        }
    }

    private boolean hasGalleryPermission() {
        if (Build.VERSION.SDK_INT >= 34) {
            // Android 14 起允许「仅选择的照片」部分授权
            return checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES)
                    == PackageManager.PERMISSION_GRANTED
                    || checkSelfPermission(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
                    == PackageManager.PERMISSION_GRANTED;
        }
        String permission = Build.VERSION.SDK_INT >= 33
                ? Manifest.permission.READ_MEDIA_IMAGES
                : Manifest.permission.READ_EXTERNAL_STORAGE;
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestGalleryPermission() {
        String[] permissions;
        if (Build.VERSION.SDK_INT >= 34) {
            permissions = new String[]{
                    Manifest.permission.READ_MEDIA_IMAGES,
                    Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
            };
        } else if (Build.VERSION.SDK_INT >= 33) {
            permissions = new String[]{Manifest.permission.READ_MEDIA_IMAGES};
        } else {
            permissions = new String[]{Manifest.permission.READ_EXTERNAL_STORAGE};
        }
        runOnUiThread(() -> requestPermissions(permissions, REQ_MEDIA_IMAGES));
    }

    /** 系统相册缩略图（JPEG base64）：按 96dp 卡片的真实像素生成并缓存，失败返回 null */
    private String thumbnailDataUrl(Uri uri, long id) {
        String cacheKey = uri.toString();
        String cached = thumbCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }
        Bitmap bitmap = null;
        try {
            // 96dp 卡片在 2x/3x 屏上需要 192~288px，过小会在高分屏发糊
            float density = getResources().getDisplayMetrics().density;
            int px = Math.max(192, Math.min(320, Math.round(96 * density)));
            if (Build.VERSION.SDK_INT >= 29) {
                bitmap = getContentResolver().loadThumbnail(uri, new Size(px, px), null);
            } else {
                bitmap = MediaStore.Images.Thumbnails.getThumbnail(
                        getContentResolver(), id, MediaStore.Images.Thumbnails.MINI_KIND, null);
            }
            if (bitmap == null) {
                return null;
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 84, output);
            String dataUrl = "data:image/jpeg;base64,"
                    + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
            thumbCache.put(cacheKey, dataUrl);
            return dataUrl;
        } catch (Exception e) {
            return null;
        } finally {
            if (bitmap != null) {
                bitmap.recycle();
            }
        }
    }

    private static String mimeToExtension(String mime) {
        if (mime == null) {
            return ".jpg";
        }
        if (mime.contains("png")) {
            return ".png";
        }
        if (mime.contains("webp")) {
            return ".webp";
        }
        if (mime.contains("gif")) {
            return ".gif";
        }
        return ".jpg";
    }

    private void copyUriToFile(Uri uri, File out) throws IOException {
        try (InputStream in = getContentResolver().openInputStream(uri);
             OutputStream os = new FileOutputStream(out)) {
            if (in == null) {
                throw new IOException("cannot open picked file");
            }
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                os.write(buffer, 0, read);
            }
        }
    }
}

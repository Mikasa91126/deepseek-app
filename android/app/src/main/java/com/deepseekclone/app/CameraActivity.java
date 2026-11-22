package com.deepseekclone.app;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.drawable.GradientDrawable;
import android.hardware.Camera;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 应内相机：官方 App 的「图像识别」拍摄页。
 * 使用系统 Camera API（无第三方依赖），提供变焦、闪光灯、前后摄像头切换，
 * 拍摄结果压缩后写入调用方传入的 MediaStore Uri，供网页作为附件读取。
 */
@SuppressWarnings("deprecation")
public class CameraActivity extends Activity implements SurfaceHolder.Callback {
    private static final int REQ_CAMERA_PERMISSION = 2001;
    private static final float[] ZOOM_VALUES = {1f, 2f, 3f, 5f};

    private Uri outputUri;
    private Camera camera;
    private int facing = Camera.CameraInfo.CAMERA_FACING_BACK;
    private int cameraIndex;
    private AspectSurfaceView surfaceView;
    private SurfaceHolder holder;
    private boolean flashOn;
    private boolean taking;
    private int maxZoom;
    private int zoomIndex;
    private LinearLayout zoomRow;
    private final List<TextView> zoomChips = new ArrayList<>();
    private TextView flashButton;
    private TextView shutterButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        outputUri = getIntent().getParcelableExtra(MediaStore.EXTRA_OUTPUT);
        buildUi();
        List<String> missing = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        }
        if (!missing.isEmpty()) {
            requestPermissions(missing.toArray(new String[0]), REQ_CAMERA_PERMISSION);
        }
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private TextView iconText(String text, float size) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(Color.WHITE);
        view.setTextSize(size);
        view.setGravity(Gravity.CENTER);
        view.setClickable(true);
        view.setBackgroundColor(Color.TRANSPARENT);
        return view;
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        surfaceView = new AspectSurfaceView(this);
        FrameLayout.LayoutParams surfaceParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        surfaceParams.gravity = Gravity.CENTER;
        root.addView(surfaceView, surfaceParams);
        holder = surfaceView.getHolder();
        holder.addCallback(this);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(12), dp(8), dp(12), dp(8));
        TextView close = iconText("✕", 23);
        close.setOnClickListener(v -> {
            setResult(RESULT_CANCELED);
            finish();
        });
        top.addView(close, new LinearLayout.LayoutParams(dp(44), dp(44)));
        TextView title = new TextView(this);
        title.setText("图像识别");
        title.setTextColor(Color.WHITE);
        title.setTextSize(17);
        title.setGravity(Gravity.CENTER);
        top.addView(title, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        top.addView(new View(this), new LinearLayout.LayoutParams(dp(44), dp(44)));
        root.addView(top, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP));

        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setGravity(Gravity.CENTER_HORIZONTAL);
        bottom.setPadding(0, dp(10), 0, dp(22));

        zoomRow = new LinearLayout(this);
        zoomRow.setGravity(Gravity.CENTER);
        rebuildZoomChips();
        bottom.addView(zoomRow);

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER_VERTICAL);
        controls.setPadding(dp(24), dp(14), dp(24), 0);

        flashButton = iconText("⚡", 22);
        flashButton.setOnClickListener(v -> toggleFlash());
        LinearLayout.LayoutParams sideParams = new LinearLayout.LayoutParams(
                0, dp(72), 1f);
        sideParams.gravity = Gravity.CENTER;
        controls.addView(flashButton, sideParams);

        shutterButton = new TextView(this);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(Color.WHITE);
        ring.setStroke(dp(4), 0x66FFFFFF);
        shutterButton.setBackground(ring);
        shutterButton.setOnClickListener(v -> takePicture());
        controls.addView(shutterButton, new LinearLayout.LayoutParams(dp(72), dp(72)));

        TextView flip = iconText("⟳", 26);
        flip.setOnClickListener(v -> switchCamera());
        LinearLayout.LayoutParams flipParams = new LinearLayout.LayoutParams(
                0, dp(72), 1f);
        flipParams.gravity = Gravity.CENTER;
        controls.addView(flip, flipParams);

        bottom.addView(controls, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(bottom, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM));

        setContentView(root);
    }

    private void rebuildZoomChips() {
        if (zoomRow == null) {
            return;
        }
        zoomRow.removeAllViews();
        zoomChips.clear();
        for (int i = 0; i < ZOOM_VALUES.length; i++) {
            final int index = i;
            TextView chip = new TextView(this);
            chip.setText(ZOOM_VALUES[i] == Math.round(ZOOM_VALUES[i])
                    ? (int) ZOOM_VALUES[i] + "x"
                    : ZOOM_VALUES[i] + "x");
            chip.setTextSize(13);
            chip.setGravity(Gravity.CENTER);
            chip.setPadding(dp(10), dp(6), dp(10), dp(6));
            chip.setOnClickListener(v -> setZoomValue(ZOOM_VALUES[index]));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            params.setMargins(dp(4), 0, dp(4), 0);
            zoomRow.addView(chip, params);
            zoomChips.add(chip);
        }
        updateChipStyles();
    }

    private void updateChipStyles() {
        for (int i = 0; i < zoomChips.size(); i++) {
            boolean active = i == zoomIndex;
            zoomChips.get(i).setTextColor(active ? Color.WHITE : 0x99FFFFFF);
            zoomChips.get(i).getPaint().setFakeBoldText(active);
            zoomChips.get(i).invalidate();
        }
    }

    private void setZoomValue(float ratio) {
        if (camera == null) {
            return;
        }
        try {
            Camera.Parameters parameters = camera.getParameters();
            if (!parameters.isZoomSupported()) {
                return;
            }
            int max = parameters.getMaxZoom();
            int index = Math.round((ratio - 1f) / 4f * max);
            index = Math.max(0, Math.min(max, index));
            parameters.setZoom(index);
            camera.setParameters(parameters);
            zoomIndex = nearestZoomSlot(ratio);
            updateChipStyles();
        } catch (Exception ignored) {
            // 部分设备变焦参数不可靠，忽略本次操作
        }
    }

    private int nearestZoomSlot(float ratio) {
        int best = 0;
        float distance = Float.MAX_VALUE;
        for (int i = 0; i < ZOOM_VALUES.length; i++) {
            float d = Math.abs(ZOOM_VALUES[i] - ratio);
            if (d < distance) {
                distance = d;
                best = i;
            }
        }
        return best;
    }

    private void toggleFlash() {
        if (camera == null) {
            return;
        }
        try {
            Camera.Parameters parameters = camera.getParameters();
            List<String> modes = parameters.getSupportedFlashModes();
            if (modes == null) {
                return;
            }
            flashOn = !flashOn;
            String target = flashOn
                    ? (modes.contains(Camera.Parameters.FLASH_MODE_TORCH)
                    ? Camera.Parameters.FLASH_MODE_TORCH
                    : Camera.Parameters.FLASH_MODE_ON)
                    : Camera.Parameters.FLASH_MODE_OFF;
            if (!modes.contains(target)) {
                flashOn = false;
                target = Camera.Parameters.FLASH_MODE_OFF;
            }
            parameters.setFlashMode(target);
            camera.setParameters(parameters);
            flashButton.setTextColor(flashOn ? Color.rgb(255, 214, 10) : Color.WHITE);
        } catch (Exception ignored) {
            // 闪光灯不可用时保持关闭
        }
    }

    private void switchCamera() {
        facing = facing == Camera.CameraInfo.CAMERA_FACING_BACK
                ? Camera.CameraInfo.CAMERA_FACING_FRONT
                : Camera.CameraInfo.CAMERA_FACING_BACK;
        flashOn = false;
        if (flashButton != null) {
            flashButton.setTextColor(Color.WHITE);
        }
        openCamera();
    }

    /** 按朝向查找真实摄像头索引（多摄机型上索引不一定等于朝向常量） */
    private int findCameraIndex(int targetFacing) {
        Camera.CameraInfo info = new Camera.CameraInfo();
        for (int i = 0; i < Camera.getNumberOfCameras(); i++) {
            Camera.getCameraInfo(i, info);
            if (info.facing == targetFacing) {
                return i;
            }
        }
        return -1;
    }

    private void openCamera() {
        releaseCamera();
        if (holder == null || holder.getSurface() == null) {
            return;
        }
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        int index = findCameraIndex(facing);
        if (index < 0 && facing != Camera.CameraInfo.CAMERA_FACING_BACK) {
            facing = Camera.CameraInfo.CAMERA_FACING_BACK;
            index = findCameraIndex(facing);
        }
        if (index < 0) {
            Toast.makeText(this, "无法打开相机", Toast.LENGTH_SHORT).show();
            return;
        }
        cameraIndex = index;
        try {
            camera = Camera.open(cameraIndex);
        } catch (Exception e) {
            camera = null;
        }
        if (camera == null) {
            Toast.makeText(this, "无法打开相机", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            Camera.Parameters parameters = camera.getParameters();
            Camera.Size preview = choosePreviewSize(parameters);
            if (preview != null) {
                parameters.setPreviewSize(preview.width, preview.height);
                float ratio = preview.width / (float) preview.height;
                int displayOrientation = displayOrientation();
                if (displayOrientation == 90 || displayOrientation == 270) {
                    ratio = 1f / ratio;
                }
                surfaceView.setRatio(ratio);
            }
            Camera.Size picture = choosePictureSize(parameters, preview);
            if (picture != null) {
                parameters.setPictureSize(picture.width, picture.height);
            }
            List<String> focusModes = parameters.getSupportedFocusModes();
            if (focusModes != null
                    && focusModes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) {
                parameters.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            }
            if (parameters.getSupportedFlashModes() != null) {
                parameters.setFlashMode(Camera.Parameters.FLASH_MODE_OFF);
            }
            camera.setParameters(parameters);
            camera.setDisplayOrientation(displayOrientation());
            camera.setPreviewDisplay(holder);
            camera.startPreview();
            maxZoom = parameters.isZoomSupported() ? parameters.getMaxZoom() : 0;
            zoomIndex = 0;
            updateChipStyles();
        } catch (Exception e) {
            releaseCamera();
            Toast.makeText(this, "相机初始化失败", Toast.LENGTH_SHORT).show();
        }
    }

    private int displayOrientation() {
        Camera.CameraInfo info = new Camera.CameraInfo();
        Camera.getCameraInfo(cameraIndex, info);
        int rotation = getWindowManager().getDefaultDisplay().getRotation();
        int degrees = 0;
        switch (rotation) {
            case Surface.ROTATION_90:
                degrees = 90;
                break;
            case Surface.ROTATION_180:
                degrees = 180;
                break;
            case Surface.ROTATION_270:
                degrees = 270;
                break;
            default:
                break;
        }
        int result;
        if (info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT) {
            result = (info.orientation + degrees) % 360;
            result = (360 - result) % 360;
        } else {
            result = (info.orientation - degrees + 360) % 360;
        }
        return result;
    }

    private Camera.Size choosePreviewSize(Camera.Parameters parameters) {
        List<Camera.Size> sizes = parameters.getSupportedPreviewSizes();
        if (sizes == null || sizes.isEmpty()) {
            return null;
        }
        Camera.Size best = null;
        long bestScore = Long.MAX_VALUE;
        for (Camera.Size size : sizes) {
            if (size.width > 1920 || size.height > 1080) {
                continue;
            }
            float ratio = Math.max(size.width, size.height) / (float) Math.min(size.width, size.height);
            long score = Math.round(Math.abs(ratio - 16f / 9f) * 1000)
                    + Math.abs(size.width * size.height - 1280 * 720) / 1000;
            if (score < bestScore) {
                bestScore = score;
                best = size;
            }
        }
        return best != null ? best : sizes.get(0);
    }

    private Camera.Size choosePictureSize(Camera.Parameters parameters, Camera.Size preview) {
        List<Camera.Size> sizes = parameters.getSupportedPictureSizes();
        if (sizes == null || sizes.isEmpty()) {
            return null;
        }
        Camera.Size best = null;
        long bestScore = Long.MAX_VALUE;
        float previewRatio = preview == null
                ? 4f / 3f
                : Math.max(preview.width, preview.height)
                / (float) Math.min(preview.width, preview.height);
        for (Camera.Size size : sizes) {
            if (size.width > 4096 || size.height > 4096) {
                continue;
            }
            float ratio = Math.max(size.width, size.height) / (float) Math.min(size.width, size.height);
            long score = Math.round(Math.abs(ratio - previewRatio) * 10000)
                    + Math.abs(size.width * size.height - 3000 * 4000) / 10000;
            if (score < bestScore) {
                bestScore = score;
                best = size;
            }
        }
        return best != null ? best : sizes.get(0);
    }

    private void takePicture() {
        if (camera == null || taking) {
            return;
        }
        taking = true;
        shutterButton.setAlpha(0.5f);
        try {
            camera.takePicture(null, null, (data, source) ->
                    new Thread(() -> savePhoto(data)).start());
        } catch (Exception e) {
            taking = false;
            shutterButton.setAlpha(1f);
            Toast.makeText(this, "拍摄失败，请重试", Toast.LENGTH_SHORT).show();
        }
    }

    private void savePhoto(byte[] data) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, bounds);
            int sample = 1;
            while (bounds.outWidth / sample > 2048 || bounds.outHeight / sample > 2048) {
                sample *= 2;
            }
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            Bitmap bitmap = BitmapFactory.decodeByteArray(data, 0, data.length, options);
            if (bitmap == null) {
                throw new IllegalStateException("decode failed");
            }
            Camera.CameraInfo info = new Camera.CameraInfo();
            Camera.getCameraInfo(cameraIndex, info);
            Matrix matrix = new Matrix();
            if (info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT) {
                matrix.postRotate((360 - info.orientation) % 360);
                matrix.postScale(-1, 1);
            } else {
                matrix.postRotate(info.orientation);
            }
            Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0,
                    bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            if (rotated != bitmap) {
                bitmap.recycle();
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            rotated.compress(Bitmap.CompressFormat.JPEG, 90, output);
            rotated.recycle();

            Uri target = outputUri != null ? outputUri : createOutputUri();
            if (target == null) {
                throw new IllegalStateException("no output uri");
            }
            try (OutputStream stream = getContentResolver().openOutputStream(target)) {
                if (stream == null) {
                    throw new IllegalStateException("no output stream");
                }
                stream.write(output.toByteArray());
            }
            Uri result = target;
            runOnUiThread(() -> {
                setResult(RESULT_OK, new android.content.Intent().setData(result));
                finish();
            });
        } catch (Exception e) {
            runOnUiThread(() -> {
                taking = false;
                shutterButton.setAlpha(1f);
                Toast.makeText(this, "保存照片失败", Toast.LENGTH_SHORT).show();
                if (camera != null) {
                    try {
                        camera.startPreview();
                    } catch (Exception ignored) {
                        // 恢复预览失败时保持当前画面
                    }
                }
            });
        }
    }

    private Uri createOutputUri() {
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME,
                    "IMG_" + System.currentTimeMillis() + ".jpg");
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            if (Build.VERSION.SDK_INT >= 29) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH,
                        android.os.Environment.DIRECTORY_PICTURES + "/DeepSeek");
            }
            return getContentResolver().insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        } catch (Exception e) {
            return null;
        }
    }

    private void releaseCamera() {
        if (camera != null) {
            try {
                camera.stopPreview();
            } catch (Exception ignored) {
                // 预览已停止
            }
            camera.release();
            camera = null;
        }
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        this.holder = holder;
        openCamera();
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
        if (camera != null) {
            try {
                camera.stopPreview();
                camera.setPreviewDisplay(holder);
                camera.startPreview();
            } catch (Exception ignored) {
                // 尺寸变化失败时保留现有预览
            }
        }
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        releaseCamera();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (camera == null && holder != null && holder.getSurface() != null
                && checkSelfPermission(Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            openCamera();
        }
    }

    @Override
    protected void onPause() {
        releaseCamera();
        super.onPause();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions,
                                           int[] grantResults) {
        if (requestCode == REQ_CAMERA_PERMISSION) {
            if (checkSelfPermission(Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED) {
                if (holder != null && holder.getSurface() != null) {
                    openCamera();
                }
            } else {
                Toast.makeText(this, "需要相机权限才能拍照", Toast.LENGTH_SHORT).show();
                setResult(RESULT_CANCELED);
                finish();
            }
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    /** 按预览比例铺满屏幕的 SurfaceView（超出部分由父布局裁切） */
    private static class AspectSurfaceView extends SurfaceView {
        private float ratio = 9f / 16f;

        AspectSurfaceView(Context context) {
            super(context);
        }

        void setRatio(float ratio) {
            if (ratio > 0 && Math.abs(this.ratio - ratio) > 0.001f) {
                this.ratio = ratio;
                requestLayout();
            }
        }

        @Override
        protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
            int width = MeasureSpec.getSize(widthMeasureSpec);
            int height = MeasureSpec.getSize(heightMeasureSpec);
            int finalWidth = width;
            int finalHeight = height;
            if (width > 0 && height > 0) {
                if (width / ratio >= height) {
                    finalHeight = height;
                    finalWidth = Math.round(height * ratio);
                } else {
                    finalWidth = width;
                    finalHeight = Math.round(width / ratio);
                }
            }
            super.onMeasure(MeasureSpec.makeMeasureSpec(finalWidth, MeasureSpec.EXACTLY),
                    MeasureSpec.makeMeasureSpec(finalHeight, MeasureSpec.EXACTLY));
        }
    }
}

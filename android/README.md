# DeepSeek 安卓壳（WebView）

把 `DeepSeekApp`（DeepSeek 手机端复刻，官方 chat-demo 组装 + 官方 API）封装成原生安卓应用。

- 包名：`com.deepseekclone.app`
- 版本：0.1.8 (versionCode 8)
- minSdk 26 / targetSdk 34 / compileSdk 35
- 无第三方依赖，仅系统 WebView

## 原理

- 网页资源打包在 `app/src/main/assets/www`（来自 `DeepSeekApp/dist`）。
- 通过 `WebViewClient.shouldInterceptRequest` 以 **https://appassets.local** 安全来源托管资源：
  IndexedDB / localStorage 正常持久化，麦克风（语音输入）可用的安全上下文。
- `WebChromeClient` 处理：
  - 文件选择：`<input type=file>`（拍照走系统相机、相册走系统照片选择器、文件走系统文件选择器）
  - 麦克风权限：首次语音输入时申请 `RECORD_AUDIO`
- `AndroidBridge.saveFile(name, base64)`：导出历史对话时把 ZIP 写入系统「下载」目录（网页端会优先调用它，非安卓环境回退为浏览器下载）。
- `AndroidBridge.listRecentImagesAsync(limit)` / `pickGalleryImage(id)`：读取系统相册最近照片（缩略图按屏幕密度生成、内存缓存、工作线程解码后回调网页），点选后把原图拷到缓存再交给网页上传。
- `AndroidBridge.isSystemDark()` 与 `__onNativeThemeChanged()`：网页「跟随系统」主题取系统深浅色，状态栏/导航栏与启动底色随系统切换（WebView 的 `prefers-color-scheme` 在应用固定 Light 主题时不可靠）。
- 媒体自动播放已放开（自动朗读）；明文流量关闭，仅 https。

## 构建

前置：JDK 17、Android SDK（platforms;android-35、build-tools;35.0.0）。

```sh
# 1. 构建网页
cd ../DeepSeekApp && pnpm build

# 2. 同步静态资源
cd ../DeepSeekAPK && cp -r ../DeepSeekApp/dist/. app/src/main/assets/www/

# 3. 构建 APK
JAVA_HOME=<JDK17 路径> \
ANDROID_HOME=<Android SDK 路径> \
GRADLE_USER_HOME=<Gradle 缓存目录，可选> \
./gradlew assembleDebug
```

产物：`app/build/outputs/apk/debug/app-debug.apk`（debug 签名，个人自用可直接安装）。

安装：

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

或把 APK 传到手机后点击安装（需允许「安装未知来源应用」）。

## 首次使用

打开 App → 设置 → 数据管理/账号管理里填入 DeepSeek API Key（`sk-` 开头）→ 校验通过即可对话。Key 只保存在本机 WebView 存储中。

## 已知边界

- 「分享」在 WebView 中走系统分享面板（不支持时复制文本）。
- 系统相册「最近照片」照片条最多读取最近 30 张（受 Android 14「仅选择的照片」授权范围限制）。
- 语音输入需要麦克风权限；朗读走官方 TTS 接口。
- 仅个人使用，请勿对外分发或用于商业用途。

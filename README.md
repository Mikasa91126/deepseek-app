# DeepSeek 手机端复刻（个人自用）

非官方项目，仅供个人学习与自用，**不对外提供服务、不用于售卖**。

本项目把 DeepSeek 官方开源的演示客户端 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)（MIT License）组装为可用的手机端应用，接入 DeepSeek 官方 API（`deepseek-flash`，Messages 协议），并额外提供一个原生 WebView 壳用于打包 Android APK。

## 功能

- 与官方 App 对齐的移动端界面：首页鲸鱼标识与问候语、侧栏会话搜索与账号行、全屏二级设置页、字体大小、思考自动折叠、外观/语言/音色选择（胶囊 + 水波动效）、输入区「+」附件面板（最近图片 / 拍照 / 相册 / 文件）
- 深度思考（thinking）、智能搜索与链接阅读（`deepseek_web_search` / `deepseek_read_url`）、来源引用、自动会话标题
- 文件与图片输入（Files API）、语音输入（ASR）、回答朗读（TTS，海星/暗潮）
- 编辑提问、重新生成、继续生成、消息分支、停止生成、复制/赞/踩/分享、回到底部
- Markdown、代码高亮、KaTeX 公式、Mermaid 图表
- 导入 DeepSeek 官方 App / 网页端导出的历史对话 ZIP（`deepseek_data-*.zip`，format v3）
- 中英文、浅色/深色/跟随系统
- 个人自用默认关闭官方严格内容审核（可在「设置 → 个性化」开启）
- 安卓返回键逐级返回：弹窗 → 设置子页 → 设置根页 → 会话页 → 首页 → 退出应用
- 界面动效：抽屉、设置页与子页、弹窗、音色弹层、附件面板、搜索结果面板进出场；消息入场、思考块平滑展开/收起、回到底部、复制反馈、按压反馈；尊重系统「减少动态效果」
- 会话管理：标题 + 正文 + 思考全文搜索；「选择对话」批量置顶（上限 10）/ 删除
- 安卓专属：相册照片条（按时间倒序、横滑选择）、原生 ZIP 选择与读取、导入超时自动恢复

## 目录结构

```
web/      网页应用（官方 chat-demo 组装，含本地适配）
android/  原生 WebView 壳工程（包名 com.deepseekclone.app）
LICENSE   官方 chat-demo 的 MIT 许可证
```

更细的说明见 [web/使用说明.md](web/使用说明.md)、[web/对照报告.md](web/对照报告.md)（与真实 App 2.9.0 的逐项对照）与 [android/README.md](android/README.md)。

## 快速开始（网页版）

```sh
cd web
pnpm install
pnpm dev        # http://localhost:8090
pnpm build      # 生成 dist/
```

首次打开在 设置 → 数据管理 里填入 DeepSeek API Key（`sk-` 开头）。Key 只保存在浏览器 localStorage。

## 构建 Android APK

前置：JDK 17、Android SDK（platforms;android-35、build-tools;35.0.0）。

```sh
cd web && pnpm build
cd ../android
mkdir -p app/src/main/assets/www
cp -r ../web/dist/. app/src/main/assets/www/
JAVA_HOME=<JDK17> ANDROID_HOME=<SDK> ./gradlew assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`。也可直接下载 Releases 中已签名的 APK。

## 导入官方历史对话

1. 官方 App：设置 → 数据管理 → 导出所有历史对话，得到 `deepseek_data-日期.zip`；
2. 本应用：设置 → 数据管理 → 导入历史对话，选择该 ZIP 并确认（会覆盖本地现有会话）。

已用真实导出包（242 个会话、621 张图片、102 MB）验证导入成功。

## 数据与隐私

- API Key 与设置保存在本机浏览器/WebView 存储，不会上传到除 `api.deepseek.com` 以外的服务；
- 请勿把包含个人数据的导出 ZIP 或 API Key 提交到仓库。

## 免责声明与许可证

- 本项目基于 MIT 许可的官方演示客户端修改，保留原版权声明（见 [LICENSE](LICENSE)）；本项目修改部分同样以 MIT 许可发布。
- 「DeepSeek」名称与鲸鱼标识归深度求索公司所有，本项目与其无隶属关系；仅限个人自用，请勿用于商业分发。

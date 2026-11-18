# yuiの轻小说 · 轻小说阅读 App

二次元风格的轻小说阅读器，Android 安装包（APK）。清爽、无广告、离线优先。
前端为原生 HTML / CSS / JavaScript，Android 侧是轻量 WebView 外壳，全部资源打包进 APK，断网也能打开已缓存的章节。

当前版本 **v1.1.0**，新增「书源」：可导入「阅读」App 格式的书源 JSON，按 search / detail / toc / content 四个流程从第三方站点搜索、抓取目录与正文。

## 功能

- **发现 / 榜单 / 分类 / 书架 / 我的** 五个一级页面，深夜墨色 + 樱色点缀的视觉风格
- 内置 **10 本原创示例轻小说、23 章正文**，覆盖异世界、校园、奇幻、恋爱、悬疑、科幻、日常、治愈
- **自定义阅读器**：字号 15–28、四档行距、衬线 / 黑体 / 楷体、五种护眼背景（夜间、纸白、羊皮、护眼绿、墨黑）
- **两种翻页方式**：上下滚动、左右分页
- **简繁切换**：书名、简介、章节标题与正文即时转换（常用字级转换）
- **阅读进度自动记录**：章节 + 百分比，首页与书架显示「继续阅读」
- **离线缓存**：整本缓存到设备，离线可读；支持「仅 WiFi 缓存」开关
- **离线模式演示**：一键模拟断网，验证已缓存 / 未缓存章节的不同表现
- **章节评论与书评**：发布、点赞，全部保存在本机
- **本地电子书导入**：TXT（UTF-8 / GBK 自动识别）与 EPUB（手写 ZIP 解析 + 自动分章），导入后进书架
- **书源导入与管理**：兼容 Legado / 「阅读」书源 JSON，支持文件导入、粘贴导入、启用停用、删除
- **跨书源搜索**：一次输入，同时查询所有启用的书源，结果按来源分组
- **在线书籍**：从书源加入书架，按需抓取章节正文并缓存，支持离线重读
- **深色 / 浅色** 界面主题切换，无开屏广告、无弹窗

## 三步拿到 APK

1. 把本仓库推送到 GitHub（默认分支 `main` 或 `master`）。
2. 仓库自动运行 `Build APK` 工作流（也可在 Actions 页面手动 `Run workflow`）。
3. 构建完成后任选一种方式下载：

   - **Releases** 页面 → tag `apk-latest` → `yui-novel-v1.1.0.apk`
   - **Actions** → 最近一次运行 → 底部 **Artifacts** → `yui-novel-apk`

把 APK 传到 Android 手机安装即可。首次安装需在系统里允许「安装未知来源应用」。
最低支持 **Android 8.0（API 26）**。

### 推送命令

```bash
cd 本目录
git init
git add .
git commit -m "feat: yuiの轻小说 1.1，支持 Legado 书源"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

如果提交时报缺少身份：

```bash
git -c user.name="你的名字" -c user.email="你的邮箱" commit -m "feat: yuiの轻小说 1.1，支持 Legado 书源"
```

## 不装 APK 也能先看

```bash
cd app/src/main/assets/www
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000`，用手机尺寸窗口预览（Chrome DevTools 切到 390 × 844 效果最好）。
浏览器预览与 APK 内的界面、存储、导入逻辑一致；**外部书源请求会受浏览器跨域限制**，
APK 内由原生网络代理完成，不受 CORS 影响。

## 书源

### 怎么用

1. 我的 → 书源管理 → **导入内置示例书源**（无需联网，示例页面打包在 APK 内）。
2. 回到首页或分类页，点搜索，在搜索面板底部点「用书源搜索」。
3. 在书源搜索结果里点一本书 → 预览详情与目录 → **加入书架并阅读**。
4. 阅读时按需抓取正文并自动缓存；也可以进入详情页点「缓存全书」。

书源管理支持：

- 导入 `.json` 文件（单个书源或书源数组）
- 粘贴 JSON 文本
- 启用 / 停用 / 移除
- 每个书源会标记 search / detail / toc / content 四类规则是否存在

### 书源 JSON 规范

与 Legado（「阅读」App）书源字段保持一致，核心结构：

```json
{
  "bookSourceName": "示例书源",
  "bookSourceUrl": "https://example.com",
  "bookSourceGroup": "轻小说",
  "enabled": true,
  "header": "{\"User-Agent\":\"Mozilla/5.0 ...\"}",
  "searchUrl": "/search?q={{key}}&page={{page}}",
  "ruleSearch": {
    "bookList": "class.book-list@tag.li",
    "name": "class.book-name@text",
    "author": "class.book-author@text",
    "bookUrl": "class.book-link@href",
    "coverUrl": "class.book-cover@src",
    "intro": "class.book-intro@text",
    "kind": "class.book-kind@text",
    "lastChapter": "class.book-last@text",
    "checkKeyWord": "{{key}}"
  },
  "ruleBookInfo": {
    "name": "class.book-name@text",
    "author": "class.book-author@text",
    "coverUrl": "class.book-cover@src",
    "intro": "class.book-intro@text",
    "kind": "class.book-kind@text",
    "lastChapter": "class.book-last@text",
    "tocUrl": "class.toc-link@href",
    "wordCount": "class.book-word@text"
  },
  "ruleToc": {
    "chapterList": "class.chapter-list@tag.a",
    "chapterName": "text",
    "chapterUrl": "href"
  },
  "ruleContent": {
    "content": "id.content@html"
  }
}
```

四个流程分别对应：

| 字段 | 用途 | 请求 |
| --- | --- | --- |
| `searchUrl` + `ruleSearch` | 关键词搜索，返回书名、作者、封面、详情页地址 | `{{key}}`、`{{page}}` |
| `ruleBookInfo` | 书籍详情，读取书名、作者、简介、目录地址 | 书籍详情页 |
| `ruleToc` + `chapterList` | 章节目录，读取章节名与章节地址 | 目录页 |
| `ruleContent` + `content` | 章节正文 | 章节页 |

### 规则支持范围

已支持：

- 选择器：`class.` / `id.` / `tag.` / `text.`，也支持直接写 CSS 选择器
- 后缀：`@text`、`@html`、`@href`、`@src`、`@value`、`@ownText`、`@attr.xxx`
- 索引：`[0]`、`[-1]`
- 前缀：`@css:`、`@json:`
- JSON Path：`$.data.list`、`$.data.list[*].name`、`[0]`
- 替换：`##正则##替换内容`
- 模板变量：`{{key}}`、`{{page}}`、`{{baseUrl}}`
- 搜索校验：`ruleSearch.checkKeyWord`

暂不支持：

- `@js:` / `<js>` 规则（会提示 `UNSUPPORTED_JS`）
- `@XPath:` 规则（会提示 `UNSUPPORTED_XPATH`）
- 需要登录、验证码、加密参数的站点
- 动态渲染页面（书源只解析服务端返回的 HTML / JSON）

遇到不支持的规则，App 会给出明确的中文提示，而不是静默失败。

### 网络实现

浏览器里的 `fetch` 会受 CORS 限制，无法直接抓取第三方站点。
Android 侧新增了一个只读网络桥：

- `MainActivity` 用 `@JavascriptInterface` 暴露 `httpGet(id, url, headers)`
- 原生线程池用 `HttpURLConnection` 发起请求，限制 http / https、15 秒连接超时、20 秒读取超时、4MB 响应上限
- 自动处理重定向、UA、书源自定义请求头，按 `Content-Type` charset / UTF-8 / GBK 解码
- 结果通过 `window.__plHttpDone(id, ok, body, error)` 异步回传

前端 `js/net.js` 在有原生桥时走原生请求，在浏览器预览时回退到 `fetch`。

## 本地构建 APK

- **Android Studio**：直接打开仓库根目录，等待 Gradle 同步，运行 `app` 配置即可。
- **命令行**：安装 JDK 17 与 Android SDK 34，然后

```bash
./gradlew :app:assembleDebug
```

产物：`app/build/outputs/apk/debug/app-debug.apk`。

CI 使用 JDK 17 + Gradle 8.9（wrapper 已内置）+ AGP 8.5.2。

## 项目结构

```
.
├── .github/workflows/build-apk.yml     # 自动构建 APK 并发布到 Releases
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/paperlantern/novels/MainActivity.kt
│       ├── res/                         # 主题、图标、字符串
│       └── assets/www/
│           ├── index.html
│           ├── css/app.css
│           ├── mock-source/             # 内置示例书源的本地页面
│           └── js/
│               ├── app.js               # 路由、页面渲染、书源管理 UI
│               ├── reader.js            # 阅读器（滚动 / 分页 / 设置 / 目录 / 评论）
│               ├── source.js            # Legado 书源规则引擎与四个流程
│               ├── net.js               # 原生网络桥 / fetch 回退
│               ├── store.js             # localStorage + IndexedDB 存储、缓存与进度
│               ├── data.js              # 内置书目、分类、种子数据
│               ├── text-a|b|c.js        # 原创章节正文
│               ├── content.js           # 章节内容索引
│               ├── epub.js              # TXT / EPUB 解析
│               ├── convert.js           # 简繁字表与转换
│               └── utils.js             # 图标、格式化、工具函数
├── build.gradle.kts
├── settings.gradle.kts
└── gradle/wrapper/                      # Gradle 8.9 wrapper
```

## 技术说明

- Android 侧只有一个 `MainActivity` + `WebView`，通过 `WebViewAssetLoader` 用
  `https://appassets.androidplatform.net/assets/www/` 加载本地页面，而不是 `file://`，
  这样 `localStorage` / `IndexedDB` / `JavascriptInterface` 都能稳定工作。
- 前端零依赖、原生 ES Module，无构建步骤。
- **存储分层**：
  - `localStorage`：设置、书架、阅读进度、评论、点赞、导入书籍元数据、书源元数据
  - `IndexedDB`：已缓存章节正文、导入书籍全文、书源完整 JSON（数据库 v2）
- **离线逻辑**：读取章节时先查 IndexedDB；未命中且处于离线状态（真实断网或开启离线演示）时提示未缓存；
    在线时内置书走本地内容，远程书走书源规则抓取并自动缓存。
- **EPUB 解析**：手写 ZIP 中央目录解析，支持 store / deflate，使用系统 `DecompressionStream('deflate-raw')`
  解压，再按 OPF spine 顺序提取正文。
- **简繁转换**：内置约 700 组常用字映射，属于字级转换，不处理「发 / 髮」这类一简多繁与地区词汇差异。
- 文件选择、返回键、状态栏配色、网络桥都在 Android 壳层处理；网页内返回统一走 `window.__paperlanternBack()`。

## 内容与版权

内置的 10 本书、全部章节、评论均为本项目原创示例文本，仅用于演示阅读器功能，
**不包含任何真实轻小说作品的内容**。内置示例书源只抓取 `assets/www/mock-source/` 下的本地页面。

书源功能用于接入你自己选择并有权访问的第三方站点。书源配置与抓取内容由使用者自行负责，
请遵守目标站点的使用条款，不要用它分发无授权的版权内容。

## 已知限制

- 内置书库是演示数据，没有接入官方书城、账号体系或云同步。
- 评论、阅读进度、书源都只保存在本机，没有服务器端。
- APK 是 **debug 签名**，适合个人安装体验；若要上架应用商店，需要自行配置 release 签名。
- 书源规则只覆盖 CSS / JSON Path 子集，复杂书源（JS、XPath、登录、加密）无法使用。
- EPUB 解压依赖系统 WebView 的 `DecompressionStream`（Chrome / Android System WebView 103+）。
  非常旧的设备若导入 EPUB 失败，请改用 TXT。
- 简繁转换为常用字级，个别多音多义字可能与人工校对结果不同。
- 为兼容部分书源站点，APK 允许明文 HTTP 请求，并允许加载 http 封面图；请只使用可信书源。
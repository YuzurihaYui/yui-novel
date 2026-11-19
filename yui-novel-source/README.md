# yuiの轻小说 · 轻小说阅读 App

书源驱动的轻小说阅读器，Android 安装包（APK）。清爽、无广告、离线优先。
**没有内置书库，也没有评论区**：书来自你导入的书源，或从本地导入的 TXT / EPUB。

前端为原生 HTML / CSS / JavaScript，Android 侧是轻量 WebView 外壳，全部资源打包进 APK。

当前版本 **v1.5.0**。

## 功能

- **书源**：兼容 Legado / 「阅读」App 的书源 JSON，支持文件导入、粘贴导入、启用停用、删除
- **书源搜索**：一次输入，同时查询所有启用的书源，结果按来源分组
- **在线书籍**：从书源加入书架，按需抓取章节正文并缓存，支持离线重读
- **本地导入**：TXT（UTF-8 / GBK 自动识别）与 EPUB（ZIP 解析、NCX / NAV 目录、自动分章）
- **封面读取**：自动提取 EPUB 封面（cover-image / meta cover / guide），远程书使用书源封面；书架、详情、首页与 3D 书脊都会显示
- **EPUB 插画**：提取正文中的图片并按原位置显示，点击可全屏查看
- **书架**：收藏、继续阅读；默认按书名拼音排序，可切换最近阅读
- **书架视图**：3D 书脊书架与封面网格一键切换；书脊叠加封面纹理、显示编号、竖排书名与阅读进度，选中后在下方查看详情
- **阅读记录**：可删除单本书或全部阅读记录，书籍本身仍保留
- **阅读器**：字号 15–28、四档行距、衬线 / 黑体 / 楷体、五种护眼背景
- **翻页方式**：上下滚动、左右分页
- **简繁切换**：书名、简介、章节标题与正文即时转换（常用字级转换）
- **离线缓存**：整本缓存到设备；支持「仅 WiFi 缓存」与「离线模式演示」
- **界面主题**：深色 / 浅色切换，无开屏广告、无弹窗

已移除：内置示例书库、榜单一类的内置榜单、分类书库、章节评论、书评与点赞。

## 三步拿到 APK

1. 把本仓库推送到 GitHub（默认分支 `main` 或 `master`）。
2. 仓库自动运行 `Build APK` 工作流（也可在 Actions 页面手动 `Run workflow`）。
3. 构建完成后任选一种方式下载：

   - **Releases** 页面 → tag `apk-latest` → `yui-novel-v1.5.0.apk`
   - **Actions** → 最近一次运行 → 底部 **Artifacts** → `yui-novel-apk`

把 APK 传到 Android 手机安装即可。首次安装需在系统里允许「安装未知来源应用」。
最低支持 **Android 8.0（API 26）**。

### 推送命令

```bash
cd 本目录
git init
git add .
git commit -m "feat: yuiの轻小说 1.2，移除内置书与评论"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

如果提交时报缺少身份：

```bash
git -c user.name="你的名字" -c user.email="你的邮箱" commit -m "feat: yuiの轻小说 1.2，移除内置书与评论"
```

## 不装 APK 也能先看

```bash
cd app/src/main/assets/www
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000`，用手机尺寸窗口预览。
浏览器预览与 APK 内的界面、存储、导入逻辑一致；**外部书源请求会受浏览器跨域限制**，
APK 内由原生网络代理完成，不受 CORS 影响。

## 书源

### 怎么用

1. 底部「书源」→ **导入内置示例书源**（示例页面打包在 APK 内，无需联网），或导入自己的书源 JSON。
2. 底部「发现」→「书源搜索」，或从搜索面板底部进入。
3. 点一本书 → 预览详情与目录 → **加入书架并阅读**。
4. 阅读时按需抓取正文并自动缓存；详情页也可以「缓存全书」。

书源管理支持 `.json` 文件导入、粘贴 JSON、启用 / 停用 / 移除，并标记 search / detail / toc / content 四类规则是否存在。

### 书源 JSON 规范

与 Legado（「阅读」App）书源字段保持一致：

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
    "tocUrl": "class.toc-link@href"
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

| 字段 | 用途 |
| --- | --- |
| `searchUrl` + `ruleSearch` | 关键词搜索，返回书名、作者、封面、详情页地址 |
| `ruleBookInfo` | 书籍详情，读取书名、作者、简介、目录地址 |
| `ruleToc` + `chapterList` | 章节目录，读取章节名与章节地址 |
| `ruleContent` + `content` | 章节正文 |

### 规则支持范围

已支持：

- 选择器：`class.` / `id.` / `tag.` / `text.`，也支持直接写 CSS 选择器
- 后缀：`@text`、`@html`、`@href`、`@src`、`@value`、`@ownText`、`@attr.xxx`
- 索引：`[0]`、`[-1]`，以及 Legado 风格的 `.0`、`.-1`（如 `tag.li.0`）
- 前缀：`@css:`、`@json:`
- JSON Path：`$.data.list`、`$.data.list[*].name`、`[0]`
- URL 选项：`url,{"method":"POST","body":"keyword={{key}}","charset":"gbk","headers":{...}}`
- 替换：`##正则##替换内容`
- 模板变量：`{{key}}`、`{{page}}`、`{{baseUrl}}`
- 搜索校验：`ruleSearch.checkKeyWord`
- 请求细节：自动保持 Cookie、补全 Referer、解压 gzip、跟随重定向

暂不支持：

- `@js:` / `<js>` 规则（会提示 `UNSUPPORTED_JS`）
- `@XPath:` 规则（会提示 `UNSUPPORTED_XPATH`）
- 需要登录、验证码、加密参数的站点
- 动态渲染页面（书源只解析服务端返回的 HTML / JSON）

遇到不支持的规则会给出明确的中文提示，而不是静默返回 0 本。

### 网络实现

浏览器里的 `fetch` 会受 CORS 限制，无法直接抓取第三方站点。
Android 侧有一个网络桥：

- `MainActivity` 用 `@JavascriptInterface` 暴露 `httpGet(id, url, headers, options)`
- 原生线程池用 `HttpURLConnection`，限制 http / https、20 秒连接超时、30 秒读取超时、4MB 响应上限
- 支持 GET / POST（含 `body`、`charset`、`headers`），处理重定向、UA、书源自定义请求头
- 全局 `CookieManager` 保持会话，自动补全 Referer，按需解压 gzip
- 结果通过 `window.__plHttpDone(id, ok, body, error)` 异步回传

内置示例书源与页面同源（`appassets.androidplatform.net`），这类请求走 WebView 内部 `fetch`，
不会交给原生 `HttpURLConnection`；因此示例源在飞行模式下也能读取。

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
│           ├── mock-source/             # 内置示例书源的本地页面（可选导入）
│           └── js/
│               ├── app.js               # 路由、页面渲染、书源管理 UI
│               ├── reader.js            # 阅读器
│               ├── source.js            # Legado 书源规则引擎
│               ├── net.js               # 原生网络桥 / fetch 回退
│               ├── store.js             # localStorage + IndexedDB
│               ├── data.js              # 搜索热词
│               ├── epub.js              # TXT / EPUB 解析
│               ├── convert.js           # 简繁转换
│               └── utils.js             # 图标与工具函数
├── build.gradle.kts
├── settings.gradle.kts
└── gradle/wrapper/                      # Gradle 8.9 wrapper
```

## 技术说明

- Android 侧只有一个 `MainActivity` + `WebView`，通过 `WebViewAssetLoader` 用
  `https://appassets.androidplatform.net/assets/www/` 加载本地页面，保证 `localStorage` / `IndexedDB` /
  `JavascriptInterface` 正常工作。
- 前端零依赖、原生 ES Module，无构建步骤。
- **存储**：
  - `localStorage`：设置、书架、阅读进度、导入书籍元数据、书源元数据
  - `IndexedDB`：已缓存章节正文、导入书籍全文、书源完整 JSON
- **离线**：读取章节先查 IndexedDB；未命中且离线时提示未缓存；在线时远程书按书源规则抓取并自动缓存。
- 文件选择、返回键、状态栏配色、网络桥都在 Android 壳层处理；网页内返回统一走 `window.__paperlanternBack()`。

## 内容与版权

App 不内置任何书籍内容。内置示例书源只抓取 `assets/www/mock-source/` 下的本地示例页面，
用于验证书源规则是否正常。

书源功能用于接入你自己选择并有权访问的第三方站点。书源配置与抓取内容由使用者自行负责，
请遵守目标站点的使用条款，不要用它分发无授权的版权内容。

## 已知限制

- 没有内置书库，首次打开需要先导入书源或本地文件。
- 没有评论 / 书评 / 点赞功能。
- 阅读进度、书源、缓存都只保存在本机，没有服务器端。
- APK 是 **debug 签名**，适合个人安装体验；上架应用商店需要自行配置 release 签名。
- 书源规则只覆盖 CSS / JSON Path 子集，复杂书源（JS、XPath、登录、加密）无法使用。
- EPUB 解压依赖系统 WebView 的 `DecompressionStream`（Chrome / Android System WebView 103+）。
- EPUB 插画只提取 `<img>` 引用的图片，单张上限 4MB、每章最多 12 张；内联 SVG 不提取。
- 为兼容部分书源站点，APK 允许明文 HTTP 请求，并允许加载 http 封面图；请只使用可信书源。
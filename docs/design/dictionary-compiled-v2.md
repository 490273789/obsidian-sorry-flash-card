# compiled-v2 词典包格式规范

状态：本格式继承自 `obsidian-tools`（engineVersion `2.0.6`，formatVersion `2`）。任何格式或引擎变更都必须显式升版本，见 [ADR-0017](../adr/0017-dictionary-engine-and-sources.md)。区域边界见[词典指南](../agents/dictionary.md)，手工搬运约定见[词典迁移](dictionary-migration.md)。

`compiled-v2` 是插件查询的唯一本地词典格式。包在桌面端由显式选择的 MDX/MDD/CSS/JS 或 EUDIC 文件组编译，随后可作为普通文件同步，用于桌面端或移动端查询。原始源文件不会复制进插件目录。

## 权威模块

`src/dictionary/compiled-package/` 是本契约的唯一权威。它的公开接口负责发布包事务、打开经校验的读取器、检查已同步的包状态，以及回答兼容性。manifest 类型、版本常量、规范化、路径规则、限制、源指纹与编译器契约都保持私有，只属于该模块及其 worker。

本地词典目录仍是稳定来源身份、成员关系、顺序与整词典事务的权威；其 compiled 元数据是预期的包身份。权威模块从 `manifest.json` 推导实际身份并要求每个字段一致；它绝不扫描磁盘来创建目录成员，也不静默修复目录元数据。

## 兼容性契约

- 目录：`{vault}/{configDir}/plugins/wsr-flash-card/dictionaries/{id}/compiled-v2/`
- 入口：`manifest.json`
- `formatVersion`：`2`
- `engineVersion`：`2.0.6`
- manifest 是确定性的 UTF-8 JSON，不含时间戳或机器相关路径。
- 每个源文件与包文件都记录其字节长度和小写 SHA-256 摘要。
- 读取端拒绝未知的格式或引擎版本，绝不尝试尽力降级。
- 历史 `portable` 目录项只用于在 UI 中报告需要重新导入；读取端从不加载它们，也不会自动删除它们。

manifest schema、索引编码、记录编码、规范化或读取语义的变更需要新的 format version；只修复解析器或压缩器、但会改变确定性输出的变更需要新的 engine version。

## 清单与文件

manifest 包含源描述符、包文件描述符、有序 FST 索引分片、资源分片、记录帧、可选 `style.css`、可选 `script.js`，以及可选的固定 EUDIC 远程资源类型。资源帧描述符与定位符一同放在受大小限制的资源索引分片内，不会展开进启动 manifest。

| 对象           | 编码                  | 硬上限                                 |
| -------------- | --------------------- | -------------------------------------- |
| Manifest       | UTF-8 JSON            | 2,000,000 字节                         |
| 精确索引       | FST map               | 每分片 512 KiB                         |
| 倒排表         | UTF-8 JSON            | 每分片 512 KiB；每个规范化键 64 条记录 |
| 资源索引       | UTF-8 JSON            | 每分片 512 KiB                         |
| 记录帧         | UTF-8 JSON，可选 zlib | 约 64 KiB 解包后                       |
| 记录/资源包    | binary                | 每文件 2 MiB                           |
| 单个解包帧     | binary                | 32 MiB 读取上限                        |
| 样式表         | UTF-8 CSS             | 8 MiB                                  |
| 伴随脚本       | UTF-8 JavaScript      | 8 MiB                                  |
| 单个解析后资源 | binary                | 21,000,000 字节                        |

记录帧与资源帧只在打包后至少小 5% 时使用 zlib/deflate level 3；否则原样存储，因此已压缩媒体通常保持字节不变。包路径是相对的、由引擎生成，且只限 `indexes/`、`blocks/`、`style.css` 与 `script.js`。

查找键在 Rust 编译器中使用 Unicode NFKC 规范化、与 locale 无关的小写化，以及由 TypeScript worker 镜像的标点移除规则。精确 FST 值指向倒排表，倒排表指向 `(frame, item)` 记录定位符。前缀与 Unicode 感知的编辑距离 2 查找使用同一批 FST 分片，因此编译不会物化删除表。超过 48 个 Unicode 标量的输入回退为前缀建议。

## 资源与渲染

只有以下 MIME 类型的本地 MDD 资源可以进入编译资源索引：

- 图片：APNG、AVIF、BMP、GIF、ICO、JPEG、PNG、SVG、WebP
- 音频：AAC、FLAC、M4A/MP4、MPEG、Ogg、Opus、WAV、WebM
- 视频：M4V/MP4、MOV、Ogg、WebM
- 字体：EOT、OTF、TTF、WOFF、WOFF2
- 样式表：CSS
- 脚本：JavaScript
- 本地运行时数据：HTML、JSON、纯文本（`txt`/`md`）、WebVTT、WASM、XML、Web App Manifest、`bin`/`dat`（`application/octet-stream`）

明确导入的 MDX 词典始终使用本地兼容渲染。内联脚本、事件属性、普通表单控件与匹配的伴随脚本都会保留。相对 MDD 样式表链接与脚本源会被解析、按需净化，并在匹配的伴随脚本运行前按声明顺序内联。打包的 CSS import、响应式 `srcset` 候选，以及 HTML、CSS、内联样式、图片、SVG、音频、视频、字体、JSON、XML、WebVTT、worker 与 WASM 中的相对 MDD 引用，都会经资源索引规范化与解析。普通链接属性为兼容伴随脚本而保留，同时捕获守卫阻止未桥接的导航。不存在单独的本地安全模式开关。

兼容渲染仍使用不带 `allow-same-origin` 的不透明源 iframe。远程脚本与资源请求、父 DOM 访问、危险协议、越出 MDD 资源根的遍历、file/password 输入、内嵌 frame/object、外部导航与远程 CSS import 仍被 iframe 与 CSP 边界阻止。在线词典 HTML 继续使用严格净化，绝不进入本地兼容模式。资源 URL 在 LRU 淘汰、视图/来源关闭、工具停用与插件卸载时被撤销。

对于使用标准同步 `localStorage` 接口的导入词典，沙箱会在任何词典脚本运行前安装一个词典作用域的兼容对象。它的初始字符串值从 `{vault}/{configDir}/plugins/wsr-flash-card/dictionaries/{id}/sandbox-storage.json` 读取；set、remove 与 clear 变更经同一套已注册 frame 与随机文档身份边界发送，并由宿主串行化。该存储最多允许 128 个键、每键 128 个字符、每值 16,384 个字符，以及 256 KiB 的 UTF-8 JSON。它不暴露浏览器存储、其他词典的值、父 DOM 或同源访问。运行时存储文件与确定性的 `compiled-v2` 包相邻，但不属于该包。

在 engine 2.0.6 之前创建的编译包不包含完整的展开本地资源允许列表与 EUDIC 路径保留修复，因此被有意判定为不兼容，目录会请求重新导入源文件。

沙箱宿主通过带版本、经文档身份校验的消息通道向每个已注册文档发送当前 Obsidian 明/暗模式，并在 frame 加载后重发。主题变化更新既有文档，而不是重建 `srcdoc`。文档只收到 `color-scheme` 提示与主题属性。本地词典的颜色、表面、媒体与 CSS 保持不变；不注入任何兼容滤镜、反向滤镜或 Obsidian 视觉归一化。

解析后的本地音频控件保留其导入的 class、文本、SVG、图片与 CSS 背景。如果词典没有提供音频或可见控件，渲染器保持该条目不变，不添加回退图标或系统语音控件。

本地兼容渲染不会为折叠段落、图片预览、短语组、快捷键、词性导航、单选面板或学习等级标签变换词典 DOM。它也不注入任何基础排版、表格、滚动条、徽章、标签页、面板、尺寸或颜色 CSS。原始元素、class、层级、内联样式、伴随脚本状态与净化后的词典 CSS 都会保留。CSS 净化仍限于安全边界：远程与危险 URL、危险的旧式可执行构造被阻止，而允许列表中的 `data:` 资源、相对 MDD 资源与打包 CSS import 会被保留或解析。

一般 EUDIC 包内嵌其允许列表中的资源，并保持 `remoteResourceKind` 未设置。编译器通过有界缓存流式处理 16 KiB 的 zlib 块，校验 16 字节记录表与 UTF-8 键池，并读取末尾的 `(name offset, name length, data offset, data length)` 资源描述符，而不保留完整的解压词典。按既有 EUDIC 约定，根 CSS 与 JS 仍作为包伴随文件，同时每个 CSS/JS 资产也保留在资源索引中，因此原始样式表链接、脚本源、CSS import、worker 与数据路径仍能解析。`eures://` 引用保留到本地兼容边界再规范化；`dic://` 链接在同一道边界处理。

仅图片的 EUDIC 包可以只声明 `eudic-word-card-en-v2`。匹配的图片在一次显式查询之后从固定的 HTTPS 词卡路径获取，不带凭据、不跟随重定向、不预取、不使用持久缓存，响应不超过 4 MiB。有界的 JPEG 在进入不透明源沙箱前被编码为 data URL；父页面创建的 Blob URL 不跨越该边界。

## 限制与稳定失败

引擎拒绝非法长度、越界偏移、整数溢出、校验和不匹配、截断、超出配置限制的解压膨胀、不安全资源路径与不支持的加密。用户可见的编译失败使用以下稳定错误码：

- `unsupported-format`
- `encrypted`
- `corrupt`
- `limit-exceeded`
- `cancelled`
- `storage-failed`

编译写入一个暂存目录。主线程只在该文件的异步写入完成后才确认每个已产出文件。定义/索引输出在 MDX 编译结束后排空；随后每个 MDD 依次解析、排空并在下一个 MDD 开始前释放。编译器最后把候选交给包权威模块，后者把每个文件读回、校验长度与 SHA-256、执行 125% 包/源大小上限，并在目录重命名之后、目录事务提交之前发布。取消或失败会移除暂存并保留原有目录项。

查询时，同一模块解析 manifest 一次，只向查询 worker 暴露不透明查询计划，并在大小与 SHA-256 校验后按需惰性读取文件。它拥有按字节预算的 LRU，并合并对同一文件的并发读取。`CompiledDictionarySource` 只拥有查询编排、受控资源 URL 与沙箱文档准备。

## 性能验收

目标 profile：

- 桌面端/移动端冷查找 P95 至多 80/150 ms；
- 桌面端/移动端热查找 P95 至多 20/50 ms；
- 一次普通冷精确查找不超过四次包文件读取或约 6 MiB；
- 桌面端/移动端缓存预算为 64/24 MiB；
- 2 GiB 源编译峰值低于 256 MiB，且没有超过 50 ms 的主线程任务；
- 相比已退役的 JavaScript 构建器，峰值编译内存至少低 50%，总编译时间至少低 30%。

正确性与包边界测试在 CI 中运行。针对语料的延迟与 2 GiB 内存目标必须在具有代表性的桌面端/移动端硬件上于发布前测量；它们是验收门槛，不是从单元测试推断出的声明。

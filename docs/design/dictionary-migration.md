# 词典迁移

状态：十三项迁移决策已确认，代码已落地并通过自动验证；剩余为 Obsidian 内人工验收。

已执行的自动验证：`tsc --noEmit`（0 错误）、`oxlint src`（0 错误 / 13 警告，不高于迁移前 14 警告的基线）、`vitest run`（48 个文件 652 项通过；唯一失败项 `translationSettingsEditor.test.ts` 在迁移前的 HEAD 上即已失败）、`oxfmt . --check`（干净）、`vite build`（`main.js` 2.5 MB，内联 WASM 与内联 worker，无 `dist/` 残留，`node:` 动态导入改写为 `require`）。未执行：Obsidian 内人工验收与真实网络请求。

## 已确认决策

1. 完整保留源工具能力：在线来源（有道免费/官方、剑桥、沪江、AI）+ 本地离线引擎（Rust/WASM 编译的 compiled-v2 包、桌面端导入 MDX/MDD/CSS/JS 与 EUDIC、沙箱文档渲染、Eudic 远程图片资源）+ 收藏 + 搜索历史。
2. 不做数据迁移，也不导入设置或凭据：功能从 `DEFAULT_DICTIONARY_SETTINGS` 起步，用户自行搬运已编译的词典数据，不写迁移脚本。
3. UI 用 React 重写；源项目的 Vue 实现仅作行为参考。
4. Rust crate 移植进本仓库：根 `Cargo.toml`、`Cargo.lock`、`crates/dictionary-engine/**`（含 Rust 测试与 `fuzz/`）。`src/dictionary/engine/` 下四个 wasm-bindgen 生成物提交入库，`pnpm build` 与 CI 保持纯 Node；`pnpm dictionary:engine` 负责重建（`cargo build --release --target wasm32-unknown-unknown -p dictionary-engine` + `wasm-bindgen --target web --out-dir src/dictionary/engine --out-name dictionary_engine`）。`target/` 已被 git 忽略。
5. 不做闪卡/题库集成；只共享 AI 引擎配置与 Obsidian `SecretStorage`。
6. 两个视图（词典主视图 + 收藏侧边栏）、一个侧边栏图标、两个命令（`open-dictionary` 绑定 `Alt+W`、`dictionary-lookup-selection`）、设置页一个区块，以及一个 `enabled` 开关控制图标与命令（默认 `false`，与现有 `settings.translation.enabled` 约定一致）。视图始终注册；功能停用时视图就地展示停用提示。
7. 只移植纯逻辑测试（放在 `src/dictionary/__tests__/`，node Vitest 环境）；不移植 UI 测试。WASM/worker/沙箱集成测试明确不移植，列为人工验证。
8. `AiService.generate()` 新增请求级 `jsonMode` 选项；词典的 AI 来源选择 **AI 引擎配置 ID**（`settings.dictionary.ai.configId`），不再使用源工具的 provider/model 对。
9. 有道 v3 签名原语改为共享：`src/translation/youdaoSign.ts`（`youdaoV3SignInput`、`buildYoudaoV3Body`）同时服务于翻译与词典；端点、参数与解析各自保留（翻译 API 是 v1 `/api`，词典 API 是免费 `dict.youdao.com/jsonapi` + 官方 `openapi.youdao.com/v2/dict`）。
10. HTTP 规则：所有在线来源使用 Obsidian `requestUrl`/`request`；**唯一例外**是 Eudic 图片抓取，保留原始 `fetch` 并固定 `credentials: 'omit'`、`redirect: 'error'`，因为 `requestUrl` 无法关闭重定向，而"不跟随重定向"是文档化的安全不变量。该例外同时记录于 ADR-0017 与本目录的词典指南。
11. 不携带源项目的死状态：持久化的 `favorites[]` 数组（从未被读取）、主视图从未渲染的 `state.message`、9 个死文案键（`favorites`、`viewImage`、`dictionaryImage`、`learningBadge`、`partOfSpeechNavigation`、`removeFavorite`、`mobileUnavailable`、`portableReadOnly`、`sourceOrderSaved`），以及被取代的 portable 包生成族。
12. 有道凭据只保存 `SecretStorage` 引用（`appKeySecretId`、`appSecretSecretId`）；插件数据只存标识符，绝不存明文。
13. 收藏只写入 `settings.dictionary.favoritePath` 指向的 Markdown 文件（默认 `word.md`）；写入路径先持久化设置、再写文件，失败时回滚界面状态。

## 功能等价范围

以源项目 `obsidian-tools/src/tools/dictionary/**` 为行为依据，Rust 引擎对应源 `crates/dictionary-engine/**`。

- 在线来源：`youdao.ts`（免费与官方两种接入方式，显式选择，互不静默回退）、`cambridge.ts`、`hujiang.ts`、`online.ts`（共享请求封装、响应大小上限、错误码归类）、`ai.ts`（AI 释义，按查询显式触发）。
- 本地离线：`compiled-package/**`（格式、manifest、限制、校验和、安全路径、发布）、`compiled-source.ts`（查询编排与受控资源 URL）、`importer.ts` 与 `local-storage.ts`（桌面端导入与删除事务）、`local-administration.ts`（目录快照、进度、失败码、`requiresReimport`）、`engine-loader.ts`、`dictionary.worker.ts`、`query.worker.ts`、`compiler.worker.ts`、`engine/**`。
- 沙箱：`sandbox-document/**`（`prepare`、`document`、`protocol`、`host`）、`sandbox-storage.ts`、`resource-url.ts`、`eudic-image.ts`。
- 视图与设置：`controller.ts`、`favorite-controller.ts`、`favorite-file.ts`、`view.ts`、`favorite-view.ts`、`modal.ts`、`settings.ts`、`types.ts`；`Dictionary.vue`、`DictionaryFavorite.vue`、`styles.css` 仅作行为与视觉参考。
- 搜索历史保留为 `settings.dictionary.history`（最多 50 条，去重、大小写不敏感）。

## 接入方式

组合根仍是 `src/obsidian/main.ts`：装配共享 AI 服务、词典设置存储与运行时，注册两个视图、两个命令、侧边栏图标与设置区块；`enabled` 只控制图标与命令，视图始终注册并在停用时就地显示提示。

目标结构：

- 领域层 `src/dictionary/**`：类型、配置、文案、控制器、运行时、编译包、沙箱文档、在线来源、导入器、本地管理、worker、`engine/`。
- 国际化 `src/i18n/dictionary.ts`：`dictionaryStrings(language)`，中文优先，英文覆盖缺失键时回退中文。
- Obsidian 边界：`src/obsidian/features/dictionary.ts` 装配，加上 `DictionaryView.tsx`、`DictionaryFavoriteView.tsx`、`dictionaryModals.ts`、`dictionarySettingsEditor.ts`。
- UI：`src/ui/views/Dictionary/**`，使用 `flashcard-dictionary-*` 类名；样式追加到 `src/styles/index.scss` 的 motion/responsive 之前。
- 设置：`src/settings/dictionarySettingsViewModel.ts`，以及 `src/settings/settingsViewModel.ts` 新增的 `reorderableList` 控件变体。
- 数据模式：`FlashcardSettings.dictionary`，由 `src/dictionary/configuration.ts` 导出的 `dictionarySettingsSlice` 描述符提供 defaults / normalize / clone，并在 `src/settings/settingsSlices.ts` 注册一次（ADR-0019）。
- 磁盘：`{vault}/{configDir}/plugins/wsr-flash-card/dictionaries/{id}/compiled-v2/**` 与 `{id}/sandbox-storage.json`（≤256 KiB）。Vault 内只写收藏 Markdown。

AI 释义只保存所选 AI 引擎配置 ID；有道专用连接保存 SecretStorage 引用。共享 AI 服务的新能力保持既有调用兼容，词典的提示词与结果解析归词典模块所有。复用本项目 React 原语、`--fc-*` 与 Obsidian 主题变量、键盘焦点与响应式规范；原 Vue 实现不参与运行。

## 手动数据迁移参考

不提供迁移脚本。用户需自行把源项目已编译的词典数据与设置搬到下列位置。

目标目录（`{id}` 为词典标识）：

```text
{vault}/{configDir}/plugins/wsr-flash-card/dictionaries/{id}/compiled-v2/
  manifest.json
  indexes/…
  blocks/…
  style.css      （可选）
  script.js      （可选）
{vault}/{configDir}/plugins/wsr-flash-card/dictionaries/{id}/sandbox-storage.json   （可选）
```

`settings.dictionary.localDictionaries[]` 每项的形态：

```json
{
	"id": "my-dict",
	"name": "英汉词典",
	"directory": "my-dict",
	"files": [{ "name": "dict.mdx", "size": 12345678 }],
	"compiled": {
		"formatVersion": 2,
		"engineVersion": "2.0.6",
		"manifestPath": "compiled-v2/manifest.json",
		"manifestSha256": "64 位小写十六进制",
		"sourceFingerprint": "64 位小写十六进制",
		"entryCount": 100000,
		"fileCount": 12,
		"totalBytes": 98765432
	}
}
```

`id` 必须匹配 `^[a-z\d][a-z\d-]{2,80}$`（3–81 位字母、数字、连字符，首字符为字母或数字），`directory` 等于 `id`，`files` 至少含一个 `.eudic` 或 `.mdx` 条目。

`settings.dictionary.sources[]` 每项的形态（顺序即展示顺序）：

```json
[
	{ "id": "youdao", "kind": "youdao", "label": "有道词典", "enabled": true },
	{ "id": "cambridge", "kind": "cambridge", "label": "剑桥词典", "enabled": true },
	{ "id": "hujiang", "kind": "hujiang", "label": "沪江小D", "enabled": true },
	{ "id": "my-dict", "kind": "local", "label": "英汉词典", "enabled": true },
	{ "id": "ai", "kind": "ai", "label": "AI 词典", "enabled": false }
]
```

- 三个在线来源的 `id` 固定为 `youdao`/`cambridge`/`hujiang`；AI 来源的 `id` 固定为 `ai`（默认停用）；`local` 来源的 `id` 必须存在于 `localDictionaries`。
- 有道与 AI 设置：`youdao: { accessMode: "official" | "free", appKeySecretId, appSecretSecretId, dictionaries }`（凭据只存标识符），`ai: { configId }`（AI 引擎配置 ID 或 `null`）。
- 收藏路径 `favoritePath` 默认 `word.md`；搜索历史 `history` 最多 50 条。

硬性校验：

- `formatVersion` 必须为 `2`，`engineVersion` 必须精确等于 `"2.0.6"`，否则该包被判为不兼容并提示重新导入（`requiresReimport`）。
- `manifestPath` 必须为 `compiled-v2/manifest.json`；`manifestSha256` 与 `sourceFingerprint` 必须是 64 位小写十六进制。
- 目录是权威：不扫描磁盘来发现或补全词典，冲突只在导入/删除事务中显式处理，绝不静默修复；导入写入暂存目录并以目录重命名发布，失败或取消时清理暂存并保留原目录项。

## 收藏格式风险

收藏 Markdown 使用 `## 词\n??\n释义\n::\n笔记\n;;\n`，与本插件闪卡的 `??` / `::` / `;;` 语法相同且含 `##` 标题与 `#` 标签扫描约定。若收藏文件落在被扫描的题库目录或带有闪卡标签，它会被当成一个题库。迁移与文档都应提示把 `favoritePath` 放在扫描范围之外，或不要给它加闪卡标签。

## 验收

- 多个启用来源并行请求，结果按来源顺序展示，单项失败不丢弃其他结果；官方与免费有道互不回退。
- AI 释义仅在显式请求时发送查询；请求带 `jsonMode: true`，返回非 JSON 时回退为纯文本释义而不是报错；提示词与解析都有长度上限。
- 沙箱在加载前就把主题与 `color-scheme` 写入 `srcdoc`，深色模式下无白屏闪烁；主题后续变更走已校验的消息协议。
- 收藏先持久化路径设置再写文件；写入失败回滚界面状态。
- 沙箱存储按上限持久化到 `sandbox-storage.json`，并可在重新打开后读回。
- 导入取消或失败后回滚到原目录项；引擎版本不匹配时给出重新导入提示。
- 移动端只能查询已完整同步的 compiled-v2 包，不能编译源文件。
- 构建产物断言：`main.js` 内含内联 WASM 与内联 worker，构建后没有 `dist/` 残留。

验证按 [测试工作流](../agents/testing-and-workflow.md) 执行相关测试与构建；WASM、worker 与沙箱行为按实际执行情况报告人工验证结果。

## 已知后续

- **引擎产物重建未验证**：`pnpm dictionary:engine` 要求本机 `wasm-bindgen` CLI 与 `crates/dictionary-engine/Cargo.toml` 固定的 `wasm-bindgen = 0.2.108` 精确匹配（CLI 版本不一致会产生不同产物），并且 `cargo` 需要可写的 registry 缓存。迁移收尾时本机 CLI 为 0.2.127 且 registry 写入被拒绝，因此"重建产物 SHA 与提交版本一致"这一验收项**未执行**，需在具备上述条件的机器上补做。
- **沙箱内部标识仍带 `obsidian-tools` 前缀**：`src/dictionary/sandbox-document/**` 的消息通道 `obsidian-tools.dictionary-sandbox`、`data-obsidian-tools-dictionary-{theme,audio,entry}` 属性名与 `dataset.obsidianToolsDictionaryTheme` 按原样移植。它们是本插件自用的内部协议标识（不影响行为），但改名必须同时改 `prepare.ts` 的样式字符串、`document.ts` 的主题注入正则与 `host.ts` 的 `dataset` 赋值，且只有真实渲染才能验证深色主题未失效，故留作独立、可运行时验证的后续改动。

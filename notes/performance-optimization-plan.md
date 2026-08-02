# 性能优化方案（已实现 ✅）

> 状态：**已全部实现并通过验证**（typecheck / 219 测试 / lint / build 全绿；本次源文件与文档格式通过，仓库全量 format 检查仅剩未改动的生成文件 `styles.css`）。
> 本文档保留为历史方案与决策依据；实际落地细节、坚守的契约、验证与回滚说明见
> **《性能优化实施记录》** → `notes/performance-optimization-implementation.md`。
>
> 最终方案按"原子持久化语义不变"的原则落地（方案 A：每次答题原子提交，但只克隆与序列化受影响的 deck），
> 冷启动采用"先渲染后刷新"，全部 P0-P2 项一次性推进完成。

---

## 0. 建议先做基线测量

在动手前，先记录当前基线，便于验证优化效果：

- 打开插件视图（冷启动）耗时：从点击 ribbon 到首页可交互。
- 大词库（建议 ≥ 1000 张卡 / 多个 deck）下，study 模式连打 10 张卡的总耗时与单卡卡顿感。
- spelling 自动发音场景下的音频缓存行为。

可用浏览器 DevTools Performance / React DevTools Profiler 在 Obsidian 内测量。

---

## P0-1　每次答题全量落盘（最高优先级）

**涉及文件**

- `src/sessions/sessionLifecycle.ts`：`applyStudyAction` / `applySpellingAction` → `commit()` → `repository.commitSessionTransition`
- `src/storage/dataStore.ts`：`commitSessionTransition`

**现状**

- study 模式每次 rating 都会：
    1. `cloneDecks(this.decks)` 深拷贝**所有** deck 的所有卡片；
    2. `buildStoredData()` 再次全量序列化所有 deck；
    3. `plugin.saveData()` 全量 JSON.stringify + 磁盘写入；
    4. 上述过程 `await` 在 lifecycle 锁内完成，期间用户按键（下一张卡）被阻塞。
- spelling 模式每次 retrieval 答题同样提交一次（`spellingAttempts`）。
- practice 模式已经做到"过程不落盘、结束才提交"，是正确的参考方向。

**影响**

- 词库越大越明显：2000 张卡时，每次答题约 2 次全量拷贝 + 1 次全量序列化 + 1 次磁盘写，每答一张卡都会卡顿一次；整场 50 张卡 = 50 次全量写盘。

**方案（三选一或组合）**

1. **会话内累积 + 结束时一次性提交**（推荐，改动最大但收益最大）
    - 会话期间把 `cardUpdates` / `spellingAttempts` 累积在内存中，仅更新内存态并 `publish`；在会话结束（complete / exit / abandon / 来源变化结束会话）时一次性 `commitSessionTransition`。
    - 历史记录、`studyCount`、`lastStudied` 也随之在结束时落盘。
    - 需要保证 undo（`previous`）也走内存态回退，最终落盘结果一致。
2. **先更新内存再异步落盘（debounce / trailing flush）**
    - 立即更新内存态并发布 UI；持久化走防抖队列（如 800ms 无新提交后落盘一次）。
    - 在会话结束、页面 `visibilitychange` 隐藏、插件 `onunload` 时强制同步 flush。
3. **最小改动：只序列化变更的 deck**
    - `commitSessionTransition` 按 `transition.cardUpdates` 涉及的 deckId 分组，只重写受影响 deck；`buildStoredData` 支持局部覆盖。减少 stringify 体积，但每次仍有一次磁盘写。

**风险与验证**

- 崩溃/退出会丢失最近几次答题的持久化状态 —— 用 flush 时机兜底（见方案 2 的触发点）。
- 方案 1/2 会改变"答题即持久化"的时序，需保证 `npm test` 中所有会话状态机测试仍通过，并补新的落盘时机测试。
- 不能改变 FSRS 调度结果本身（`rateStudyCard` 纯函数不变）。

---

## P0-2　`getCard` 全库线性扫描

**涉及文件**

- `src/storage/dataStore.ts`：`getCard` / `findCardLocation`
- `src/sessions/sessionLifecycle.ts`：`buildSnapshot`（每次 `publish` 都查当前卡）

**现状**

- `getCard(deckId, cardId)` 先线性查 origin deck，再线性扫**所有** deck。
- `sessionLifecycle.publish()` 在每次答题 / 状态切换时都会调用 `buildSnapshot` → `getCard`，即每次 publish 都是 O(总卡数) 的查找。
- 与 P0-1 叠加：每答一张卡 = 一次全量扫描查找。

**方案**

- 维护 `cardId → { deckId, cardIndex }` 索引（`Map`），在 `commitSessionTransition` / continuity `commit` / `load` 等所有数据修改入口统一重建或增量更新。
- `getCard` 与 `findCardLocation` 走索引，命中失败再回退线性扫描（容错）。

**风险与验证**

- 索引与 decks 的一致性必须在所有写入入口维护（目前写入入口很少：`commitSessionTransition`、continuity `commit`、`load`/`loadSettings`）。
- 用现有 DataStore 测试 + 新增"索引一致性"测试验证。

---

## P0-3　`deckHome` 每次数据修订全量重建快照并扫描全卡

**涉及文件**

- `src/decks/deckHome.ts`：`publish()` → `buildSnapshot()` + `scheduleTimer()`
- `src/storage/dataStore.ts`：`publishRevision()`（每次答题提交后触发）

**现状**

- `DeckHome` 订阅了 `dataStore` 的 revision，因此**每次答题落盘**都会触发 `deckHome.publish()`：
    1. `buildSnapshot()` 对**每个** deck 重算 `getDeckStats()`（O(卡数)）和 `evaluateSpellingDeckEligibility()`（O(卡数)）；
    2. `scheduleTimer()` 再次遍历**所有** deck 的所有卡找"下一个到期时间"。
- 即使 home 视图当前不可见，快照也会被重建。

**方案**

- 快照按 `repository.getRevision()` 做惰性缓存：revision 未变则直接返回上次快照（`getSnapshot` 侧缓存，`publish` 只在 revision 变化时重建）。
- `getDeckStats` / `evaluateSpellingDeckEligibility` 按 (deckId, revision) 缓存。
- `scheduleTimer` 只在快照重建时计算 next-due；或维护"每个 deck 最小 due"缓存；或简化为：午夜定时器 + 快照重建时再精确调度。
- 会话进行中、home 不可见时，可考虑取消 deckHome 订阅（见 P1-5）。

**风险与验证**

- 必须保持"午夜翻页 / 到期后 home 数字自动刷新"的产品行为，现有 deckHome 测试需全绿，并补"revision 不变不重建"的测试。

---

## P1-4　打开视图时全量扫描 vault（冷启动最慢点）

**涉及文件**

- `src/obsidian/cardIdentityContinuityAdapters.ts`：`ObsidianContinuitySourceStore.list()`
- `src/identity/cardIdentityContinuity.ts`：`synchronizeNow()`
- `src/obsidian/FlashcardView.tsx`：`onOpen()` 先 `await deckHome.act({kind:"refresh"})` 再渲染

**现状**

- 打开插件视图时，UI 直到全量 sync 完成才渲染。
- `list()` **顺序** `await vault.read(file)` 读取 vault 中**所有** markdown 文件（含没有任何 flashcard 语法的文件）。
- 大 vault（数千 md 文件）下冷启动明显变慢；若还有新 deck 会逐文件写身份标记。

**方案**

1. `onOpen` 不再 `await` sync：先渲染 UI（带 loading / 已有缓存数据），后台执行 sync（已有 `refreshing` 状态与事件上报，可直接复用）。
2. `list()` 预过滤：用 `app.metadataCache.getFileCache(file)?.tags` 先筛出含 flashcard 相关 tag 的候选文件，只读候选文件；用 `vault.cachedRead()` 代替 `vault.read()`。
    - 无 metadataCache 结果时回退为全量读取，保证正确性。
3. 读取改为有界并发（如 8~16 个并行），避免串行 IO。

**风险与验证**

- metadataCache 可能未建立或过期 → 必须保留全量回退路径。
- sync 期间若来源文件变化（identity 写入），`replaceIfUnchanged` 已有 stale 保护，保持不动。
- 验证：大 vault 冷启动耗时；`npm test`（identity 相关测试）。

---

## P1-5　`FlashcardApp` 顶层订阅导致全树重渲染

**涉及文件**

- `src/ui/components/FlashcardApp.tsx`

**现状**

- 顶层同时订阅三个 store：`deckHomeSnapshot`、`lifecycleSnapshot`、`answerPresentationSnapshot`，任一发布都会让整棵树（所有 view 组件）重渲染。
- `const decks = dataStore.getAllDecks();` 在每次渲染时执行并生成新数组（打破子组件 memo）。
- 会话中每次答题（lifecycle + deckHome 双重发布）都会触发整树重渲染；部分视图组件（如 `CardView`、`PracticeView`、`SpellingView` 等）未用 `memo` 包裹。

**方案**

- `decks` 用 `useMemo` 按 revision 缓存，避免新数组身份。
- 检查并补齐视图组件的 `memo`（保持现有组件边界，不新增组件）。
- 细化订阅粒度：home 相关订阅只在其视图激活时存在；会话相关订阅只在会话视图激活时存在。
    - 注意：`lifecycleSnapshot` 上的"来源变化 → 结束会话"通知逻辑必须保留（它依赖顶层订阅，可保留或下沉）。

**风险与验证**

- 会话中"来源变化结束会话"行为不能丢；用 React DevTools Profiler 对比重渲染范围。

---

## P2-6　`cloneDecks` + `serializeDeck` 全量复制

- 与 P0-1 合并处理：去掉每次提交的全量深拷贝与全量序列化。
- 可改为只 clone / 只序列化变更的 deck；`fsrsCard` 对象本身可复用不可变引用（调度结果是新对象）。

---

## P2-7　音频缓存 IndexedDB 写放大

**涉及文件**

- `src/pronunciation/audioCache.ts`：`get` 每次写回 `lastAccess`；`put` 后 `evict()` 全表扫描+排序；`getUsageBytes()` 全表扫描

**现状**

- spelling 自动发音等场景下：每次命中缓存都触发一次写事务；每次写入都全表 `getAll` + 排序做淘汰；缓存用量查询也全表扫描。100MiB 上限下记录多时会明显拖慢。

**方案**

- `lastAccess` 更新先在内存累积，节流写回（如每 5s 或累计 N 次后再批量写）。
- 淘汰扫描降频：`put` 时先按内存维护的用量判断是否需要淘汰，需要时才全表扫。
- `getUsageBytes` 用内存维护值 + 惰性刷新，避免频繁全表查询。

**风险与验证**

- 淘汰正确性（LRU 语义）与缓存命中率不能退化；`src/pronunciation/__tests__/` 覆盖。

---

## P2-8　WordListView 行高测量引发 O(N²) 重算

**涉及文件**

- `src/ui/components/WordListView.tsx`：`handleMeasureRow` → `setRowHeights`
- `src/wordList/wordListPresentationModel.ts`：`buildVirtualWordRows`

**现状**

- 每行挂载即测量 → `setRowHeights` → `virtualRows`（O(N)）与 `visibleRows` 全量重算；大词库首次渲染时每行触发一次，整体接近 O(N²)。
- 每个 `rowHeights` 变更还会让所有已渲染行重渲染。

**方案**

- 用 `requestAnimationFrame` 合并同帧内的多次测量，一次 `setState`。
- 或仅初次进入时批量测量一次，之后按需增量更新。

**风险与验证**

- 行高测量精度与滚动位置保持；现有词表测试（presentation model 纯函数）不动。

---

## P2-9　MarkdownContent 每次渲染 `new Component()` 且不 unload

**涉及文件**

- `src/ui/components/MarkdownContent.tsx`；`FlashcardApp.renderMarkdown`

**现状**

- 每次渲染 Markdown 都 `new Component()`，渲染完成后既不 `load()` 也不 `unload()`，可能积累子组件注册（Obsidian `MarkdownRenderer.render` 会把子组件挂到该 Component 下）。
- 卡片频繁切换时长期运行会累积。

**方案**

- 复用单个 `Component` 实例（挂在视图生命周期上），卸载时 `unload()`。

**风险与验证**

- 低风险；需确认不影响 Markdown 渲染行为（渲染回调保持不变）。

---

## P2-10　`getCardsForDay` / `getDayList` 每次调用重新排序

**涉及文件**

- `src/storage/dataStore.ts`：`getCardsForDay` / `getDayList`

**现状**

- 每次调用都 `[...deck.cards].sort(...)`（O(N log N)）。study 设置页进入、切换 day 时多次调用。

**方案**

- 按 (deckId, revision) 缓存排序后的卡片数组；revision 变化时失效。

**风险与验证**

- 低；现有测试覆盖。

---

## 不建议做的事（保持产品行为不变）

- 不改变 FSRS 调度算法与序列化格式（`ts-fsrs` 卡片字段）。
- 不改变快捷键、间隔按钮、辣鸡（rating 5）行为。
- 不改变自动发音的时机与回退顺序（本地语音 → 缓存 → 在线）。
- 不引入新的运行时依赖；不重写组件架构（只做局部优化）。
- 不把手写源文件的身份标记逻辑挪出 `cardIdentityContinuity`。

---

## 分阶段实施建议

| 阶段     | 内容                                                                     | 预期收益                      |
| -------- | ------------------------------------------------------------------------ | ----------------------------- |
| 第一阶段 | P0-1（会话内累积/异步落盘）+ P0-2（卡片索引）+ P0-3（快照与定时器缓存）  | 消除每答卡顿、全库扫描        |
| 第二阶段 | P1-4（冷启动：先渲染后同步 + tag 预过滤 + 并发读取）+ P1-5（重渲染范围） | 大 vault 打开速度、会话流畅度 |
| 第三阶段 | P2-6 ~ P2-10（复制、音频缓存、词表测量、Markdown 组件、排序缓存）        | 长尾优化                      |

每个阶段独立可交付、可回退；先做基线测量，再按阶段实施并跑 `npm test` + `npm run build` + `npm run lint`。

---

## 待确认问题

1. 落盘时机：是否接受"答题后延迟落盘、结束时强制 flush"（方案 2），还是更倾向"会话结束一次性提交"（方案 1）？
2. 冷启动：是否接受"打开先显示缓存数据 + 后台同步"的交互变化（当前是先同步完再显示）？
3. 优化范围：只做第一阶段，还是一次性推进全部？

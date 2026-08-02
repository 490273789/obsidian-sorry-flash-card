# 性能优化实施记录

> 状态：**已全部实现并通过自动验证**（typecheck / 219 测试 / lint / build 全绿；本次源文件与文档格式通过，仓库全量 format 检查仅剩未改动的生成文件 `styles.css`）。
> 对应方案文档：`notes/performance-optimization-plan.md`（保留为历史方案与决策依据）。
> 本文档记录最终落地的改动、坚守的契约与验证结果，作为后续维护的依据。

---

## 一、最终方案决策（经用户确认）

| 议题       | 决策                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| 持久化策略 | **方案 A**：保留"每次答题原子提交"语义（`durable before visible`），但把成本局部化 —— 只克隆/只序列化受影响的 deck |
| 冷启动策略 | **先渲染后刷新**：视图打开立即渲染缓存快照，vault 扫描在后台执行                                                   |
| 推进方式   | **一次性全部推进**：P0–P2 全部 10 项一次完成                                                                       |

> 决策背景：原有"会话内累积 + 结束一次性提交"和"内存先行 + debounce"两种方案会改变
> `dataStore.test.ts` 与 `sessionLifecycle.test.ts` 中锁定的"持久化先于可见"契约，故放弃。

---

## 二、实施总览

| 编号        | 主题                                   | 主要文件                                                                                                                     | 核心机制                                            |
| ----------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| P0-1 + P2-6 | 答题全量落盘 / 全量复制序列化          | `src/storage/dataStore.ts`                                                                                                   | 局部克隆 + 序列化 WeakMap 缓存                      |
| P0-2        | `getCard` 全库线性扫描                 | `src/storage/dataStore.ts`                                                                                                   | `cardId → {deckId, cardIndex}` 索引                 |
| P0-3        | deckHome 快照全量重建                  | `src/decks/deckHome.ts`                                                                                                      | 按 deck 对象身份缓存 + `getNextDueTime()`           |
| P2-10       | `getCardsForDay`/`getDayList` 重复排序 | `src/storage/dataStore.ts`                                                                                                   | 索引序缓存数组 + 脏标记                             |
| P1-4        | 冷启动全量扫描 vault                   | `src/obsidian/cardIdentityContinuityAdapters.ts`、`src/identity/cardIdentityContinuity.ts`、`src/obsidian/FlashcardView.tsx` | tag 预过滤 + 并发读取 + 先渲染后刷新                |
| P1-5        | 顶层订阅导致全树重渲染                 | `src/ui/components/FlashcardApp.tsx` 及 11 个视图组件                                                                        | revision 订阅缓存派生数据 + `React.memo` + 稳定回调 |
| P2-7        | 音频缓存 IndexedDB 写放大              | `src/pronunciation/audioCache.ts`                                                                                            | lastAccess 节流批量写回 + 内存用量记账              |
| P2-8        | 词表行高测量 O(N²)                     | `src/ui/components/WordListView.tsx`                                                                                         | rAF 批量合并 `setRowHeights`                        |
| P2-9        | Markdown 每次 `new Component()`        | `src/ui/components/FlashcardApp.tsx`                                                                                         | 复用单例 Component + 卸载时 `unload()`              |

---

## 三、各项实施细节

### P0-1 + P2-6　持久化局部化（保持原子提交语义）

**改动**

- `commitSessionTransition()` 不再全量 `cloneDecks()`，改为 `cloneDecksForTransition(this.decks, transition)` —— 只克隆 `cardUpdates` 涉及 + `incrementStudyCountFor` 涉及的 deck；其余 deck 复用原引用（`fsrsCard` 对象本身不可变复用）。
- 新增 `serializedDeckCache: WeakMap<Deck, SerializedDeck>`，`buildStoredData()` 经 `getSerializedDeck(deck)` 复用未变 deck 的序列化结果（以 deck 对象身份为 key，天然随克隆失效）。
- 提交后增量维护派生状态：`sortedCardsDirty.add(deckId)` + `refreshDeckMinDue(deckId, nextDecks)`。

**收益**

- 每次答题从"全库深拷贝 + 全库序列化"降为"仅变更 deck"；磁盘写仍为一次（语义不变）。

**坚守的契约**

- 每次 rating 仍 1 次原子提交；`saveData` 失败时内存态（revision / getDeck / getCard / getSpellingProgress / listener 通知）不变。

### P0-2　卡片索引

**改动**

- 新增 `cardIndex: Map<cardId, { deckId, cardIndex }>`，在 `refreshDerivedState()`（`load` / `loadSettings` / continuity `commit` 后）统一重建。
- `getCard(deckId, cardId)`：先查 origin deck 线性位，再走 `cardIndex` 定位，最后保留全量线性扫描兜底。
- `findCardLocation` 新增可选第 4 参 `cardIndex`，`commitSessionTransition` 传入。

**收益**

- 会话每次 `publish()` 的 `getCard` 从 O(总卡数) 降为 O(1)（索引命中）。

### P0-3　deckHome 快照 / 统计 / 定时器缓存

**改动**

- 新增 `deckStatsCache` 与 `deckEligibilityCache`：均按稳定的 deck 对象身份缓存，只有内容真正变化的 deck 会失效；`publish(true)`（强制刷新，如到期定时器）时清空。
- `scheduleTimer()` 不再遍历全库卡找下一个到期时间，改用 `repository.getNextDueTime(now)`。
- `DeckHomeRepository` 接口新增 `getNextDueTime(now: Date): number | null`，由 `DataStore` 实现（内部缓存每 deck 排序后的非新卡 due 时间，并二分查找严格晚于 `now` 的首项）。

**收益**

- 每次答题触发的 revision 变更不再全 deck 重算统计/资格；定时器调度从 O(全卡) 降为 O(deck 数)。

**坚守的契约**

- `getSnapshot()` 在 revision 不变时返回同一对象引用（`deckHome.test.ts` 断言）。

### P2-10　排序缓存

**改动**

- 新增 `sortedCardsCache: Map<deckId, FlashCard[]>`（索引序缓存）+ `sortedCardsDirty: Set<deckId>`（提交/替换后标记）。
- `getDayList()` / `getCardsForDay()` 复用 `getSortedCards(deckId)`，避免每次调用 `sort()`。

### P1-4　冷启动：先渲染后刷新 + tag 预过滤 + 并发读取

**改动（接口层）**

- `ContinuitySourceStore.list()` 签名改为 `list(configuredTags?: string[])`。
- `cardIdentityContinuity.ts` 的 4 个入口（`synchronizeNow` / `changeNow` / `resolveNow` / `resolveRepair`）重构为：先 `state.load()` 取 `configuredTags`，再 `sources.list(currentState.configuredTags)`；journal 恢复后二次拉取同样传 tag。

**改动（适配器层，`cardIdentityContinuityAdapters.ts`）**

- `createObsidianContinuitySourceStore(vault)` 改为接收 `app: App`（`main.ts` 同步改为传 `this.app`），以便访问 `app.metadataCache`。
- `list()`：
    - 用 `app.metadataCache.getFileCache(file)?.tags` 预过滤候选文件（与配置 tag 大小写不敏感匹配）；无配置 tag、无 metadataCache 或 cache 缺失时**保留该文件**（正确性兜底）。
    - 配置 tag 候选读取保持 **`vault.read`（未缓存读）**；其他带 tag 文件只用 `cachedRead` 发现可添加的闪卡 tag，并标记为非权威内容，绝不参与迁移、修复或题库构建。
    - 有界并发（`LIST_CONCURRENCY = 16`）替代串行读取。

**改动（视图层，`FlashcardView.tsx`）**

- `onOpen()` 先 `createRoot` + `renderApp()`，随后 `void this.deckHome.act({ kind: "refresh" })` 后台执行；UI 已有 `mutation.kind === "refreshing"` 状态呈现。

**坚守的契约**

- `cardIdentityContinuityAdapters.test.ts` 断言 `list()` 必须用 **`vault.read`（未缓存读）**：迁移预览要与 `replaceIfUnchanged` 中 `vault.process` 读到的磁盘内容一致，改用 `cachedRead` 会因缓存陈旧导致 `stale` 误判。

### P1-5　顶层渲染优化

**改动（`FlashcardApp.tsx`）**

- 新增 `useSyncExternalStore` 订阅 `dataStore` revision；`decks`、`studyHistory`、`spellingSetupStats` 用 `useMemo` 按 revision 缓存。
- Markdown 渲染改为复用单个 `Component` 实例（`markdownComponentRef`），卸载时 `unload()`（P2-9 同处落地）。
- 稳定化传给子组件的回调（`handleSessionComplete`、`handleExitStudy/Practice/Spelling`、`handleStudyStart`、`handlePracticeStart`、`handleWordListBack` 等），使 memo 真正生效。
- 保留"来源变化 → 结束会话"的顶层 `useEffect` 通知逻辑。

**改动（视图组件 memo）**

- 为以下组件包裹 `React.memo`：`CardView`、`PracticeView`、`SpellingView`、`StudySetup`、`PracticeSetup`、`SpellingSetup`、`StatsView`、`WordListView`、`PracticeSummary`、`SpellingSummary`、`DeckList`。

**收益**

- 会话中答题引发的全树重渲染被裁剪：无关子树（如 home/设置弹层）不再重渲染，Markdown 渲染不再每次分配 Component。

### P2-7　音频缓存写放大

**改动（`audioCache.ts`）**

- `MemoryPronunciationAudioCache`：维护 `usageBytes` 增量记账，`getUsageBytes()` 直接返回，不再每次全量 reduce。
- `IndexedDbPronunciationAudioCache`：
    - 首次写入前惰性同步已有 IndexedDB 记录大小，并维护 key → size 记账，覆盖同 key 时只计算大小差值。
    - `get()` 命中后 `lastAccess` 不再立即写库：累积到 `pendingTouches`，经 `setTimeout`（`TOUCH_FLUSH_INTERVAL_MS = 5000`）用 `touchRecords()` 单事务批量写回。
    - `put()` 仅在内存记账 `memoryUsageBytes > limitBytes` 时才触发全表 `evict()`（evict 内以真实全表用量校准记账）。
    - `getUsageBytes()` 走 `usageSynced` 惰性内存值，避免频繁全表查询。
    - `clear()` 同时清空 pending touches 与记账。

**收益**

- 命中缓存的自动发音不再每次开写事务；写盘、淘汰扫描、用量查询三条热路径均降频。

**风险提示**

- `lastAccess` 批量写回是尽力而为：flush 失败只影响 LRU 淘汰顺序的时效，不影响播放正确性。

### P2-8　词表行高测量批量合并

**改动（`WordListView.tsx`）**

- `handleMeasureRow` 不再逐行 `setRowHeights`：测量值先累积到 `pendingRowHeightsRef`，同一动画帧内的多次测量合并为一次 `requestAnimationFrame` → 单次 `setState`。
- 组件卸载时 `cancelAnimationFrame` 并清空累积。

**收益**

- 大词库首屏滚动从"每行一次 O(N) 虚拟行重算"（整体 O(N²)）降为每帧一次。

### P2-9　复用 Markdown Component

- 见 P1-5：`FlashcardApp` 用 `markdownComponentRef` 持有一个 `Component`，`renderMarkdown` 复用它，卸载时 `unload()`，不再每次 `new Component()` 且不释放。

---

## 四、实施中确认并坚守的契约（勿破坏）

1. **持久化先于可见（durable before visible）**：`dataStore.test.ts` 断言 `plugin.saveData` 失败时内存态不变。任何后续优化不得改为"先更新内存再异步落盘"。
2. **提交次数锁定**：`sessionLifecycle.test.ts` 断言 study 每 rating 1 次提交、spelling 每 retrieval 1 次提交。不得改为会话结束统一提交。
3. **快照同一引用**：`deckHome.test.ts` 断言 revision 不变时 `getSnapshot()` 返回同一对象。缓存必须按 revision 键控。
4. **迁移预览用未缓存读**：`cardIdentityContinuityAdapters.test.ts` 断言 `list()` 用 `vault.read`（与 `replaceIfUnchanged` 的 `vault.process` 磁盘读一致）。
5. **metadataCache 预过滤必须保留全量兜底**：cache 缺失/无 tags/未配置 tag 时不得丢文件。
6. **来源变化结束会话**：`FlashcardApp` 顶层基于 `lifecycleSnapshot` 的通知逻辑必须保留。
7. **复用 Component 必须卸载**：单例 `Component` 在视图关闭/组件卸载时 `unload()`，避免子组件注册累积。

---

## 五、自动验证结果

| 命令                                      | 结果                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm typecheck`（tsc --noEmit）          | ✅ 通过                                                                         |
| `pnpm test`（Vitest，30 文件 / 219 用例） | ✅ 全绿                                                                         |
| `pnpm lint`（typecheck + oxlint）         | ✅ 无错误（仅因风格移除 2 个未用参数、1 处 `new Array`、3 处 useMemo 依赖告警） |
| 本次改动文件 `oxfmt --check`              | ✅ 通过                                                                         |
| `pnpm run format:check`                   | ⚠️ 仅未改动的生成文件 `styles.css` 未通过；按仓库规则未手工修改                 |
| `pnpm build`（vite 生产构建）             | ✅ 通过（main.js 514.39 kB / styles.css 131.83 kB）                             |

---

## 六、遗留人工验证（需在 Obsidian 内进行）

以下项无法在自动化环境执行，建议按清单在真实 vault 中确认：

- [ ] 冷启动：点击 ribbon 后是否立即出现首页（带刷新态），大 vault 下不再长时间白屏。
- [ ] 连续答题 20+ 张：单卡切换无明显卡顿，进度/统计正确。
- [ ] 拼写自动发音：本地语音 / 缓存音频 / 在线兜底三条路径各自可出声。
- [ ] 到期数字：午夜翻页与到期后首页数字自动刷新仍生效（P0-3 定时器行为）。
- [ ] 卡片编辑/删除：迁移预览、`replaceIfUnchanged` 写入身份标记正常（P1-4 未缓存读路径）。
- [ ] 词表视图：大词库滚动流畅，行高测量正常，无跳动（P2-8）。
- [ ] 设置页不为空白（AGENTS.md 兼容性要求，本次未触碰 `settingsTab.ts`）。

---

## 七、回滚提示

- 核心改动集中在 `dataStore.ts`、`deckHome.ts`、`cardIdentityContinuity.ts`、`cardIdentityContinuityAdapters.ts`、`FlashcardView.tsx`、`FlashcardApp.tsx`、`audioCache.ts`、`WordListView.tsx` 及对应聚焦测试；其余 UI 文件仅增加 `React.memo` 包装。`main.js` / `styles.css` 为构建产物。
- 若需回退，可整体 revert 以下文件：`dataStore.ts`、`deckHome.ts`、`cardIdentityContinuity.ts`、`cardIdentityContinuityAdapters.ts`、`FlashcardView.tsx`、`FlashcardApp.tsx`、`audioCache.ts`、`WordListView.tsx`、`deckHome.test.ts`（新增 `getNextDueTime` mock 方法）。

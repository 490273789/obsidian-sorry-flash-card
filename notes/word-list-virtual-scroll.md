# 单词列表虚拟滚动实现说明

本文档记录 `src/components/WordListView.tsx` 中单词列表虚拟滚动的实现逻辑，方便后续维护和学习。

## 背景问题

单词列表原本直接对 `items.map(...)` 渲染所有卡片行。数据量少时问题不明显，但卡片数量变多后，会同时创建大量 DOM 节点：

- 每一行包含第一列和第二列内容。
- 前两列都有点击、键盘事件和遮盖状态判断。
- 第三列内容不参与行内渲染，双击第一列或第二列时通过弹窗展示。
- 行内容可能换行，布局计算成本较高。
- 即使使用 `content-visibility: auto`，DOM 节点仍然已经创建，React 首次渲染和状态更新仍会变重。

虚拟滚动的目标是：列表数据仍然完整存在内存中，但 DOM 只渲染当前视口附近的少量行。

## 核心思路

当前实现采用手写虚拟列表，没有新增依赖。整体流程是：

1. 根据所有 `items` 生成每一行的虚拟布局信息。
2. 监听滚动容器的 `scrollTop` 和高度。
3. 用二分查找算出当前视口应该显示哪些行。
4. 只渲染这些可见行和少量缓冲行。
5. 用一个总高度容器撑开滚动条。
6. 用 `transform: translateY(...)` 把真实渲染的行放到正确位置。

简化后可以理解为：

```tsx
const virtualRows = getVirtualWordRows(items, rowHeights, rowGap);
const visibleRows = virtualRows.rows.slice(startIndex, endIndex + 1);

return (
	<div className="scroll">
		<div style={{ height: virtualRows.totalHeight }}>
			{visibleRows.map((row) => (
				<div style={{ transform: `translateY(${row.top}px)` }}>
					<WordRow item={row.item} />
				</div>
			))}
		</div>
	</div>
);
```

## 关键常量

```ts
const DEFAULT_WORD_ROW_HEIGHT = 118;
const DEFAULT_WORD_ROW_GAP = 12;
const WORD_LIST_OVERSCAN_ROWS = 8;
```

- `DEFAULT_WORD_ROW_HEIGHT`：行还没有被真实测量前，先按 118px 估算。
- `DEFAULT_WORD_ROW_GAP`：行间距的默认估算值，对应 CSS 中的 `var(--fc-space-3)`。
- `WORD_LIST_OVERSCAN_ROWS`：视口上下额外多渲染 8 行，避免快速滚动时出现空白。

## 虚拟行数据结构

```ts
interface WordRowLayout {
	item: WordItem;
	index: number;
	top: number;
	height: number;
}

interface VirtualWordRows {
	rows: WordRowLayout[];
	totalHeight: number;
}
```

每一行会被转换成一条布局记录：

- `item`：原始单词数据。
- `index`：它在当前列表中的位置。
- `top`：这一行距离列表顶部的偏移。
- `height`：这一行的高度。

`totalHeight` 是所有行高度和间距的总和，用来撑开滚动区域。这样即使 DOM 中只存在十几行，滚动条仍然像完整列表一样工作。

## 布局计算

`getVirtualWordRows()` 会从头到尾计算每行的位置：

```ts
function getVirtualWordRows(
	items: WordItem[],
	rowHeights: ReadonlyMap<string, number>,
	rowGap: number,
): VirtualWordRows {
	let offsetTop = 0;
	const rows = items.map((item, index) => {
		const height = rowHeights.get(item.id) ?? DEFAULT_WORD_ROW_HEIGHT;
		const row = {
			item,
			index,
			top: offsetTop,
			height,
		};
		offsetTop += height + rowGap;
		return row;
	});

	return {
		rows,
		totalHeight: Math.max(0, offsetTop - rowGap),
	};
}
```

这里的关键点是 `rowHeights`：

- 如果某一行已经渲染并测量过，就用真实高度。
- 如果还没有渲染过，就用默认高度。

这样可以同时支持性能优化和可变高度内容。

## 如何找到可见行

虚拟滚动需要回答两个问题：

1. 当前视口顶部附近的第一行是谁？
2. 当前视口底部附近的最后一行是谁？

因为 `rows` 已经按 `top` 从小到大排好，可以用二分查找，不需要每次滚动都遍历整个列表。

```ts
const startIndex = findFirstVisibleIndex(
	virtualRows.rows,
	viewport.scrollTop - overscanPixels,
);

const endIndex = findLastVisibleIndex(
	virtualRows.rows,
	viewport.scrollTop + viewport.height + overscanPixels,
);
```

`overscanPixels` 是缓冲区高度：

```ts
const overscanPixels =
	(DEFAULT_WORD_ROW_HEIGHT + rowGap) * WORD_LIST_OVERSCAN_ROWS;
```

如果没有 overscan，用户快速滚动时，新行可能来不及渲染，容易看到短暂空白。多渲染一点视口外的行，可以让滚动更稳定。

## 滚动状态更新

组件用 `scrollRef` 指向滚动容器：

```tsx
<div className="flashcard-word-list-scroll" ref={scrollRef}>
```

`useLayoutEffect()` 中监听滚动：

```ts
scrollEl.addEventListener("scroll", updateViewport, { passive: true });
```

这里使用了两个优化点：

- `passive: true`：告诉浏览器滚动监听不会阻止默认滚动，降低滚动线程压力。
- `requestAnimationFrame`：把多次连续 scroll 事件合并到下一帧更新，避免滚动时过于频繁地 `setState`。

`viewport` 保存三个值：

```ts
const [viewport, setViewport] = useState({
	scrollTop: 0,
	height: DEFAULT_WORD_ROW_HEIGHT * 10,
	width: 0,
});
```

- `scrollTop`：当前滚动位置。
- `height`：滚动容器高度。
- `width`：滚动容器宽度。

宽度也要记录，因为 Obsidian 面板宽度变化或移动端布局切换时，文本换行会改变行高。

## 可变高度测量

单词内容可能很长，两列布局在窄屏下也会换行，所以不能假设每行永远是 118px。第三列内容通过弹窗展示，不参与列表行高测量。

当前实现给每个实际渲染出来的行包一层 frame，并在 ref 回调中测量：

```tsx
<div
	key={row.item.id}
	ref={(element) => handleMeasureRow(row.item.id, element)}
	className="flashcard-word-row-frame"
	style={{
		transform: `translateY(${row.top}px)`,
	}}
>
	<WordRow item={row.item} />
</div>
```

测量逻辑：

```ts
const measuredHeight = element.getBoundingClientRect().height;
```

如果测量高度和缓存高度差异超过 1px，就更新 `rowHeights`：

```ts
setRowHeights((prev) => {
	const currentHeight = prev.get(itemId);
	if (
		currentHeight !== undefined &&
		Math.abs(currentHeight - measuredHeight) <= 1
	) {
		return prev;
	}
	const next = new Map(prev);
	next.set(itemId, measuredHeight);
	return next;
});
```

这个 1px 阈值用于避免因为小数像素或浏览器舍入造成反复更新。

## 容器尺寸变化

实现里使用了 `ResizeObserver` 监听滚动容器尺寸：

```ts
const resizeObserver = new ResizeObserver(updateViewport);
resizeObserver.observe(scrollEl);
```

当宽度变化时，清空行高缓存：

```ts
useEffect(() => {
	setRowHeights(new Map());
}, [viewport.width]);
```

原因是宽度变化会影响换行，旧高度可能不再准确。清空后，当前可见行会重新测量，后续滚动到的行也会逐步更新真实高度。

## CSS 配合

虚拟列表的 CSS 关键点在 `styles.css`：

```css
.flashcard-word-list-virtual {
	position: relative;
	display: block;
	gap: var(--fc-space-3);
	padding-bottom: var(--fc-space-2);
}

.flashcard-word-row-frame {
	position: absolute;
	top: 0;
	right: 0;
	left: 0;
	will-change: transform;
}
```

容器设置 `position: relative`，每一行 frame 用 `position: absolute`，再通过 `transform` 放到对应高度。

同时关闭虚拟滚动中新挂载行的入场动画：

```css
.flashcard-word-list-virtualized .flashcard-word-row {
	animation: none;
}
```

如果不关掉，滚动时行不断挂载卸载，会反复触发入场动画，视觉上会抖，也会增加滚动时的渲染成本。

## 和遮盖、乱序、第三列弹窗的关系

虚拟滚动只改变“渲染哪些行”，不改变列表数据本身。

- `items` 仍然来自 `shuffledItems ?? sourceItems`。
- shuffle 按钮仍然切换 `shuffledItems`。
- 遮盖状态仍然按前两列保存在 `maskedColumns`。
- 单行点击揭开仍然保存在 `revealedIdsByColumn`。
- 第三列说明内容仍然保存在 `item.explanation`，但不作为列表列渲染。
- 双击第一列或第二列时，只把当前 `WordItem` 放入 `activeExplanationItem`，由弹窗读取 `item.explanation` 展示。

所以虚拟滚动不会改变业务逻辑，只改变 DOM 挂载数量。

当数据源变化时，会重置这些和行位置相关的状态：

```ts
useEffect(() => {
	setShuffledItems(null);
	setRevealedIdsByColumn({
		front: new Set(),
		back: new Set(),
		explanation: new Set(),
	});
	setRowHeights(new Map());
}, [sourceItems]);
```

## 为什么没有引入虚拟列表库

这次需求的场景比较窄：

- 只有一个页面需要长列表优化。
- 列表结构简单。
- 已经有固定的滚动容器。
- 只需要支持可变高度和响应式宽度变化。

因此手写实现可以保持依赖不变，也能避免把 Obsidian 插件 bundle 变大。后续如果多个页面都需要复杂虚拟列表，再考虑抽出通用 hook 或引入成熟库。

## 后续维护注意事项

1. 如果调整 `.flashcard-word-row` 的默认高度，记得同步检查 `DEFAULT_WORD_ROW_HEIGHT`。
2. 如果调整列表行间距，确认 `DEFAULT_WORD_ROW_GAP` 是否仍接近 CSS 的 `gap`。
3. 如果行内内容从普通文本改成 Markdown 渲染，行高更容易变化，要重点检查 `handleMeasureRow()` 是否能及时更新。
4. 如果新增筛选、搜索或排序，数据变化后应清空 `rowHeights`，避免旧高度映射到新的行顺序。
5. 如果发现滚动时空白，优先调大 `WORD_LIST_OVERSCAN_ROWS`。
6. 如果发现滚动时渲染太多行，优先调小 `WORD_LIST_OVERSCAN_ROWS`。

## 调试方法

可以临时在渲染区显示数量：

```tsx
{visibleRows.length} / {items.length}
```

正常情况下：

- `items.length` 是完整数据量。
- `visibleRows.length` 应该只比屏幕能看到的行数多一点。

如果 `visibleRows.length` 接近 `items.length`，说明虚拟窗口计算或容器高度读取有问题。

# 闪卡 UI 规范

插件保留当前低饱和、舒适紧凑的风格。界面直接继承 Obsidian 的系统主题与强调色；颜色用于表达操作层级和状态，不用于装饰无语义的数据。普通层级依靠背景、边框和留白建立，阴影只用于菜单、弹窗等真正离开文档流的浮层。

`index.css` 是 `src/obsidian/main.ts` 引入的唯一 CSS 入口。Vite 会跟随它的导入并生成 Obsidian 使用的根目录 `styles.css`。不要手工编辑根目录 `styles.css`，应运行 `npm run build` 重新生成。

## 文件结构

保持以下导入顺序：

- `base.css`：设计 token、根容器、共享工具类和动效变量。
- `buttons.css`：共享按钮基础样式和评分按钮元数据。
- `controls.css`：按钮尺寸/语义变体、输入框、下拉框与菜单组件。
- `home.css`：页面框架、公共标题栏、首页牌组列表和共享统计卡。
- `study.css`：学习/刷题设置、活动卡片会话、底部操作区和完成状态。
- `word-list.css`：单词列表工具栏、虚拟列表行和解释面板。
- `practice-summary.css`：刷题结果和错题列表。
- `stats.css`：历史与统计视图。
- `overlays-settings.css`：空状态、弹窗、牌组/卡片编辑器和设置页。
- `motion.css`：焦点、滚动条、关键帧和减少动态效果规则。
- `responsive.css`：窄窗口和移动端布局覆盖。

## Token 使用规则

### 字体

- 字号只使用 `--fc-font-xs/sm/md/lg/xl/display`，分别为 12、14、16、18、22、28px。
- 控件默认使用 `--fc-font-sm`，正文使用 `--fc-font-md`，桌面卡片阅读内容使用 `--fc-font-lg`。
- 辅助文字不得小于 `--fc-font-xs`；窄屏阅读内容可降为 `--fc-font-md`，不得继续缩小。
- 字重只使用 `--fc-weight-regular/medium/semibold/bold`。
- 紧凑标签使用 `--fc-line-tight`，普通正文使用 `--fc-line-body`，长文和 Markdown 内容使用 `--fc-line-reading`。

### 间距与尺寸

- 间距只使用 `--fc-space-half` 和 `--fc-space-1` 至 `--fc-space-6`，对应 2、4、8、12、16、20、24px。
- 内联元素间距使用 4–8px，控件内边距默认 8px × 12px，卡片内边距使用 12–16px，区块间距使用 16px，弹窗大区块使用 20px。
- 标准桌面控件高度为 `--fc-control-md`（36px）；`--fc-control-sm`（32px）仅用于紧凑的图标或嵌入式控件。
- `--fc-control-touch`（44px）是移动端和粗指针设备最小点击目标，不能被更具体的响应式规则缩小。

### 圆角、边框与层级

- 标签：`--fc-radius-xs`（6px）。
- 控件和列表项：`--fc-radius-sm`（10px）。
- 卡片和面板：`--fc-radius-md`（14px）。
- 大型弹窗：`--fc-radius-lg`（18px）。
- 胶囊：`--fc-radius-pill`。
- 普通边框统一为 1px；当前项、问答卡等状态强调边可使用 3px。
- `--fc-surface-canvas`：页面画布，继承 `--background-secondary`。
- `--fc-surface-section`：页面内的大区块，位于画布与卡片之间。
- `--fc-surface-card`：主要内容卡片，继承 `--background-primary`。
- `--fc-surface-raised`：菜单等悬浮表面，仅与 `--fc-shadow-popover` 配套使用。
- `--fc-surface-control`：按钮等可交互控件表面，继承 `--interactive-normal`。
- 静态卡片和普通按钮不使用阴影；菜单使用 `--fc-shadow-popover`，大型弹窗使用 `--fc-shadow-overlay`，键盘焦点使用 `--fc-focus-ring`。组件不得重新发明同层级阴影或焦点环。

### 颜色

- 表面必须从 `--fc-surface-canvas/section/card/raised/control` 派生。
- 语义色使用 `--fc-primary`（青）、`--fc-secondary`（紫）、`--fc-success`（绿）、`--fc-warning`（琥珀）、`--fc-danger`（红）、`--fc-info`（蓝）。旧的 `--fc-cyan` 等变量保留为兼容和调色别名。
- 普通文字使用 `--fc-text`，次要信息使用 `--fc-muted`，弱提示使用 `--fc-faint`。不得通过随机彩色文字区分无状态含义的数据。
- 首页学习与刷题主操作分别使用 `--fc-action-study-*` 和 `--fc-action-practice-*`；其他按钮默认保持中性，仅在激活、危险或明确状态时使用语义色。
- 暗色和亮色主题的普通文字对背景需达到 WCAG AA 4.5:1；新增配色时应扩充 `designSystem.test.ts` 的对比度断言。

## 组件规则

- 按钮、输入框、选择框统一继承共享控件高度、字号、圆角和焦点样式。
- 标题栏、统计条、列表行和设置项使用中性表面；状态信息可通过单一语义色的文字、图标或 3px 强调边表达。
- 卡片阅读内容保持 18px/1.65；工具栏、计数和快捷键信息不得抢过正文层级。
- 单词列表工具栏未激活时必须为中性，激活后才显示洗牌、正面或背面的状态色。
- 弹窗使用 16px 圆角、20px 大区块间距和统一遮罩/阴影；确认、卡片编辑和解释弹窗不得各自定义一套密度。
- 动效时长从 `--fc-motion-*` 和 `--fc-transition-*` 取值，并尊重 `prefers-reduced-motion`。

## 响应式与主题

- 900px 以下允许折叠栏位和重排工具栏，但不缩小基础字号。
- 640px 以下阅读内容改为 16px，交互目标统一至少 44px；布局可以堆叠，信息层级保持不变。
- `@media (pointer: coarse)` 是点击目标的最终兜底，不应被组件规则覆盖。
- 亮色与暗色主题默认都直接继承 Obsidian token。只有透明度或对比度确实无法自动适配时，才添加极少量 `.theme-light` 光学修正，禁止维护一套固定色值的独立亮色主题。

## 允许的例外与自动检查

- 1px 普通边框、3px 状态强调边、绝对定位、图标绘制、阴影和背景纹理可使用必要的像素值；它们不参与内容密度刻度。
- 旧版兼容选择器可以保留，但不能引入新的字号、间距、圆角或颜色体系。
- `src/styles/__tests__/designSystem.test.ts` 会检查所有 `--fc-*` 引用均已声明，且 `font-size`、`border-radius`、`gap` 和非零 `padding` 不出现散落像素值，并验证核心配色对比度。
- 修改样式后至少运行 `npm test` 和 `npm run build`；较大范围修改还应运行 `npm run lint` 与 `npm run format:check`。

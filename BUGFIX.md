# Bug 修复：设置无法持久化保存

## 问题描述

用户在设置页面更改设置并保存后，关闭并重新打开 Obsidian 时，所有设置都会被初始化（重置为默认值）。

## 根本原因

在 `main.ts` 的 `saveSettings()` 方法中，直接调用 `this.saveData(this.settings)` 会**覆盖整个 `data.json` 文件**，导致：

1. 只保存了 settings 对象
2. 丢失了 decks 数据（题库和学习进度）
3. 当 DataStore 稍后保存数据时，又会覆盖设置

这造成了数据冲突和不一致。

## 解决方案

修改了保存逻辑，确保所有保存操作通过 DataStore 统一管理：

### 修改的文件

#### 1. `src/main.ts`

- **修改 `saveSettings()` 方法**：通过 `dataStore.saveSettings()` 保存设置，而不是直接调用 `this.saveData()`
- **修改 `loadSettings()` 方法**：支持从新的 StoredData 格式中加载设置，同时保持向后兼容旧格式

#### 2. `src/dataStore.ts`

- **导出 `StoredData` 接口**：使其可以在 main.ts 中使用
- **更新 `updateSettings()` 注释**：明确说明该方法不保存到磁盘

## 数据结构

修复后，`data.json` 的结构为：

```json
{
	"decks": {
		"deck-id": {
			/* deck data */
		}
	},
	"lastSync": "2026-02-04T...",
	"settings": {
		"flashcardTags": ["#wordTag"],
		"dailyNewCards": 20,
		"dailyReviewCards": 100,
		"studyOrder": "random",
		"fsrsParameters": {
			"requestRetention": 0.9,
			"maximumInterval": 365
		},
		"welcomeMessage": "欢迎靓仔来到修仙联盟！🎉",
		"showWelcomeMessage": true
	}
}
```

## 测试步骤

1. 打开 Obsidian 并启用插件
2. 打开闪卡学习 → 设置
3. 修改任意设置（如：每日新卡数量改为 30）
4. 点击"保存设置"
5. 关闭 Obsidian
6. 重新打开 Obsidian
7. 再次打开闪卡学习 → 设置
8. **验证**：设置应该保持为修改后的值（如：每日新卡数量为 30）

## 预期结果

- ✅ 设置能够持久化保存
- ✅ 关闭并重新打开 Obsidian 后，设置不会重置
- ✅ decks 数据（题库和学习进度）不会丢失
- ✅ 所有数据统一管理在 data.json 中

## 技术细节

- 使用 Obsidian 的 `Plugin.loadData()` 和 `Plugin.saveData()` API
- 通过 DataStore 集中管理所有持久化操作
- 保持向后兼容旧的数据格式（自动迁移）

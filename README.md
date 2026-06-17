# WSR 闪卡学习 (WSR Flash Card)

一个基于 FSRS 算法的 Obsidian 闪卡学习插件，帮助你高效学习和复习知识点。

## ✨ 功能特性

- 🏷️ **自定义标签扫描** - 自动扫描带有指定标签的文件作为题库
- 📚 **多题库管理** - 每个文件对应一个题库，方便分类管理
- 🧠 **FSRS 算法** - 采用先进的 FSRS6 间隔重复算法，科学安排复习计划
- ⌨️ **快捷键支持** - 完整的键盘快捷键，提升学习效率
- 📱 **移动端兼容** - 支持桌面端和移动端使用
- 🎨 **优美界面** - 平滑动画过渡，优雅的用户体验

## 📝 卡片格式

在 Markdown 文件中使用以下格式创建闪卡：

```markdown
#wordTag

## science

??
n. 科学；自然科学；理科
::
/ˈsaɪəns/
root: sci- = know 知道

The study of science has made great progress in recent years.
近年来科学研究取得了巨大进展。
;;

## apple

??
n. 苹果
;;
```

### 格式说明

- 文件开头需要有一个标签（如 `#wordTag`），用于标识这是一个闪卡题库
- `??` 上方是正面，下方是背面，标记需要独占一行
- `::` 后面是解释内容，解释可选；没有解释时可以省略 `::`
- `;;` 是单张卡片的结束标记，必须独占一行
- 正面、背面和解释都支持完整的 Markdown 语法
- 正常模式会用正面出题、背面作答；反转模式会用背面出题、正面作答，解释始终跟随答案显示

## ⌨️ 快捷键

| 快捷键 | 功能                    |
| ------ | ----------------------- |
| `空格` | 显示答案 / 选择"良好"   |
| `1`    | 重来（1分钟后再次出现） |
| `2`    | 困难（1天后复习）       |
| `3`    | 良好（3天后复习）       |
| `4`    | 简单（10天后复习）      |
| `5`    | 辣鸡（21天后复习）      |
| `6`    | 上一题                  |

## ⚙️ 设置选项

- **闪卡标签** - 设置要扫描的标签（默认 `#wordTag`）
- **每日新卡数量** - 每天学习的新卡片最大数量
- **每日复习数量** - 每天复习的卡片最大数量
- **学习顺序** - 顺序学习或乱序学习
- **FSRS 参数** - 可调整目标记忆保持率和最大复习间隔

## 🚀 使用方法

1. 安装并启用插件
2. 创建一个 Markdown 文件，按上述格式添加闪卡内容
3. 点击左侧栏的闪卡图标，或使用命令面板打开"闪卡学习"
4. 点击刷新按钮扫描题库
5. 选择一个题库开始学习

## 🔧 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建生产版本
npm run build
```

## 📄 许可证

0-BSD

## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
	"fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
	"fundingUrl": {
		"Buy Me a Coffee": "https://buymeacoffee.com",
		"GitHub Sponsor": "https://github.com/sponsors",
		"Patreon": "https://www.patreon.com/"
	}
}
```

## API Documentation

See https://docs.obsidian.md

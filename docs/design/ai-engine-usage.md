# 插件内部 AI 服务调用

`FlashcardPlugin.aiService` 是插件生命周期内共享的 AI 服务。新功能通过构造参数接收 `AiService`，不要自行读取 API Key、保存 AI 配置或构造厂商请求。公共类型从 `src/ai/index.ts` 导入。

## 设置与模型

在插件设置的「AI 引擎」中新增配置，填写名称、厂商、Base URL、Obsidian 密钥引用与模型 ID，点击「保存配置」。随后可设置全局默认引擎，或点击「测试连接」。测试会发起一条文本请求，可能产生费用。

- DeepSeek 和有道提供预填连接地址；阿里云百炼需要填写账号实际使用的地域、业务空间和兼容接口地址。
- Base URL 不包含 `/chat/completions`，可以配置自有兼容网关；选择厂商不等于网关已经验证通过。
- 「加载模型列表」可以使用尚未保存的连接信息。DeepSeek 使用兼容模型列表；百炼的兼容地址对应原生分页目录。其他兼容网关尝试 `/models`，不支持或返回失败时使用手动输入。
- 模型目录是临时数据，不是可用性保证。已知文本模型不接受图片；手填且能力未知的模型允许尝试，由厂商判断。
- 删除配置不会删除共享的 Obsidian 密钥。删除默认配置会清空默认项；重命名保留配置 ID。

## 文本请求

```ts
import { AiError, type AiService } from "../../ai";

async function explain(ai: AiService, text: string, signal: AbortSignal) {
	try {
		const result = await ai.generate({
			// 不提供 configId 时使用全局默认配置。
			messages: [
				{ role: "system", text: "请用中文解释用户提供的内容。" },
				{ role: "user", text },
			],
			signal,
			timeoutMs: 120_000,
		});
		return result.text;
	} catch (error) {
		if (error instanceof AiError && error.code === "cancelled") return null;
		throw error; // 由功能的 Obsidian/UI 适配层展示本地化错误。
	}
}
```

每个功能若需要覆盖默认引擎，可以保存用户选择的稳定配置 ID，并传给 `generate({ configId, ... })`。显式指定的配置失效时返回 `config-not-found`，不会改用默认配置。

## 图片输入

```ts
const result = await ai.generate({
	configId: selectedVisionEngineId,
	messages: [
		{
			role: "user",
			text: "识别图片中的英文并翻译成中文。",
			images: [{ mimeType: "image/png", base64: encodedImageBytes }],
		},
	],
	signal: controller.signal,
});
```

`base64` 只包含编码后的图片字节，不包含 `data:` 前缀。支持 PNG、JPEG、WebP 和 GIF；是否接受某种格式、尺寸及图片数量由目标模型决定。调用方通过 Obsidian API 获取图片并完成编码，服务不读取笔记或任意 URL。图片只能附在 `user` 消息中。

## 配置接口

- `getSnapshot()` / `subscribe(listener)`：读取稳定的不可变配置与模型查询、测试状态；订阅返回清理函数。
- `saveConfig(input)`：新增时省略 `id`，返回生成的稳定 ID；更新时提供已存在的 ID。
- `setDefault(id | null)` / `deleteConfig(id)`：设置默认配置或删除配置。
- `listModels(config, options?)`：查询完整或未保存的连接配置，不要求已选择模型。返回模型 ID 和已知图片能力。
- `testConnection(id, options?)`：测试已保存配置。同配置的重复测试或模型查询返回 `busy`。

所有配置写入先持久化、再发布。进行中的生成使用启动时的配置和消息快照；新增请求才使用修改后的配置。密钥在发请求时从 SecretStorage 读取，不包含在快照、结果、错误或插件数据中。

## 结果与错误

`generate()` 返回 `{ text, configId, model, usage? }`，失败时抛出 `AiError`。`code` 区分缺少默认配置、无效配置、密钥缺失、图片不支持、鉴权失败、限流、厂商错误、网络错误、响应无效、生成不完整、超时、取消等情况；HTTP 失败附带 `httpStatus`。错误不暴露原始响应、提示词或凭据。

请求互相独立，默认超时 120 秒；调用方可提供 `timeoutMs` 和 `AbortSignal`。取消等待或超时会丢弃迟到结果，不保证厂商停止生成或计费。插件卸载会取消未完成请求。服务不自动重试，也不自动切换配置。

第一版只接收完整文本结果；厂商报告截断、内容过滤等非正常结束时返回 `incomplete-response`。不支持流式显示、工具调用、JSON 格式校验、卡片字段映射、聊天历史持久化或批量队列。

## 厂商参考

- [DeepSeek 模型目录](https://api-docs.deepseek.com/api/list-models/)
- [百炼模型目录与分页格式](https://help.aliyun.com/zh/model-studio/list-models)
- [百炼兼容调用](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)
- [有道大模型网关](https://ai.youdao.com/DOCSIRMA/html/thinkflow/api/guide/index.html)

## 翻译使用的可选能力

文本请求可设置 `thinkingEnabled: true | false`，分别映射为 DeepSeek 的 `thinking.type` 和百炼的 `enable_thinking`。省略时不发送该参数，保持原有调用行为。支持程度由所选模型决定；此参数不改变有道网关请求。

厂商返回用量时，结果包含 `usage: { inputTokens, outputTokens }`；缺失或不合法的计数为 `null`，整个用量对象缺失时不返回该属性。翻译业务使用独立的 `TranslationRuntime` 组织多个请求及会话缓存，有道专用翻译不经过 Chat Completions 网关。

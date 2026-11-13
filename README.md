# 输出高亮（dsh-output-highlight）

> English: theme-aware emphasis and status highlighting for assistant replies and the Plan sidebar preview in DeepSeek Harness. Client-only styling, no DOM mutation and no build step.

给 Harness Web Chat 的**助手回复**、以及**右侧边栏的计划预览（Plan 模式提交的 Markdown 计划）**加上类似 Codex TUI 的重点着色：加粗、标题、行内代码、引用、删除线不再只有灰白一种颜色；加粗的重点短语还会按语义变成成功绿 / 注意琥珀 / 问题红。

插件是纯 Client 样式增强：不写 DOM、不改会话数据、不替换 Chat 节点渲染。

## 效果

### 1. Markdown 语义着色（始终生效）

作用域限定在 Chat 助手行 `[data-chat-flow-kind="assistant-step"]`，以及 Plan 模式在右侧边栏打开的计划预览 `[data-plan-preview]`（由 `@deepseek-ai/dsh-client-ui-plan` 渲染的 Markdown 计划）：

| Markdown | 效果 |
| --- | --- |
| `**加粗**` | 加粗 + 链接蓝（重点信息默认色） |
| `*斜体*` | 紫色 |
| `~~删除~~` | 红色删除线 |
| `# 标题` | 标题主题蓝 |
| `` `行内代码` `` | 代码蓝 + 蓝色浅底/描边 |
| `> 引用` | 次级文字色 + 蓝色左侧边线 |
| 列表标记 | 蓝色系圆点 |
| 表格表头 | 主文字色 + 加粗 |

### 2. 加粗短语的语义色（重点区分成功/注意/问题）

只检查模型已经用 `**...**` 标出的重点短语，按关键词判定语义，再用 CSS Custom Highlight API 给整段短语换色（带浅色底）：

- **成功（绿）**：通过、成功、已完成/已经完成、已实现、已接入、已修复、已解决、已确认、正常、可用、就绪、生效、无异常、无错误、PASSED、SUCCESS 等
- **注意（琥珀）**：注意、待确认、待验证、待定、待办、下一步、尚未、还未、未验证、未测试、未覆盖、风险、警告、隐患、遗留、TODO、FIXME、PENDING 等
- **问题（红）**：未通过、未接入、未实现、未完成、未修复、未解决、失败、错误、报错、异常、崩溃、超时、阻塞、缺失、遗漏、缺陷、不一致、不可用、没有通过、FAILED、ERROR、TIMEOUT 等

匹配优先级为 `问题 > 注意 > 成功`。例如加粗的 `**真实采集与算法尚未接入**` 会整段变红，`**99 项测试全部通过**` 会整段变绿，而 `**Panasonic 已支持 GI20~GI25**` 这类不含状态词的加粗保持默认蓝色。

**为什么只作用于加粗短语？** 纯文本里的「异常」「错误」等词经常出现在中性语境（例如「异常清理」「错误处理」），全文扫描会误报；而加粗是模型主动选择的重点，语义判定更可靠，且效果与 Codex TUI 的「Markdown 强调即高亮」一致。

实现方式：扫描每个加粗元素，用 `CSS.highlights` 注册整段 Range，再由 `::highlight()` 上色。**不改 DOM**，对 React 流式渲染零侵入；代码块、链接、行内代码内部的加粗会被跳过，避免颜色互相覆盖。

### 3. Plan 模式的侧边栏计划

Plan 模式提交计划后，右侧边栏的「计划」标签页由 `@deepseek-ai/dsh-client-ui-plan` 渲染：`<section data-plan-preview>` 包住一段 MarkdownText。插件把同一套 Markdown 着色与语义色应用到 `[data-plan-preview]` 作用域，因此计划里的标题、加粗步骤、行内代码、引用和列表标记都会着色；计划中加粗的状态短语同样按成功/注意/问题分色。

> 该标签页内容为静态 Markdown。插件更新后需要刷新页面（或重启 Harness）才会加载新的客户端模块。

## 安装

插件是纯 Client bundle，声明了 `dsh.bundle`，可直接从 npm 或 GitHub 安装：

```sh
# 普通 dsh web（把 web 换成你的 profile 名）
dsh plugin --profile web add dsh-output-highlight

# 也可以先用 GitHub 源码 / tarball 安装
dsh plugin --profile web add github:<owner>/dsh-output-highlight
```

DSH Desktop 的 `desktop` profile 由应用管理，请在 **Settings → Plugins** 中安装或启用；安装后刷新页面（或重启 Harness）让 Client 模块生效。在插件市场中收录后也可以直接一键安装。

## 调整

编辑 `client.js`：

- 关掉语义色、只保留 Markdown 着色：把 `BOLD_STATUS_COLORS` 改成 `false`。
- 增删状态词：修改 `STATUS_PATTERNS` 中 `problem` / `warn` / `success` 三项正则。数组顺序即优先级。
- 调色：样式使用主题 token（`--dsw-alias-link`、`--dsw-alias-label-*`、`--dsw-static-*`）并用 `color-mix()` 适配明暗主题。不要写死颜色，否则切换 light/dark 会失效。
- 运行中重扫：页面控制台执行 `window.__dshOutputHighlight.refresh()`。

## 验证与限制

- 语法：`node --check client.js`、`node --check index.js`
- 清单：package.json / cordis.patch.yml / locale / icon 已按 bundle 规范填写
- 自动语义色是启发式规则；它只影响模型主动加粗的短语，不会改写任何文本内容。
- 本插件不生成预览文件或 mock 页面；浏览器内最终渲染效果需在实际页面确认（可硬刷新页面）。

## 卸载

```js
plugin_manager({ action: 'remove_bundle', target: 'dsh-output-highlight' })
```

或从 profile 的 bundle 列表中移除该 bundle。

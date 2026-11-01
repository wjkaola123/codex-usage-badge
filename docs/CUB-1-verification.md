# CUB-1 验证记录

验证日期：2026-11-01（Asia/Shanghai）。对象：[CUB-1](https://wjkaola123.atlassian.net/browse/CUB-1)。

## 结论

最终 triage 决定：维护者明确要求推进到 ready-for-agent，已发布完整 Agent Brief（Jira 评论 10786），并将标签设为 composer、context-window、enhancement、ready-for-agent。重新读取 Jira 已确认唯一分类为 enhancement、唯一 triage 状态为 ready-for-agent。项目工作流没有同名状态，故保持 To Do；后文的 needs-triage 为验证过程中的历史建议，已由最终决定取代。正式实现和全部验收由实施代理按 brief 完成。

分类为 enhancement；建议暂留 needs-triage。插件尚未实现该功能，客户端已有部分重叠能力，不能仅凭内置组件存在就将本单关闭为 already implemented。

本次通过现有本机 CDP 连接执行只读 DOM 检查、检查已安装客户端资源，并只读查询本会话的数据库映射与日志统计。没有注入圆环、改变设置、切换会话或模型、发送消息、重启客户端或修改 Jira。未完成交互端到端验证。

## 已确认

### 真实 DOM

已安装客户端包版本为 26.1027.3384.0。

- `[data-codex-composer]` 是可编辑输入框本身，不是包含模型按钮的工具栏容器；直接在其内部寻找模型按钮会失败。
- 应从输入框向上限定到最近的 `[data-codex-composer-root]`，再查找 `[data-composer-navigation-target="reasoning"]`。当前可见 composer 的该按钮数量为 1；同时观察到 `data-codex-intelligence-trigger="true"`。
- 一个页面同时保留了三个 composer，其中仅一个具有非零可见尺寸；必须排除隐藏实例，并验证祖先可见性和活动页面。
- 可见根节点具有 `data-composer-placement="thread"`。根节点内 `[data-above-composer-portal][data-above-composer-conversation-id]` 的会话 ID 与本次聊天 ID 相同。
- 客户端组件代码也确实由会话状态填充该属性，说明它可以作为绑定候选；本次只验证了一个活动本地会话，尚未验证新会话、远程 host、重挂载及多窗口切换。
- 当前根节点、其检查过的祖先和后代未提供已确认可用的 host/model ID 属性。不能把 UUID 命中本地数据库当作本地 host 身份证明。
- 主页面地址仍是 `/index.html`，没有当前会话的 URL 路径或 hash；不能直接用 location 绑定当前会话。

### 原生上下文圆环

已安装资源中存在 `show-context-window-usage` 配置项，定义默认值为 false。本次没有读取或改变当前用户的该设置值。

原生组件使用 `modelContextWindow` 与 `last.totalTokens` 计算上下文占用。其显示还受有效数据、云端模式、听写、其他模式和可用宽度等条件影响。组件渲染使用 `role="img"` 及本地化的 `composer.contextUsageIndicator.ariaLabel`；仅搜索 `role="meter"` 会漏掉原生组件。

本次检查未找到匹配原生上下文用量 aria-label 的 DOM 节点。这不能证明组件不受支持，也不能证明原生隐藏的原因。

原生实现与本单仍有差异：灰环未知状态、meter 语义、阈值配色、保留超限原始 Token 明细等契约尚不能视为原生已满足。应先验证原生设置启用后的行为，再决定是否需要完整插件实现。

### 本地统计链路

采用最新的 `state_5.sqlite`，只读参数化查询本会话 `rollout_path`；在不超过 4 MiB 的尾部读取范围内找到了有效 `event_msg/token_count`。

一次采样得到 `last_token_usage.total_tokens=93825`、`model_context_window=475000`，对应约 19.75% 已用、381175 Token 剩余。这是请求统计快照，不是输入框实时逐字统计，也不是固定模型容量承诺。

该记录的 info 字段为 `total_token_usage`、`last_token_usage`、`model_context_window`，其 token_count 负载没有 model/turn ID。另有 `turn_context` 记录携带 model、turn_id 和 root_turn_id。因此不能仅用 token_count 文件追加或时间更新判定切换模型后的数据归属；需要关联请求上下文，并处理切换时旧请求仍运行的竞态。

本次只验证了数据可读取；未实现或验证增量读取器的截断、替换、超长记录、半行及 UTF-8 边界处理。

## 仍需验证及 brief 补充项

1. 绑定身份必须包括 host 与 threadId。确认本地、远程、新会话、多个 composer 和多个窗口的可靠来源；无法确认时保持未知，不退回最近活跃会话。
2. 为模型切换定义可验证的失效与恢复条件。需要当前模型身份、切换前基线、请求上下文归属以及旧请求迟到统计的处理，不能仅等待下一条 token_count。
3. 原生圆环应在同一 composer 内按实际可见性去重；确认本地化 aria-label 与结构识别方法，以及原生设置启用、窄窗口和模式切换的行为。
4. 明确有界尾读与缓存的有效性：最新统计非法时不能静默回退更旧有效值；超出读取范围无法确认时显示未知。
5. 隐私文档应准确说明读取了可能同时包含正文的日志字节，只提取统计及必要请求元数据；不得把“只提取统计”写成“完全不读取包含正文的文件”。不要保存或输出原始日志行、聊天正文、路径或凭据。

## 验证边界

### 第四轮：可执行身份探针

新增 `scripts/probe-context-binding.cjs`，通过现有本机 CDP 执行只读诊断，不修改客户端状态。运行 `node scripts/probe-context-binding.cjs`，当前可见 composer 输出 ok=true：同一祖先链上的 conversationId/hostId 与 portal 会话 ID 匹配，host 为 local；模型按钮最近携带 model 属性的组件返回机器标识 gpt-6.1-sol。没有从页面文字推断模型，也未将 permissionsHostId 当作执行 host。

portal 中可能有多个相同会话 ID 节点，探针将相同值去重，并在出现多个不同值时拒绝绑定。另一个没有 composer 的页面返回空列表。

该结果补足了单个本地 composer 的身份来源可行性，但依赖 React 私有 fiber/memoizedProps；不能当作跨客户端版本稳定 API，也尚未覆盖远程、多窗口活动 composer、重挂载和切换竞态。

运行 `node scripts/probe-context-binding.cjs --self-test` 通过合成契约检查：拒绝迟到旧代次、A→B→A 的同模型旧请求、不同会话/host、缺少来源代次、非法统计；允许有效零值和压缩后下降。

这些测试仅验证“已取得可信请求代次时”的接收规则，不验证能从真实日志取得该代次。token_count 缺少请求身份仍是明确缺口；不能把前端自行附加当前 bindingVersion 视为日志统计的来源证明。

### 第三轮：实际模型切换样本

本会话日志出现了从 gpt-6.1-sol 到 gpt-6-astra 的 turn_context 切换。前一组统计窗口为 475000，后一组为 258400；切换后的首个采样为 123785 / 258400。以上为本次运行的统计，不应写成模型容量常量。

这验证了按日志顺序将请求上下文与后续统计关联的正常路径。尚未验证并发交错、迟到记录和恢复历史重放；模型名称匹配本身也不能替代请求代次匹配。

下一阶段应为两个适配接口做最小可执行验证，而不是继续无边界地检查静态代码：

1. `resolveComposerBinding(root)` 返回经过验证的 host、threadId、model 和 bindingVersion，或明确 unknown；要覆盖侧栏不存在当前会话的实际布局。
2. `readContextSnapshot(binding)` 返回与绑定及请求代次一致的统计，或明确 unknown；使用合成日志验证 A 模型请求迟到、A→B→A、压缩及截断，真实日志仅验证字段和正常关联。

这些属于实现阶段的技术验证，完整功能回归不应被误当作 triage 必须提前完成的条件。当前仍缺接口可行性证明，因此未标为 ready-for-agent。

### 第二轮追踪补充

- 追踪 composer adapter 的导入/导出后确认：portal ID 由 composer 状态转换函数产生；local 类型返回 conversationId，ChatGPT 类型返回带 `chatgpt:` 前缀的值，cloud/new/other 返回空。这里的 local 是会话类型，不能等同于物理本机 host。
- 同一 adapter 使用独立的 host 状态查询，查询依赖会话映射、已知 host 集合等状态，最后存在 local 默认值。插件不应复制这个默认值作为身份验证。
- 原生 `thread/tokenUsage/updated` 处理分支按 threadId 更新 `latestTokenUsageInfo`，该分支未校验模型或 turn。消费者还要求会话为 resumed 状态才返回统计；这解释了仅有历史日志并不保证原生立即显示，但不证明当前隐藏原因。
- 进一步缩小实现前置条件：需要一个明确的 host 身份适配接口，以及当前模型/请求代次适配接口。仅靠本次确认的 DOM 属性尚不能完整实现这两个接口。可以为未取得证据的绑定返回未知，但必须证明常见本地会话能成功绑定，不能以永久灰环作为验收通过。

没有运行回归测试：本次没有实现变更，现有测试也不覆盖新增功能。DOM 检查仅覆盖当前布局，不代表模型切换、多窗口、明暗主题、窄窗口或键盘交互已通过。

仓库中未找到 triage 角色映射、CONTEXT.md、相关 ADR 或 `.out-of-scope/`。Jira 角色更新前需要确认映射。

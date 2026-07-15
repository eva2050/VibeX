# 中文 X Post Skill 设计说明

## 目标

为 AI、科技、产品、独立开发和创作者商业化内容建立一个版本化、运行时不可变的中文 X Post Skill。它必须在可重复的真实盲测中优于当前通用中文生成规则，才能成为 Studio Post 或 Auto Post 的默认能力。

Skill 是共享的专业质量基线。用户画像、精选样本、人工修改、喜欢/不喜欢和通过证据门控的 Loop 规则都是独立覆盖层，不能直接改写 Skill 本体。

## 范围

本阶段只覆盖中文 Post：

- Studio `viral_rewrite`；
- Auto 原创 Post；
- 确定性评估与模型盲测工具；
- Skill 版本和生成记录归因。

以下能力等 Post Skill 通过质量门槛后再做：

- X Article 检索与专注编辑器；
- 中文 X 互动 Reply Skill；
- 英文、日文、西班牙文和印尼文内容 Skill。

## 内容边界

v1 支持 6 类内容：

1. AI 或科技产品观察；
2. 工具使用体验和产品批评；
3. Build in Public 进展；
4. 失败经历和复盘；
5. 行业观点和趋势判断；
6. 方法、工作流和实操框架。

它不是通用中文社交文案生成器。边界外输入继续走安全的通用链路，并在生成元数据中标记为 `fallback_generic`。

## 架构

```text
core/contentSkills/
├── registry.js
└── zh/
    ├── postSkill.js
    ├── postStrategies.js
    ├── postJudge.js
    └── postBenchmark.js
```

`registry.js` 按 `{ language, format, objective }` 查找 Skill。v1 为 `studio_rewrite` 和 `auto_post` 注册 `zh/post`。

Skill 对外接口：

```js
{
  id: 'zh-x-post',
  version: '1.0.0',
  supports(input): boolean,
  analyze(input): ContentDiagnosis,
  selectCandidateStrategies(diagnosis): CandidateStrategy[3],
  buildCandidateInstruction(strategy, diagnosis): string,
  buildJudgeInstruction(diagnosis): string,
  buildRepairInstruction(diagnosis, failures): string,
  evaluateDeterministically(source, output): SkillEvaluation
}
```

输入诊断完全确定性执行，不增加模型调用。Studio 仍最多使用 3 次候选生成、1 次独立评审和 1 次修复。

## 输入诊断

诊断结果记录：

- 内容类型；
- 原始主张和关键实体；
- 事实确定性；
- 是否存在第一人称经历；
- 原文已有的具体信号；
- 推荐和禁止结构；
- 目标长度区间；
- 超出 Skill 边界时的回退原因。

必须阻止以下结构误用：

- 没有竞争或资源分配关系时，不得强套押注、牌局或输赢；
- 原文没有第一人称经历时，不得虚构个人故事；
- 疑问、怀疑或可能性不能改成确定事实；
- 短观察不能扩写成长教程；
- 账号样本不能替换当前素材的主题和主张。

## 候选差异

3 个候选各自承担不同任务：

1. `faithful_sharpening`：保持原意，只优化首句、压缩和节奏；
2. `cognitive_reframe`：强调原文已有的反差、约束或被忽略变量，不新增结论；
3. `concrete_scene`：使用原文已有的动作、成本、工作流或产品行为承托观点，不虚构事件。

当输入不支持某个策略时，Skill 必须替换成其他合格策略，而不是强套结构。归一化后高度相似的候选视为质量失败。

## 中文质量标准

独立评审采用中文 X 专用评分：

- 主张与确定性忠实度：25；
- 具体信息密度：20；
- 自然中文 X 表达：20；
- 首句继续阅读价值：15；
- 收藏、转发和讨论价值：10；
- 读者与账号匹配：10。

以下硬失败不能被高分抵消：

- 新增外部事实；
- 虚构个人经历；
- 跑题或改变结论；
- 输出语言错误；
- 确定性升级；
- 强套原文不支持的结构；
- 明显营销号腔、翻译腔或模板腔。

首轮 benchmark 继续使用 Studio 的 82 分门槛，避免同时修改 Prompt 和门槛而无法归因。调整门槛必须有新的测试数据支持。

## Skill 与用户记忆的优先级

生成优先级固定为：

1. 安全、事实、语言和素材锁定；
2. 中文 Post Skill 的诊断、策略和评审标准；
3. 账号定位与边界；
4. 用户精选的高质量样本；
5. 明确的人工修改和偏好反馈；
6. 同目标、同语言且已激活的 Loop 规则。

Skill 在运行时只读。用户历史可以影响合格候选中的选择和语气，但不能降低硬门槛，也不能修改共享 Skill。

## Benchmark 数据集

仓库包含至少 60 条中文合成或用户自有素材，6 类内容各 10 条，不复制第三方帖子语料。

每条素材定义：

- 输入文本和内容类型；
- 必须保留的主张与实体；
- 确定性；
- 允许和禁止的结构；
- 是否允许第一人称经历；
- 必须保留的具体信号；
- 最大扩写比例；
- 预期拦截的反模式。

对抗样本覆盖：低信息短输入、只有情绪没有主张、未确认判断、诱导新增数字、提取错误文本、过度扩写风险和营销号排版风险。

## 评估与发布门槛

确定性指标包括：

- 核心主张保留率；
- 新增实体或数字；
- 确定性升级；
- 中文模板命中；
- 扩写比例违规；
- 候选相似度和策略差异；
- 内容类型与禁止结构路由准确率。

模型盲测在不暴露版本身份的情况下比较当前生成器与 Skill 生成器，输出忠实度、具体性、自然度、Hook、读者价值、硬失败和胜负。

Skill 只有全部满足以下门槛才能默认启用：

- 核心主张保留率至少 95%；
- Golden Set 新增外部事实为 0；
- 明显模板命中率不超过 10%；
- 候选策略重复率不超过 20%；
- 相比当前生成器的盲测胜率至少 65%；
- 非中文生成测试无回归。

如果自动测试环境没有真实 Provider 凭据，报告必须显示 `credentials_required`，不能伪造胜率；在真实盲测完成前保持关闭。

## 集成原则

Studio Post 在语言标准化后查找 `zh/post`，生成记录保存 Skill ID、版本、内容类型、候选策略、评审分和修复结果。

Auto Post 使用同一个 Skill 基线，但必须有独立 Auto 开关并继续遵守安全发布逻辑。Studio 永远不会自动发布。

非中文内容和超出边界的中文内容继续走现有回退链路。Auto Reply 使用独立的 `auto_relationship` 目标，不能接收 Post Skill 指令。

## 错误处理

- 无效诊断回退到 `fallback_generic`，不让用户请求失败；
- 一个候选失败时，只要还有其他候选成功就继续；
- 评审结果无效时请求失败并保留之前的 Studio 内容；
- 最多修复一次；
- benchmark 报告只保存素材 ID 和汇总，不保存 API Key 或完整 Provider 请求；
- 生成记录中的 Skill ID 和版本不可变。

## 交付顺序

1. Skill registry、诊断、策略和确定性评估；
2. 60 条 benchmark 与汇总报告；
3. Studio Post 集成；
4. Auto Post 集成并保持独立开关；
5. 批量真实盲测与发布决定；
6. 单独设计 X Article Skill；
7. 单独设计中文 X 互动 Reply Skill。

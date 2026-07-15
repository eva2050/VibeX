# 中文 X Post Skill 实施计划

> 状态：已完成基础 Skill、Studio/Auto 接入和离线 benchmark；真实模型盲测尚未完成，默认开关保持关闭。

## 目标

实现一个版本化、可测试、可归因的中文 X Post Skill，并将它接入 Studio Post 与 Auto Post，同时保证 Reply、多语言和已上架版本的安全边界不被破坏。

## 任务一：Skill Registry

涉及文件：

- `core/contentSkills/registry.js`
- `core/contentSkills/zh/postSkill.js`
- `test_content_skill_registry.mjs`

要求：

- 按 `{ language, format, objective }` 注册和查找 Skill；
- 注册 `zh/post/studio_rewrite` 与 `zh/post/auto_post`；
- 不注册英文或 Reply 目标；
- Skill ID 为 `zh-x-post`，版本为 `1.0.0`；
- 注册后的 Skill 对象在运行时不可变。

验证：

```bash
node test_content_skill_registry.mjs
```

## 任务二：中文内容诊断、策略和硬门槛

涉及文件：

- `core/contentSkills/zh/postStrategies.js`
- `core/contentSkills/zh/postJudge.js`
- `core/contentSkills/zh/postSkill.js`
- `test_chinese_post_skill.mjs`

要求：

- 支持产品观察、工具体验、Build in Public、失败复盘、行业观点和工作流框架；
- 确定性诊断内容类型、数字、实体、第一人称经历和确定性；
- 生成忠实强化、认知重构、具体场景等差异化策略；
- 工作流与进展类内容允许替换为实操框架或进展日志；
- 拦截新增数字、实体、确定性升级、虚构经历、模板腔和过度扩写；
- 中文评审采用专用评分标准，不使用通用作文标准。

验证：

```bash
node test_chinese_post_skill.mjs
```

## 任务三：60 条 Benchmark

涉及文件：

- `benchmarks/chinesePostFixtures.js`
- `core/contentSkills/zh/postBenchmark.js`
- `scripts/run_chinese_post_benchmark.mjs`
- `test_chinese_post_benchmark.mjs`

要求：

- 6 类内容各 10 条，总计 60 条；
- 同时覆盖正常素材和低信息、过度因果、保证增长等对抗素材；
- 计算主张保留、新增事实、确定性升级、模板命中、扩写违规、策略重复和路由准确率；
- 没有真实模型结果时必须显示 `credentials_required`，不能伪造胜率；
- 确定性发布门槛和真实盲测门槛分别报告。

验证：

```bash
node test_chinese_post_benchmark.mjs
node scripts/run_chinese_post_benchmark.mjs
```

## 任务四：Studio Post 接入

涉及文件：

- `core/studioGeneration.js`
- `core/generationAttribution.js`
- `handlers/llmHandler.js`
- `background.js`
- `test_chinese_post_studio_integration.mjs`

要求：

- 只有中文 `viral_rewrite` 可以查找 Post Skill；
- Reply 即使是中文也不能收到 Post Skill；
- Skill 诊断只执行一次，不增加模型调用；
- 3 个候选使用不同 Skill 策略；
- 中文独立评审和确定性硬门槛共同决定是否需要修复；
- 仍保持最多 3 次候选、1 次评审和 1 次修复；
- generation session 保存 Skill ID、版本、内容类型和候选策略；
- 用户切换候选或编辑文本不能改变 Skill 归因信息。

验证：

```bash
node test_chinese_post_studio_integration.mjs
node test_studio_generation.mjs
node test_studio_session_flow.mjs
node test_studio_multilingual_eval.mjs
```

## 任务五：Auto Post 接入与 Reply 隔离

涉及文件：

- `core/automation.js`
- `background.js`
- `test_chinese_post_auto_integration.mjs`

要求：

- 中文 Auto Post 使用 `auto_post` 目标查找同一 Skill；
- Prompt 包含 Skill ID/版本、中文内容诊断、候选策略和中文评审标准；
- Auto Reply 和关系互动 Prompt 不得出现 Post Skill 指令；
- Auto 草稿与发布记录保存 Skill ID、版本和内容类型；
- X 同步和后续表现复盘必须保留这些字段；
- 未通过真实盲测前默认开关关闭。

验证：

```bash
node test_chinese_post_auto_integration.mjs
node test_automation_generation.mjs
node test_loop_context.mjs
node test_relationship_loop.mjs
```

## 任务六：报告与发布决定

涉及文件：

- `scripts/run_chinese_post_benchmark.mjs`
- `docs/benchmarks/chinese-x-post-skill-v1.md`
- `test_generation_loop_integration.mjs`

要求：

- 报告包含 Skill 版本、提交号、全部指标、失败素材和明确发布决定；
- 缺少模型输出或真实盲测时，发布决定为暂缓；
- 报告和用户审核内容使用中文；
- 只有真实数据通过全部门槛后才能开启对应开关。

生成报告：

```bash
node scripts/run_chinese_post_benchmark.mjs \
  --report docs/benchmarks/chinese-x-post-skill-v1.md
```

## 全量回归

正式测试不包含仓库中已知无效实验 `test_export.mjs`：

```bash
for file in test_*.mjs; do
  if [ "$file" = "test_export.mjs" ]; then continue; fi
  node "$file" || exit 1
done
```

语法检查：

```bash
for file in \
  background.js \
  core/*.js \
  core/contentSkills/*.js \
  core/contentSkills/zh/*.js \
  handlers/*.js \
  options/*.js \
  options/ui/*.js \
  content/*.js \
  content/logic/*.js \
  scripts/*.mjs; do
  node --check "$file" || exit 1
done
```

## 当前结论

- 60 条素材内容类型路由准确率：100%；
- 基础 Skill、Studio 和 Auto 集成测试：通过；
- 真实模型候选：尚未生成；
- 真实盲测胜率：暂无数据；
- 发布决定：暂缓；
- Studio 和 Auto 默认开关：关闭。

下一阶段按《中文 X Post Skill 批量盲测设计》执行，每轮一次性交付 10 条内容供集中审核。

# 中文 X Post Skill 批量盲测实施计划

> **给执行 Agent：** 必须使用 `superpowers:executing-plans` 按任务执行。所有代码先写失败测试，再实现；每个任务独立提交。

**目标：** 在扩展内部运行 24 条真实 Studio A/B 测试，一次性交付 10 条 Skill 内容给用户集中打分，并根据盲测胜率、安全指标和用户评分决定是否只开启中文 Studio Post。

**架构：** 纯函数 benchmark 引擎负责素材选择、匿名顺序、评分、用户反馈解析和发布门槛；独立 handler 负责使用扩展已有模型配置逐步运行真实 Studio 链路并保存检查点；独立内部页面负责启动、续跑、批量审核和报告。Studio/Auto 开关拆分，保证盲测通过只影响 Studio。

**技术栈：** Chrome Extension Manifest V3、原生 JavaScript ES Modules、`chrome.storage.local`、现有 `orchestrateStudioGeneration` 与 `callLLM`、Node `assert` 测试。

## 全局约束

- 所有用户可见文案和中文 Skill 文档使用中文。
- 固定 24 条素材，6 类各 4 条；审核批次固定 10 条，隐藏集 14 条。
- 当前组与 Skill 组必须使用同一 Provider、模型、语言、账号上下文和生产链路。
- 模型盲测每条执行两次，并交换 A/B 顺序。
- 通过线：Skill 胜率 ≥65%、非平局 ≥18、主张保留率 ≥95%、新增事实 0、模板命中率 ≤10%、用户评分 ≥85 或明确通过。
- Benchmark 不发布到 X，不写入 Loop、Posts 或 generation sessions，不保存 API Key 副本。
- 通过后只能设置 `zhPostStudio: true`；`zhPostAuto` 必须保持 `false`。
- 不修改用户未跟踪文件 `.superpowers/` 和 `fix_test.mjs`。

---

### 任务一：拆分 Studio 与 Auto 的中文 Skill 开关

**文件：**

- 新建：`core/contentSkillRollout.js`
- 修改：`background.js`
- 修改：`handlers/llmHandler.js`
- 修改：`core/automation.js`
- 新建测试：`test_content_skill_rollout.mjs`

**接口：**

- 输入：旧配置 `{ zhPost?: boolean, zhPostStudio?: boolean, zhPostAuto?: boolean }`
- 输出：`normalizeContentSkillRollout(value) -> { zhPostStudio: boolean, zhPostAuto: boolean }`

- [ ] **步骤 1：先写失败测试**

```js
import assert from 'node:assert/strict';
import { normalizeContentSkillRollout } from './core/contentSkillRollout.js';

assert.deepEqual(normalizeContentSkillRollout(), {
  zhPostStudio: false,
  zhPostAuto: false
});
assert.deepEqual(normalizeContentSkillRollout({ zhPost: true }), {
  zhPostStudio: false,
  zhPostAuto: false
});
assert.deepEqual(normalizeContentSkillRollout({ zhPostStudio: true, zhPostAuto: false }), {
  zhPostStudio: true,
  zhPostAuto: false
});
```

- [ ] **步骤 2：运行并确认失败**

运行：`node test_content_skill_rollout.mjs`

预期：因 `core/contentSkillRollout.js` 不存在而失败。

- [ ] **步骤 3：实现纯函数并接入三个调用点**

```js
function normalizeContentSkillRollout(value = {}) {
  const hasSplitSchema = Object.hasOwn(value || {}, 'zhPostStudio')
    || Object.hasOwn(value || {}, 'zhPostAuto');
  if (!hasSplitSchema) return { zhPostStudio: false, zhPostAuto: false };
  return {
    zhPostStudio: value.zhPostStudio === true,
    zhPostAuto: value.zhPostAuto === true
  };
}

export { normalizeContentSkillRollout };
```

`background.js` 初始化时写入标准化结果；`llmHandler.js` 只读取 `zhPostStudio`；`automation.js` 只读取 `zhPostAuto`。

- [ ] **步骤 4：运行开关与现有隔离测试**

运行：

```bash
node test_content_skill_rollout.mjs
node test_chinese_post_studio_integration.mjs
node test_chinese_post_auto_integration.mjs
node test_relationship_loop.mjs
```

预期：全部通过，Reply 不出现 Post Skill。

- [ ] **步骤 5：提交**

```bash
git add core/contentSkillRollout.js background.js handlers/llmHandler.js core/automation.js test_content_skill_rollout.mjs test_chinese_post_studio_integration.mjs test_chinese_post_auto_integration.mjs
git commit -m "refactor: split Chinese post rollout flags"
```

---

### 任务二：实现纯函数批量盲测引擎

**文件：**

- 新建：`core/contentSkills/zh/postBlindBenchmark.js`
- 新建测试：`test_chinese_post_blind_benchmark.mjs`

**接口：**

- `selectBlindBenchmarkFixtures(fixtures) -> Fixture[24]`
- `createBlindBenchmarkRun(input) -> BlindBenchmarkRun`
- `assignAnonymousArms(runId, fixtureId) -> { first, second, skillLabel }`
- `parseBatchReviewFeedback(text) -> { score, approved, bestIds, weakIds, tags, raw }`
- `selectReviewBatch(run) -> fixtureId[10]`
- `finalizeBlindBenchmark(run) -> BlindBenchmarkReport`

- [ ] **步骤 1：写固定 24 条与匿名顺序失败测试**

```js
const selected = selectBlindBenchmarkFixtures(CHINESE_POST_FIXTURES);
assert.equal(selected.length, 24);
for (const family of SUPPORTED_CHINESE_POST_FAMILIES) {
  assert.equal(selected.filter(item => item.family === family).length, 4);
}
assert.deepEqual(
  assignAnonymousArms('run-1', 'product-observation-01'),
  assignAnonymousArms('run-1', 'product-observation-01')
);
```

- [ ] **步骤 2：写批量反馈解析失败测试**

```js
assert.deepEqual(
  parseBatchReviewFeedback('整体 70 分；2、6 最好；4、9 AI 味重；观点不够具体。'),
  {
    score: 70,
    approved: false,
    bestIds: [2, 6],
    weakIds: [4, 9],
    tags: ['template_tone', 'low_specificity'],
    raw: '整体 70 分；2、6 最好；4、9 AI 味重；观点不够具体。'
  }
);
assert.equal(parseBatchReviewFeedback('可以，通过').approved, true);
```

- [ ] **步骤 3：写最终门槛失败测试**

构造 24 条完整结果，分别验证：64% 失败、65% 通过、17 条非平局失败、新增事实大于 0 失败、用户 84 分失败、85 分通过。

- [ ] **步骤 4：运行并确认失败**

运行：`node test_chinese_post_blind_benchmark.mjs`

预期：因模块不存在而失败。

- [ ] **步骤 5：实现最小纯函数引擎**

运行状态固定使用：

```js
{
  schemaVersion: 1,
  id: 'zh-post-benchmark-...',
  status: 'setup|running|review_ready|completed|failed',
  benchmarkVersion: 'zh-post-blind-v1',
  skillId: 'zh-x-post',
  skillVersion: '1.0.0',
  configSnapshot: { apiProvider, aiModel, engineLanguage },
  fixtureIds: [],
  fixtures: {},
  reviewFixtureIds: [],
  reviewFeedback: null,
  report: null,
  createdAt: 0,
  updatedAt: 0
}
```

审核集选择顺序：模型顺序互换后结论不一致、评分差最小、安全风险最高；同时保证 6 类各至少 1 条。用户看到的是 10 条 Skill 输出，另外 14 条保持隐藏。

- [ ] **步骤 6：运行测试并提交**

运行：`node test_chinese_post_blind_benchmark.mjs`

预期：通过。

```bash
git add core/contentSkills/zh/postBlindBenchmark.js test_chinese_post_blind_benchmark.mjs
git commit -m "feat: add Chinese post blind benchmark engine"
```

---

### 任务三：提取可复用的 Studio Rewrite 输入构建器

**文件：**

- 新建：`core/studioRewriteInput.js`
- 修改：`handlers/llmHandler.js`
- 新建测试：`test_studio_rewrite_input.mjs`

**接口：**

- `detectInputLanguage(text) -> string`
- `buildInputLockedRewriteRules(text, outputLang) -> string`
- `buildStudioRewriteInput({ sourceText, config, generationContext, contentSkill }) -> StudioGenerationInput`

- [ ] **步骤 1：写失败测试**

```js
const input = buildStudioRewriteInput({
  sourceText: '这个 AI 产品第一次很惊艳，但第二次上下文断了。',
  config: { engineLanguage: 'zh' },
  generationContext: {},
  contentSkill: null
});
assert.equal(input.promptType, 'viral_rewrite');
assert.equal(input.sourceText.includes('上下文断了'), true);
assert.match(input.inputLockConstraint, /唯一主题来源/);
assert.equal(input.contentSkill, null);
```

- [ ] **步骤 2：运行并确认失败**

运行：`node test_studio_rewrite_input.mjs`

预期：因模块不存在而失败。

- [ ] **步骤 3：移动现有私有逻辑并保持输出一致**

将 `llmHandler.js` 中的 `detectInputLanguage` 和 `buildInputLockedRewriteRules` 移入新模块；新建构建器统一生成 benchmark 与真实 Studio 需要的 `promptPrefix`、语言约束、输入锁定、严格反 AI 规则和表现记忆开关。

- [ ] **步骤 4：运行 Studio 回归**

```bash
node test_studio_rewrite_input.mjs
node test_rewrite_prompt.mjs
node test_studio_prompt.mjs
node test_chinese_post_studio_integration.mjs
```

预期：全部通过，Prompt 关键规则保持一致。

- [ ] **步骤 5：提交**

```bash
git add core/studioRewriteInput.js handlers/llmHandler.js test_studio_rewrite_input.mjs
git commit -m "refactor: share Studio rewrite input builder"
```

---

### 任务四：实现可续跑的 Benchmark Handler

**文件：**

- 新建：`handlers/benchmarkHandler.js`
- 修改：`handlers/messageRouter.js`
- 修改：`background.js`
- 新建测试：`test_chinese_post_benchmark_handler.mjs`

**接口：**

- 消息：`startChinesePostBenchmark`
- 消息：`runNextChinesePostBenchmarkStep`
- 消息：`getChinesePostBenchmark`
- 消息：`submitChinesePostBenchmarkReview`
- 消息：`resetChinesePostBenchmark`
- 存储键：`chinesePostBlindBenchmarkV1`

- [ ] **步骤 1：写消息路由与缺少 API Key 失败测试**

测试必须断言五个 action 被路由到独立 handler；缺少 key 或 `mock-` key 时，`start` 返回 `{ success:false, error:'ERR_MISSING_API_KEY' }`，且没有模型调用。

- [ ] **步骤 2：写逐步执行与断点续跑失败测试**

使用 mock `callModel`：第一次 step 只完成当前组并保存；第二次完成 Skill 组；重建 handler 后继续时不得再次调用已经完成的组。

- [ ] **步骤 3：运行并确认失败**

运行：`node test_chinese_post_benchmark_handler.mjs`

预期：因 handler 不存在而失败。

- [ ] **步骤 4：实现逐步状态机**

每次 `runNext...` 只执行一个可恢复单元：

1. 当前组 Studio 生成；
2. Skill 组 Studio 生成；
3. A/B 顺序一盲评；
4. A/B 交换顺序盲评；
5. 进入下一条素材；
6. 全部完成后选择 10 条审核集并进入 `review_ready`。

生成调用统一使用 `buildStudioRewriteInput` 和 `orchestrateStudioGeneration`。当前组传 `contentSkill:null`，Skill 组传 `ZH_POST_SKILL`。Blind judge Prompt 只包含素材、匿名 A/B 和中文评分标准。

- [ ] **步骤 5：实现用户反馈与发布决定**

`submit...Review` 调用 `parseBatchReviewFeedback`，完成报告。如果全部门槛通过，只写：

```js
contentSkillRollout: {
  ...normalizeContentSkillRollout(current),
  zhPostStudio: true,
  zhPostAuto: false
}
```

失败或未完成时不打开任何开关。

- [ ] **步骤 6：运行 handler、隔离和存储测试**

```bash
node test_chinese_post_benchmark_handler.mjs
node test_content_skill_rollout.mjs
node test_storage_schema_v4.mjs
node test_loop_context.mjs
node test_relationship_loop.mjs
```

预期：全部通过，benchmark 数据不进入 Loop 或 Posts。

- [ ] **步骤 7：提交**

```bash
git add handlers/benchmarkHandler.js handlers/messageRouter.js background.js test_chinese_post_benchmark_handler.mjs
git commit -m "feat: run resumable Chinese post benchmark"
```

---

### 任务五：实现内部 10 条批量审核页面

**文件：**

- 新建：`options/chinese-post-benchmark.html`
- 新建：`options/chinese-post-benchmark.js`
- 新建：`options/chinese-post-benchmark.css`
- 新建测试：`test_chinese_post_benchmark_ui.mjs`

**接口：**

- 页面通过 `chrome.runtime.sendMessage` 调用任务四的五个 action；
- 不修改普通 `options/options.html` 和 Studio 使用流程；
- 直接内部地址：`chrome-extension://<id>/options/chinese-post-benchmark.html`。

- [ ] **步骤 1：写静态结构失败测试**

```js
assert.match(html, /id="benchmark-start"/);
assert.match(html, /id="benchmark-progress"/);
assert.match(html, /id="benchmark-review-list"/);
assert.match(html, /id="benchmark-feedback"/);
assert.match(html, /id="benchmark-submit-review"/);
assert.doesNotMatch(optionsHtml, /chinese-post-benchmark/);
```

- [ ] **步骤 2：运行并确认失败**

运行：`node test_chinese_post_benchmark_ui.mjs`

预期：页面文件不存在。

- [ ] **步骤 3：实现三态页面**

准备态显示模型、24 条素材、240–288 次调用和开始按钮；运行态显示当前素材、阶段、完成数、失败和继续按钮；审核态在一个页面完整展示 10 条编号内容和一个自由文本反馈框。

反馈框提示：

`例如：整体 70 分；2、6 最好；4、9 AI 味重；观点不够具体。`

只要求总分或“通过”二选一，不要求逐条打分。

- [ ] **步骤 4：实现自动续跑**

页面打开时读取状态；运行中按 step 循环发送消息，每一步完成后刷新进度。网络错误时停止循环并保留“继续”按钮，不清空数据。

- [ ] **步骤 5：实现报告展示**

显示：Skill 胜率、非平局数、用户总分、事实错误、模板命中、6 类内容结果、是否开启 Studio，以及可复制的本轮问题摘要。隐藏集只显示汇总，不显示具体文本。

- [ ] **步骤 6：测试并提交**

```bash
node test_chinese_post_benchmark_ui.mjs
node --check options/chinese-post-benchmark.js
```

```bash
git add options/chinese-post-benchmark.html options/chinese-post-benchmark.js options/chinese-post-benchmark.css test_chinese_post_benchmark_ui.mjs
git commit -m "feat: add Chinese post batch review page"
```

---

### 任务六：中文报告、全量回归与实际运行交接

**文件：**

- 修改：`scripts/run_chinese_post_benchmark.mjs`
- 修改：`docs/benchmarks/chinese-x-post-skill-v1.md`
- 修改：`test_generation_loop_integration.mjs`

- [ ] **步骤 1：扩展报告测试**

断言报告包含：24 条真实运行状态、模型双盲胜率、非平局数、10 条用户批次总分、审核集与隐藏集汇总、Skill 版本、提交号和 Studio/Auto 两个开关状态。用户可见标题和原因必须是中文。

- [ ] **步骤 2：运行所有正式测试**

```bash
for file in test_*.mjs; do
  if [ "$file" = "test_export.mjs" ]; then continue; fi
  node "$file" || exit 1
done
```

预期：全部通过。

- [ ] **步骤 3：运行全部 JavaScript 语法检查**

```bash
for file in background.js core/*.js core/contentSkills/*.js core/contentSkills/zh/*.js handlers/*.js options/*.js options/ui/*.js content/*.js content/logic/*.js scripts/*.mjs; do
  node --check "$file" || exit 1
done
```

预期：全部通过。

- [ ] **步骤 4：检查改动范围**

```bash
git diff --check
git status --short --branch
```

预期：只包含 benchmark、开关拆分、内部页面、测试和中文报告；`.superpowers/` 与 `fix_test.mjs` 保持未跟踪且未修改。

- [ ] **步骤 5：提交**

```bash
git add scripts/run_chinese_post_benchmark.mjs docs/benchmarks/chinese-x-post-skill-v1.md test_generation_loop_integration.mjs
git commit -m "test: report Chinese post blind benchmark"
```

## 执行结果交付方式

实现完成后不把“代码通过测试”当作内容效果通过。先把内部测试页交付给用户运行真实模型；生成完成后一次性展示 10 条内容。用户只需要给总分和可选批注，Codex随后直接修改下一版 Skill并继续测试，直到真实数据通过或明确出现无法继续提升的瓶颈。

# Studio 单稿与中文 X Skill v1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Studio 每次只向用户交付一篇正文，并用“生成一稿、独立质检、不合格才修复”的流程提高中文 X 内容质量；内容迭代改为由用户在对话中批量审核。

**Architecture:** `core/studioGeneration.js` 从多候选竞赛改为单稿管线，内部仍保存一条 draft 记录供归因，但 Options 不再呈现候选选择器。中文 Skill v1.1 以“具体信号 → 观察过程 → 个人判断”为主要形状，判断器同时阻止虚构事实与抽象训话。产品内盲测页面、消息处理器和状态机全部移除，离线回归 fixtures 保留。

**Tech Stack:** Chrome Extension Manifest V3、原生 ES Modules、Node.js `assert` 回归测试。

## Global Constraints

- Studio 页面只展示一篇最终正文。
- 正常流程调用两次模型：一稿一次、质检一次；只有不合格时增加一次修复调用。
- 中文素材没有提供第一人称经历时，禁止虚构“我试过/我发现”。
- 中文正文不得以普遍结论、对仗金句或“你应该”式训话代替事实与观察。
- Auto rollout 保持关闭，不改变现有上架版本兼容策略。
- `.superpowers/`、`fix_test.mjs` 和 `test_export.mjs` 不纳入修改或正式测试。

---

### Task 1: 锁定单稿管线行为

**Files:**
- Modify: `test_studio_generation.mjs`
- Modify: `test_chinese_post_studio_integration.mjs`
- Modify: `core/studioGeneration.js`

**Interfaces:**
- Consumes: `orchestrateStudioGeneration(input, { callModel, onPhase })`
- Produces: `{ text, candidates: [draft], judge, repaired, quality }`

- [ ] **Step 1: 写失败测试**

  将成功场景模型输出改为“一稿 + 单稿评审 JSON”，断言正常只调用 2 次、修复场景只调用 3 次、`candidates.length === 1`，并断言 phase 为 `generating_draft`、`reviewing_draft`、必要时 `repairing_draft`。

- [ ] **Step 2: 运行测试确认 RED**

  Run: `node test_studio_generation.mjs && node test_chinese_post_studio_integration.mjs`

  Expected: 旧实现仍生成 2—3 个候选，调用次数和 phase 断言失败。

- [ ] **Step 3: 实现最小单稿管线**

  `getCandidatePlans()` 只返回一个最合适策略；生成一条 `candidate-a` 后立即单独评审。评审 JSON 继续使用 `selectedCandidateId` 和 `scores` 以保持归因结构兼容，但候选集合只能有一条。没有候选时抛出 `Studio draft call failed`。

- [ ] **Step 4: 运行测试确认 GREEN**

  Run: `node test_studio_generation.mjs && node test_chinese_post_studio_integration.mjs`

  Expected: 两个测试脚本退出码 0。

### Task 2: 移除候选 UI 与产品内 benchmark

**Files:**
- Modify: `options/options.html`
- Modify: `options/options.js`
- Modify: `options/options.css`
- Modify: `options/locales.js`
- Modify: `handlers/messageRouter.js`
- Delete: `handlers/benchmarkHandler.js`
- Delete: `options/chinese-post-benchmark.html`
- Delete: `options/chinese-post-benchmark.js`
- Delete: `options/chinese-post-benchmark.css`
- Delete: `core/contentSkills/zh/postBlindBenchmark.js`
- Delete: `test_chinese_post_benchmark_handler.mjs`
- Delete: `test_chinese_post_benchmark_ui.mjs`
- Delete: `test_chinese_post_blind_benchmark.mjs`
- Delete: `docs/superpowers/plans/2026-07-15-chinese-post-blind-benchmark.md`
- Delete: `docs/superpowers/specs/2026-07-15-chinese-post-blind-benchmark-design.md`
- Create: `test_studio_single_output_ui.mjs`

**Interfaces:**
- Consumes: Studio `generationSession` with one internal draft.
- Produces: 只包含最终编辑器正文的 Studio UI；消息路由不再接受 benchmark action。

- [ ] **Step 1: 写失败测试**

  静态读取 Options HTML/JS 和 message router，断言不存在 `generation-candidates`、`renderGenerationCandidates`、`startChinesePostBenchmark`、`handleBenchmarkMessage`，并断言已删除的产品文件不存在。

- [ ] **Step 2: 运行测试确认 RED**

  Run: `node test_studio_single_output_ui.mjs`

  Expected: 当前候选 UI 和 benchmark 路由仍存在，测试失败。

- [ ] **Step 3: 删除产品行为并清理文案/CSS**

  删除候选 `<details>`、渲染函数及调用、候选选择事件；删除 benchmark 路由、处理器、页面、盲测状态机及过时设计文档。保留 `benchmarks/chinesePostFixtures.js` 和纯离线 `postBenchmark.js`，供回归检查而非用户操作。

- [ ] **Step 4: 运行测试确认 GREEN**

  Run: `node test_studio_single_output_ui.mjs`

  Expected: 测试脚本退出码 0。

### Task 3: 中文 X Skill v1.1

**Files:**
- Modify: `core/contentSkills/zh/postStrategies.js`
- Modify: `core/contentSkills/zh/postJudge.js`
- Modify: `core/contentSkills/zh/postSkill.js`
- Modify: `test_chinese_post_skill.mjs`
- Modify: `test_chinese_post_benchmark.mjs`
- Create: `docs/skills/中文-X-内容创作-Skill.md`

**Interfaces:**
- Consumes: `ZH_POST_SKILL.analyze({ text })`
- Produces: 一条 family-specific strategy；`evaluateDeterministically()` 增加 `lecture_tone`、`abstract_slogan`、`evidence_free_opening` 等可解释问题。

- [ ] **Step 1: 用真实失败样本写 RED 测试**

  把用户判定“太说教、爹味十足”的抽象对仗文本作为负例，断言被拒绝；增加“具体事件先出现、观点后出现”的正例；断言候选指令包含“先证据后判断”“写我如何做而非教别人怎么做”“不得虚构经历”。

- [ ] **Step 2: 运行测试确认 RED**

  Run: `node test_chinese_post_skill.mjs && node test_chinese_post_benchmark.mjs`

  Expected: 旧 Skill 不识别训话和无证据开头，版本及策略数量断言失败。

- [ ] **Step 3: 实现 Skill v1.1**

  将版本升级到 `1.1.0`。按内容 family 只选一个结构；提示词使用中文，要求先复用素材里的数字、人物、动作、产品行为或过程，再写判断；只在素材明确提供时使用第一人称。判断器识别“真正重要的是/本质上/决定…的是…”等抽象开场、成组命令句及无来源的权威结论，但允许来源有步骤时保留实操结构。

- [ ] **Step 4: 编写中文说明文档**

  文档说明输入契约、六类内容、输出结构、硬失败、审核标准和迭代方法。所有规则正文使用中文，英文仅保留必要产品名及字段名。

- [ ] **Step 5: 运行测试确认 GREEN**

  Run: `node test_chinese_post_skill.mjs && node test_chinese_post_benchmark.mjs`

  Expected: 两个测试脚本退出码 0。

### Task 4: 第一轮人工审核集与完整验证

**Files:**
- Create: `docs/reviews/中文-X-Skill-v1.1-人工审核第1轮.md`
- Modify: `docs/benchmarks/chinese-x-post-skill-v1.md`

**Interfaces:**
- Produces: 15 条不同 family 的“素材 + 单一成稿”，供用户按真实发布意愿审核。

- [ ] **Step 1: 生成 15 条审核内容**

  覆盖产品观察、工具体验、build in public、失败复盘、行业观点和工作流；每条只使用素材已有事实，并标明 family，正文不显示评分或候选。

- [ ] **Step 2: 运行正式测试集**

  Run: `node --test $(rg --files -g 'test_*.mjs' | rg -v 'test_export.mjs|test_chinese_post_benchmark_handler.mjs|test_chinese_post_benchmark_ui.mjs|test_chinese_post_blind_benchmark.mjs')`

  Expected: 0 failures。

- [ ] **Step 3: 运行语法检查**

  Run: `for f in $(rg --files -g '*.js' -g '!node_modules'); do node --check "$f"; done`

  Expected: 退出码 0。

- [ ] **Step 4: 检查 diff、提交并推送**

  Run: `git diff --check`，随后只暂存本计划涉及文件，提交到 `main` 并推送 `origin/main`；不得暂存 `.superpowers/` 或 `fix_test.mjs`。

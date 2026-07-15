# 中文 X Post Skill v1.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用可追溯的近期中文 X 正反语料重建中文 Post Skill，使生成优先保留真实信号、现场感和话题时效，并交付第二轮 15 条人工审核内容。

**Architecture:** 新增只读语料模块保存 40 条短摘要与标注，策略模块从 family recipe 改为 signal diagnosis + pattern card，判断器增加内容农场、时代宣言、伪步骤、伪反差和具体信号丢失检查。Studio/Auto 接口不变，只把 Skill 版本升级到 1.2.0。

**Tech Stack:** Chrome Extension Manifest V3、原生 ES Modules、Node.js `assert` 回归测试。

## Global Constraints

- 语料固定为 40 条、至少 8 位作者、24 条正样本和 16 条反样本。
- 只保存短摘要和结构标签，不复制第三方完整推文。
- 任何 pattern card 至少由 3 位作者的样本共同支持。
- Studio 仍只交付一篇；不增加用户设置，不在运行时抓取 X。
- 不新增事实、经历、数字、实体或确定性。
- 第二轮 15 条必须来自近期公开信号，并通过连续 12 个中文字符的防复制检查。
- `.superpowers/`、`fix_test.mjs` 和 `test_export.mjs` 不修改、不暂存、不进入正式测试。

---

### Task 1: 锁定语料与信号诊断契约

**Files:**
- Create: `test_chinese_post_corpus.mjs`
- Create: `core/contentSkills/zh/postCorpus.js`
- Modify: `test_chinese_post_skill.mjs`
- Modify: `core/contentSkills/zh/postStrategies.js`

**Interfaces:**
- Produces: `CHINESE_X_CORPUS`, `CHINESE_POST_PATTERN_CARDS`, `validateChinesePostCorpus()`
- Produces: `diagnosis.signalType`, `diagnosis.sourceStrength`, `diagnosis.availableSignals`

- [ ] **Step 1: 写失败测试**

  断言语料为 40 条、作者至少 8 位、正反标签为 24/16、所有记录有 HTTPS X URL、抓取时间、指标快照和非空结构标签；断言每张 pattern card 的证据作者至少 3 位。增加实测、来源更新、产品反馈、数据快照、抽象观点和薄输入的诊断样本。

- [ ] **Step 2: 运行测试确认 RED**

  Run: `node test_chinese_post_corpus.mjs && node test_chinese_post_skill.mjs`

  Expected: `postCorpus.js` 不存在，测试失败。

- [ ] **Step 3: 实现最小语料模块与诊断**

  语料只保存不超过 80 字的摘要。`diagnoseChinesePostInput()` 根据第一人称动作、测试词、来源 URL/发布词、反馈对象、数字和抽象词确定信号类型与强度，并选择一张 pattern card。

- [ ] **Step 4: 运行测试确认 GREEN**

  Run: `node test_chinese_post_corpus.mjs && node test_chinese_post_skill.mjs`

  Expected: 两个脚本退出码 0。

### Task 2: 用失败样本重写生成与质检

**Files:**
- Modify: `test_chinese_post_skill.mjs`
- Modify: `core/contentSkills/zh/postStrategies.js`
- Modify: `core/contentSkills/zh/postJudge.js`
- Modify: `core/contentSkills/zh/postSkill.js`
- Modify: `docs/skills/中文-X-内容创作-Skill.md`

**Interfaces:**
- Produces: `ZH_POST_SKILL@1.2.0`
- Produces: `content_farm_tone`, `era_manifesto`, `invented_steps`, `stacked_contrast`, `concrete_signal_dropped`

- [ ] **Step 1: 写失败测试**

  使用首轮“老登味”形状与近期高播放标题党作为负例；断言时代宣言、内容农场词、无来源三步法、成组“不是/而是”和删除具体数字/动作的输出被拒绝。正例保留实测短板、具体 UI 摩擦、数据口径和无升华短句。

- [ ] **Step 2: 运行测试确认 RED**

  Run: `node test_chinese_post_skill.mjs`

  Expected: 新 issue 和 1.2.0 版本断言失败。

- [ ] **Step 3: 实现 v1.2 提示与判断器**

  删除 family recipe 三段式要求；候选指令只给一张信号卡，并明确停止条件。判断器对输入是否显式提供步骤和具体信号做条件判断，避免把正常清单误伤。

- [ ] **Step 4: 更新中文 Skill 文档**

  文档改为素材层/表达层、信号类型、pattern card、反模式和人工验收，删除 v1.1 的统一“三步成稿”描述。

- [ ] **Step 5: 运行测试确认 GREEN**

  Run: `node test_chinese_post_skill.mjs`

  Expected: 脚本退出码 0。

### Task 3: 更新 benchmark 与集成归因

**Files:**
- Modify: `test_chinese_post_benchmark.mjs`
- Modify: `test_chinese_post_studio_integration.mjs`
- Modify: `test_chinese_post_auto_integration.mjs`
- Modify: `scripts/run_chinese_post_benchmark.mjs`
- Modify: `docs/benchmarks/chinese-x-post-skill-v1.md`

**Interfaces:**
- Consumes: `ZH_POST_SKILL@1.2.0`
- Produces: 1.2.0 的报告标题、Studio/Auto 元数据与回归结果。

- [ ] **Step 1: 写失败测试**

  把版本断言升级到 1.2.0，并断言 Studio prompt 包含信号类型、素材强度、停止条件和“语料不提供主题”。

- [ ] **Step 2: 运行测试确认 RED**

  Run: `node test_chinese_post_benchmark.mjs && node test_chinese_post_studio_integration.mjs && node test_chinese_post_auto_integration.mjs`

  Expected: 版本和 prompt 断言失败。

- [ ] **Step 3: 更新报告与集成文本**

  保持接口和调用次数不变，只更新版本归因、诊断说明与报告文案。

- [ ] **Step 4: 运行测试确认 GREEN**

  Run: `node test_chinese_post_benchmark.mjs && node test_chinese_post_studio_integration.mjs && node test_chinese_post_auto_integration.mjs`

  Expected: 三个脚本退出码 0。

### Task 4: 生成第二轮 15 条真实信号审核集

**Files:**
- Create: `test_chinese_post_review_batch_v1_2.mjs`
- Create: `docs/reviews/中文-X-Skill-v1.2-人工审核第2轮.md`

**Interfaces:**
- Produces: 15 条带来源、素材摘要和单一正文的审核集。

- [ ] **Step 1: 写审核集约束测试并确认 RED**

  断言 15 个编号、15 个不同原帖 URL、每条有素材摘要与正文、不出现内部评分、不与 40 条语料摘要共享连续 12 个中文字符。

  Run: `node test_chinese_post_review_batch_v1_2.mjs`

  Expected: 审核文档不存在，测试失败。

- [ ] **Step 2: 生成 15 条内容**

  覆盖实测、产品反馈、数据快照、来源拆解、现场片段和短判断；只使用对应来源已公开的事实，保留不确定性和产品短板。

- [ ] **Step 3: 运行约束测试确认 GREEN**

  Run: `node test_chinese_post_review_batch_v1_2.mjs`

  Expected: 脚本退出码 0。

### Task 5: 完整验证与发布

**Files:**
- Verify all files above.

**Interfaces:**
- Produces: 可复现测试证据、提交和 `origin/main` 最新版本。

- [ ] **Step 1: 运行正式测试集**

  Run: `node --test $(rg --files -g 'test_*.mjs' | rg -v 'test_export.mjs')`

  Expected: 0 failures。

- [ ] **Step 2: 运行语法与差异检查**

  Run: `for f in $(rg --files -g '*.js' -g '!node_modules'); do node --check "$f"; done`，然后 `git diff --check`。

  Expected: 全部退出码 0。

- [ ] **Step 3: 有意暂存、提交并推送**

  只暂存本计划文件，确认不包含 `.superpowers/`、`fix_test.mjs`，提交到用户已授权的 `main` 并推送 `origin/main`。

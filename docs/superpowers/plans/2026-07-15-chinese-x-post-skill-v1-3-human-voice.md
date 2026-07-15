# 中文 X Post Skill v1.3 人味与口头思路轨迹 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把用户确认的 AI/Web3 定稿及其修改过程转成可执行的中文 Post Skill 规则，使 Studio 保留用户的混合口语、重复列举、自我怀疑和个人记忆点，并拦截过度正确的宏大收尾。

**Architecture:** 在 `postStrategies.js` 增加素材归属与口头思路轨迹诊断，返回本人信号、重复开头、英文切换、引用词和反问等结构化信息；生成提示只要求保留素材真实存在的动作，不新增口头禅。`postJudge.js` 增加人味丢失、伪造情绪和过度抛光检查；Skill 升级至 `1.3.0`，Studio/Auto 接口和单稿流程保持不变。

**Tech Stack:** Chrome Extension Manifest V3、原生 ES Modules、Node.js `assert` / `node:test`。

## Global Constraints

- 用户确认的 AI/Web3 定稿是 v1.3 黄金样本，事实、`or`、FOMO、“主席大大”、“歪脖山”、重复“一样的”和两次自我怀疑均不得被标准化清洗。
- “人味”只能来自输入已有的情绪、反问、自我修正、混合语域和个人词，不能统一添加“哈哈哈”“讲真”或夸张标点。
- 外部来源中的第一人称不能转移给用户；没有来源标记的 Studio 原始输入按用户本人表达处理，显式 URL/来源按外部归属处理。
- 不增加 Studio 的设置、候选或输入步骤；Studio 仍只交付一篇。
- 语料只做结构评审，不向生成模型提供当前主题、事实或第三方句子。
- `.superpowers/`、`fix_test.mjs` 和 `test_export.mjs` 不修改、不暂存、不进入正式测试。

---

### Task 1: 锁定黄金样本与口头思路诊断契约

**Files:**
- Create: `test_chinese_post_human_voice.mjs`
- Modify: `core/contentSkills/zh/postStrategies.js`
- Modify: `test_chinese_post_skill.mjs`

**Interfaces:**
- Produces: `diagnosis.ownership: 'first_party' | 'attributed_external' | 'unknown'`
- Produces: `diagnosis.firstPartySignals: readonly string[]`
- Produces: `diagnosis.externalSignals: readonly string[]`
- Produces: `diagnosis.allowedPerspective: string`
- Produces: `diagnosis.publishReason: string`
- Produces: `diagnosis.humanTrace: { repeatedOpeners, codeSwitches, quotedPhrases }`
- Produces: `diagnosis.emotionalTemperature: 'neutral' | 'low' | 'medium' | 'high'`
- Produces: `diagnosis.speechMoves: readonly string[]`

- [ ] **Step 1: 写黄金样本失败测试**

创建 `test_chinese_post_human_voice.mjs`，至少包含以下断言：

```js
import assert from 'node:assert/strict';
import { ZH_POST_SKILL } from './core/contentSkills/zh/postSkill.js';

const source = `感觉 AI 这波，真的好像当年的 Web3 啊。

一样的二级市场 FOMO，几十倍造富效应，一级抢着要额度。
一样的年轻人入场，想要改变 or 干翻这个世界，新晋富豪更是扎堆。
一样的主席大大讲话，主会场一票难求，分会场遍地开花。
一样的自媒体红利，懂不懂先放一边，反正都在教别人怎么上车。

但，还是不一样吧？
毕竟 AI 可比 Web3 实用太多了。

但，真的不一样么？
或许那座 “歪脖山” ，也曾这样辉煌过。`;

const diagnosis = ZH_POST_SKILL.analyze({ text: source });
assert.equal(diagnosis.ownership, 'first_party');
assert.equal(diagnosis.allowedPerspective, 'first_person_optional');
assert.ok(diagnosis.speechMoves.includes('repeated_anaphora'));
assert.ok(diagnosis.speechMoves.includes('code_switch'));
assert.ok(diagnosis.speechMoves.includes('self_questioning'));
assert.ok(diagnosis.speechMoves.includes('reversal'));
assert.ok(diagnosis.speechMoves.includes('memory_anchor'));
assert.ok(diagnosis.humanTrace.repeatedOpeners.includes('一样的'));
assert.ok(diagnosis.humanTrace.codeSwitches.includes('or'));
assert.ok(diagnosis.humanTrace.quotedPhrases.includes('歪脖山'));

const prompt = ZH_POST_SKILL.buildCandidateInstruction(
  ZH_POST_SKILL.selectCandidateStrategies(diagnosis)[0],
  diagnosis
);
assert.match(prompt, /口头思路轨迹/);
assert.match(prompt, /一样的/);
assert.match(prompt, /or/);
assert.match(prompt, /歪脖山/);
assert.match(prompt, /不得统一改成标准书面中文/);
assert.match(prompt, /允许停在怀疑、记忆或情绪/);
```

再加入“GPT 每月 200 刀”样本，断言识别 `self_questioning`、`colloquial_emotion` 和 `reality_correction`，但提示不得要求固定使用“哈哈哈”。

- [ ] **Step 2: 运行测试确认 RED**

Run: `node test_chinese_post_human_voice.mjs && node test_chinese_post_skill.mjs`

Expected: `ownership`、`humanTrace`、`speechMoves` 等新字段不存在，测试失败。

- [ ] **Step 3: 实现最小诊断函数**

在 `postStrategies.js` 增加并导出以下纯函数：

```js
function inferContentOwnership(input = {}, text = '') {
  if (['first_party', 'attributed_external', 'unknown'].includes(input?.ownership)) {
    return input.ownership;
  }
  const externalAttribution = /https?:\/\/|来源[：:]|根据.{0,16}(?:公告|报告|研究|对谈)|(?:看到|转发|引用).{0,20}(?:说|写|提到)|@[A-Za-z0-9_]{1,15}/i;
  return externalAttribution.test(text) ? 'attributed_external' : 'first_party';
}

function extractCodeSwitches(text = '') {
  return [...new Set(String(text).match(/\b[A-Za-z][A-Za-z0-9]*\b/g) || [])];
}

function extractQuotedPhrases(text = '') {
  return [...String(text).matchAll(/[“"]([^”"]{1,20})[”"]/g)]
    .map(match => match[1].trim())
    .filter(Boolean);
}
```

实现 `extractRepeatedOpeners(text)`：比较非空行开头的最长公共中文前缀，保留长度 2–6 且至少重复两次的前缀；黄金样本必须返回 `['一样的']`，但不能硬编码只识别“一样的”。

实现 `detectSpeechMoves(text, humanTrace)`，使用素材已有证据返回以下标签：

```js
[
  humanTrace.repeatedOpeners.length ? 'repeated_anaphora' : '',
  humanTrace.codeSwitches.length ? 'code_switch' : '',
  /[？?]|真的.{0,8}(?:么|吗)|没毛病吧/.test(text) ? 'self_questioning' : '',
  (text.match(/(?:^|[\n。！？])\s*(?:但|可是|不过)/g) || []).length ? 'reversal' : '',
  /哈哈|笑死|没毛病|懂不懂|反正|啊|吧|么/.test(text) ? 'colloquial_emotion' : '',
  /实际上|其实|反正|毕竟|少之又少/.test(text) ? 'reality_correction' : '',
  humanTrace.quotedPhrases.length && /当年|曾经|也曾|记得|那座/.test(text) ? 'memory_anchor' : ''
].filter(Boolean)
```

在 `diagnoseChinesePostInput(input)` 中冻结并返回所有新字段。`publishReason` 只描述素材已有理由；禁止生成正文句子。

- [ ] **Step 4: 用诊断结果增强候选提示**

在 `buildChineseCandidateInstruction()` 增加动态段落：

```js
const voiceRule = diagnosis.speechMoves?.length
  ? `口头思路轨迹：${diagnosis.speechMoves.join('、')}。只保留素材已经出现的轨迹，不新增统一口头禅。`
  : '素材没有明显口头动作，不要为了人味强行添加笑、反问或自嘲。';

const preserveRule = [
  ...(diagnosis.humanTrace?.repeatedOpeners || []),
  ...(diagnosis.humanTrace?.codeSwitches || []),
  ...(diagnosis.humanTrace?.quotedPhrases || [])
];
```

提示必须明确：保留这些原始表达；不得统一改成标准书面中文；源文反复和自我怀疑有表达作用时不得去重；正文可以停在怀疑、记忆或情绪，不补宏大结论。

- [ ] **Step 5: 运行测试确认 GREEN**

Run: `node test_chinese_post_human_voice.mjs && node test_chinese_post_skill.mjs`

Expected: 两个脚本退出码 0。

### Task 2: 拦截过度抛光与伪造人味

**Files:**
- Modify: `test_chinese_post_human_voice.mjs`
- Modify: `core/contentSkills/zh/postJudge.js`

**Interfaces:**
- Produces: `sterile_polish`
- Produces: `generic_emotion`
- Produces: `human_trace_dropped`
- Produces: `colloquial_template`

- [ ] **Step 1: 写判断器失败测试**

在黄金样本测试中加入：

```js
const polished = ZH_POST_SKILL.evaluateDeterministically(source, `AI 与 Web3 都是时代浪潮。历史周期滚滚向前，无论人还是科技浪花，能有片刻高光，足矣。`, diagnosis);
assert.ok(polished.issues.includes('sterile_polish'));

const lostQuestion = ZH_POST_SKILL.evaluateDeterministically(source, `AI 与 Web3 有相似的资本和传播结构，但 AI 更实用，因此未来一定会走得更远。`, diagnosis);
assert.ok(lostQuestion.issues.includes('human_trace_dropped'));

const inventedLaugh = ZH_POST_SKILL.evaluateDeterministically('AI 产品今天上线了。', '哈哈哈，AI 产品今天终于上线了！', ZH_POST_SKILL.analyze({ text: 'AI 产品今天上线了。' }));
assert.ok(inventedLaugh.issues.includes('generic_emotion'));

const finalDraft = `感觉 AI 这波，真的好像当年的 Web3 啊。\n\n一样的二级市场 FOMO，几十倍造富效应，一级抢着要额度。\n一样的年轻人入场，想要改变 or 干翻这个世界，新晋富豪更是扎堆。\n一样的主席大大讲话，主会场一票难求，分会场遍地开花。\n一样的自媒体红利，懂不懂先放一边，反正都在教别人怎么上车。\n\n但，还是不一样吧？\n毕竟 AI 可比 Web3 实用太多了。\n\n但，真的不一样么？\n或许那座 “歪脖山” ，也曾这样辉煌过。`;
assert.equal(ZH_POST_SKILL.evaluateDeterministically(source, finalDraft, diagnosis).approved, true);
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `node test_chinese_post_human_voice.mjs`

Expected: 新 issue 断言失败。

- [ ] **Step 3: 实现判断函数**

在 `postJudge.js` 增加：

```js
const STERILE_POLISH_PATTERN = /历史(?:周期|洪流).{0,12}(?:滚滚向前|不可阻挡)|时代浪潮|科技浪花|片刻高光|足矣|终将证明/;
const GENERIC_EMOTION_PATTERN = /哈哈哈|笑死|太离谱了|有点崩|讲真|说实话|兄弟们/;

function hasGenericEmotion(source = '', output = '') {
  const added = String(output).match(GENERIC_EMOTION_PATTERN) || [];
  return added.some(marker => !String(source).includes(marker));
}

function hasHumanTraceDropped(output = '', diagnosis = {}) {
  const text = String(output);
  if (diagnosis.speechMoves?.includes('self_questioning')
      && !/[？?]|可能|或许|未必|不一定|么|吗|吧/.test(text)) return true;
  const openers = diagnosis.humanTrace?.repeatedOpeners || [];
  return openers.some(opener => (text.match(new RegExp(opener, 'g')) || []).length < 2);
}
```

`evaluateChinesePostOutput()` 对应追加 `sterile_polish`、`generic_emotion` 和 `human_trace_dropped`。`colloquial_template` 主要交给独立模型评审：同一篇里出现素材没有提供的连续“哈哈哈—实际上—反转”时列为硬失败。

- [ ] **Step 4: 更新评审与修复提示**

`buildChineseJudgeInstruction()` 必须列出：口头思路轨迹、混合语域、重复列举、个人词、悬而未决结尾；不奖励完整作文，不把语病少等同于自然。

`buildChineseRepairInstruction()` 必须要求恢复素材已有的反问、重复、英文切换和个人记忆点，同时删除素材没有的情绪表演及宏大收尾。

- [ ] **Step 5: 运行测试确认 GREEN**

Run: `node test_chinese_post_human_voice.mjs && node test_chinese_post_skill.mjs`

Expected: 两个脚本退出码 0。

### Task 3: 升级 Skill 版本、集成归因与中文文档

**Files:**
- Modify: `core/contentSkills/zh/postSkill.js`
- Modify: `docs/skills/中文-X-内容创作-Skill.md`
- Modify: `docs/benchmarks/chinese-x-post-skill-v1.md`
- Modify: `scripts/run_chinese_post_benchmark.mjs`
- Modify: `test_chinese_post_skill.mjs`
- Modify: `test_chinese_post_studio_integration.mjs`
- Modify: `test_chinese_post_auto_integration.mjs`
- Modify: `test_chinese_post_benchmark.mjs`
- Modify: `test_content_skill_registry.mjs`
- Modify: `test_generation_loop_integration.mjs`

**Interfaces:**
- Produces: `ZH_POST_SKILL@1.3.0`
- Preserves: Studio 单稿、Auto 可选接入、现有内容归因字段。

- [ ] **Step 1: 把版本断言改成 1.3.0 并确认 RED**

所有当前 `1.2.0` 运行时断言升级为 `1.3.0`；Studio/Auto prompt 新增 `口头思路轨迹` 和 `不得统一改成标准书面中文` 断言。

Run: `node test_chinese_post_benchmark.mjs && node test_chinese_post_studio_integration.mjs && node test_chinese_post_auto_integration.mjs && node test_content_skill_registry.mjs && node test_generation_loop_integration.mjs`

Expected: 版本仍是 1.2.0，测试失败。

- [ ] **Step 2: 升级 Skill 和报告版本**

把 `postSkill.js` 版本改为 `1.3.0`；benchmark 报告标题和运行时元数据同步为 v1.3，不改变 ID `zh-x-post` 或 objectives。

- [ ] **Step 3: 更新中文 Skill 文档**

把 `docs/skills/中文-X-内容创作-Skill.md` 升级为 v1.3，加入：

- 本人信号与外部来源归属；
- 口头思路轨迹而非口头禅；
- 混合语域、重复、反问和个人词的保留规则；
- 用户 AI/Web3 定稿黄金样本；
- `sterile_polish`、`generic_emotion`、`human_trace_dropped`、`colloquial_template`；
- 先由人工审核真实发布意愿，再依赖产品数据。

- [ ] **Step 4: 运行集成测试确认 GREEN**

Run: `node test_chinese_post_benchmark.mjs && node test_chinese_post_studio_integration.mjs && node test_chinese_post_auto_integration.mjs && node test_content_skill_registry.mjs && node test_generation_loop_integration.mjs`

Expected: 五个脚本退出码 0。

### Task 4: 完整验证、提交与推送

**Files:**
- Verify all files above plus the v1.3 design and this plan.

**Interfaces:**
- Produces: 可复现测试证据、提交和最新 `origin/main`。

- [ ] **Step 1: 运行正式测试集**

Run: `node --test $(rg --files -g 'test_*.mjs' | rg -v 'test_export.mjs')`

Expected: 0 failures。

- [ ] **Step 2: 运行扩展入口、语法和差异检查**

Run:

```bash
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('manifest.json','utf8')); const paths=[m.background.service_worker,m.options_page,m.side_panel.default_path,...m.content_scripts.flatMap(x=>x.js),...Object.values(m.icons)]; const missing=paths.filter(p=>!fs.existsSync(p)); if(missing.length) process.exit(1); console.log('manifest entries verified')"
for f in $(rg --files -g '*.js' -g '!node_modules'); do node --check "$f" || exit 1; done
git diff --check
```

Expected: 全部退出码 0。

- [ ] **Step 3: 有意暂存并复核范围**

只暂存本计划列出的实现、测试和文档；运行 `git diff --cached --check`、`git diff --cached --stat` 和 `git status --short`，确认不包含 `.superpowers/`、`fix_test.mjs` 或 `test_export.mjs`。

- [ ] **Step 4: 提交并推送 main**

```bash
git commit -m "feat: preserve human voice in Chinese X skill"
git push origin main
```

Expected: `origin/main` 指向新提交。

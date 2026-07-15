# Chinese X Post Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and benchmark a versioned Chinese X Post Skill for AI, technology, product, indie-building, and creator-business content, then integrate it into Studio Post and Auto Post without affecting other languages or Auto Reply.

**Architecture:** Add a language/format Skill registry and a focused `zh/post` package that performs deterministic diagnosis, selects three eligible strategies, supplies Chinese judge/repair instructions, and evaluates outputs. A 60-fixture benchmark blocks rollout until deterministic quality gates pass; generation sessions record immutable Skill metadata.

**Tech Stack:** JavaScript ES modules, Chrome Extension MV3 storage/runtime APIs, Node.js `assert` test scripts, existing Studio orchestration and LLM adapters.

## Global Constraints

- The shared Skill is versioned and read-only at runtime; user memory never mutates it.
- Studio retains three candidate calls, one independent judge call, and at most one repair call.
- The existing numeric pass threshold remains 82.
- Chinese Post Skill applies only to `studio_rewrite` and `auto_post`; Auto Reply remains isolated.
- Unsupported content and all non-Chinese languages use an explicit generic fallback.
- The benchmark contains at least 60 synthetic or user-owned fixtures, ten per supported content family.
- Rollout requires ≥95% claim preservation, zero unsupported external facts, ≤10% template hits, ≤20% strategy duplication, and ≥65% live blind-comparison wins.
- Missing live credentials report `credentials_required`; they never produce a fabricated win rate.

---

### Task 1: Content Skill registry and immutable metadata

**Files:**
- Create: `core/contentSkills/registry.js`
- Create: `core/contentSkills/zh/postSkill.js`
- Create: `test_content_skill_registry.mjs`

**Interfaces:**
- Produces: `registerContentSkill(skill)`, `resolveContentSkill({ language, format, objective })`, `getRegisteredContentSkills()`, and `ZH_POST_SKILL`.

- [ ] **Step 1: Write the failing registry test**

```js
import assert from 'node:assert/strict';
import { resolveContentSkill } from './core/contentSkills/registry.js';
import './core/contentSkills/zh/postSkill.js';

const skill = resolveContentSkill({ language: 'zh', format: 'post', objective: 'studio_rewrite' });
assert.equal(skill.id, 'zh-x-post');
assert.equal(skill.version, '1.0.0');
assert.equal(Object.isFrozen(skill), true);
assert.equal(resolveContentSkill({ language: 'en', format: 'post', objective: 'studio_rewrite' }), null);
assert.equal(resolveContentSkill({ language: 'zh', format: 'reply', objective: 'auto_relationship' }), null);
```

- [ ] **Step 2: Run the test and verify module-not-found failure**

Run: `node test_content_skill_registry.mjs`

Expected: FAIL because `core/contentSkills/registry.js` does not exist.

- [ ] **Step 3: Implement the registry and frozen Skill shell**

```js
const registry = new Map();
const keyOf = ({ language, format, objective }) => [language, format, objective].join('|');

function registerContentSkill(skill) {
  const frozen = Object.freeze({ ...skill });
  for (const objective of frozen.objectives) {
    registry.set(keyOf({ language: frozen.language, format: frozen.format, objective }), frozen);
  }
  return frozen;
}

function resolveContentSkill(query = {}) {
  return registry.get(keyOf(query)) || null;
}

function getRegisteredContentSkills() {
  return [...new Set(registry.values())];
}
```

Register a `ZH_POST_SKILL` shell with language `zh`, format `post`, objectives `studio_rewrite` and `auto_post`, and version `1.0.0`.

- [ ] **Step 4: Run registry and schema tests**

Run: `node test_content_skill_registry.mjs && node test_storage_schema_v4.mjs`

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add core/contentSkills/registry.js core/contentSkills/zh/postSkill.js test_content_skill_registry.mjs
git commit -m "feat: add content skill registry"
```

---

### Task 2: Chinese diagnosis, strategy routing, and judge contract

**Files:**
- Create: `core/contentSkills/zh/postStrategies.js`
- Create: `core/contentSkills/zh/postJudge.js`
- Modify: `core/contentSkills/zh/postSkill.js`
- Create: `test_chinese_post_skill.mjs`

**Interfaces:**
- Produces: `SUPPORTED_CHINESE_POST_FAMILIES`, `diagnoseChinesePostInput(input)`, `selectChinesePostStrategies(diagnosis)`, `buildChineseCandidateInstruction(strategy, diagnosis)`, `buildChineseJudgeInstruction(diagnosis)`, `buildChineseRepairInstruction(diagnosis, failures)`, `evaluateChinesePostOutput(source, output, diagnosis)`.

- [ ] **Step 1: Write failing routing tests**

```js
const observation = skill.analyze({ text: '试了三个 AI 写作工具，最后留下来的不是功能最多的，而是每周复盘时不用重新教一遍背景的那个。' });
assert.equal(observation.family, 'tool_experience');
assert.equal(observation.hasFirstPersonExperience, true);
assert.equal(observation.forbiddenStructures.includes('invented_experience'), true);

const uncertain = skill.analyze({ text: '我怀疑很多 AI 产品的问题不是模型不够强，而是用户根本没有第二次打开的理由。' });
assert.equal(uncertain.certainty, 'uncertain');
assert.equal(uncertain.forbiddenStructures.includes('certainty_escalation'), true);

const strategies = skill.selectCandidateStrategies(uncertain);
assert.equal(strategies.length, 3);
assert.equal(new Set(strategies.map(item => item.id)).size, 3);
assert.equal(strategies.some(item => item.id === 'competition_bet'), false);
```

Add one routing case for each family: `product_observation`, `tool_experience`, `build_in_public`, `failure_retrospective`, `industry_opinion`, and `workflow_framework`.

- [ ] **Step 2: Run and confirm missing-method failures**

Run: `node test_chinese_post_skill.mjs`

Expected: FAIL because the Skill shell has no diagnosis or strategy methods.

- [ ] **Step 3: Implement deterministic diagnosis and strategy selection**

Diagnosis uses explicit Chinese lexical and structural signals, never an extra model call. It returns:

```js
{
  supported: true,
  family: 'product_observation',
  certainty: 'uncertain',
  hasFirstPersonExperience: false,
  entities: [],
  numbers: [],
  concreteSignals: [],
  recommendedStructures: ['faithful_sharpening', 'cognitive_reframe'],
  forbiddenStructures: ['invented_experience', 'certainty_escalation', 'competition_bet'],
  targetLength: { minRatio: 0.55, maxRatio: 1.35 },
  fallbackReason: ''
}
```

The three strategy IDs are `faithful_sharpening`, `cognitive_reframe`, and `concrete_scene`. Substitute `structured_framework` when the input contains at least two explicit steps; substitute `progress_log` for build-in-public inputs with supplied progress evidence.

- [ ] **Step 4: Implement Chinese judge and deterministic hard failures**

Judge JSON contract:

```json
{
  "selectedCandidateId": "candidate-a",
  "scores": [{
    "id": "candidate-a",
    "total": 0,
    "fidelity": 0,
    "specificity": 0,
    "naturalness": 0,
    "hook": 0,
    "audienceValue": 0,
    "hardFailures": []
  }],
  "rationale": ""
}
```

Deterministic issues include `unsupported_number`, `unsupported_entity`, `certainty_escalation`, `invented_first_person`, `template_tone`, `excessive_expansion`, `strategy_mismatch`, and `candidate_duplication`.

- [ ] **Step 5: Run focused tests**

Run: `node test_chinese_post_skill.mjs && node test_studio_quality.mjs && node test_rewrite_prompts.mjs`

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add core/contentSkills/zh/postSkill.js core/contentSkills/zh/postStrategies.js core/contentSkills/zh/postJudge.js test_chinese_post_skill.mjs
git commit -m "feat: add Chinese post strategy skill"
```

---

### Task 3: Sixty-fixture benchmark and measurable report

**Files:**
- Create: `benchmarks/chinesePostFixtures.js`
- Create: `core/contentSkills/zh/postBenchmark.js`
- Create: `scripts/run_chinese_post_benchmark.mjs`
- Create: `test_chinese_post_benchmark.mjs`

**Interfaces:**
- Produces: `CHINESE_POST_FIXTURES`, `evaluateChinesePostBenchmark(fixtures, outputs)`, `compareBlindResults(currentResults, skillResults, judgments)`, and a CLI JSON report.

- [ ] **Step 1: Write failing dataset and metric tests**

```js
assert.equal(CHINESE_POST_FIXTURES.length, 60);
for (const family of SUPPORTED_CHINESE_POST_FAMILIES) {
  assert.equal(CHINESE_POST_FIXTURES.filter(item => item.family === family).length, 10);
}

const report = evaluateChinesePostBenchmark([fixture], [{ fixtureId: fixture.id, candidates: outputs }]);
assert.equal(report.fixtureCount, 1);
assert.equal(report.unsupportedFactCount, 0);
assert.equal(report.claimPreservationRate, 1);
assert.equal(report.templateHitRate, 0);
assert.equal(report.strategyDuplicationRate, 0);
```

- [ ] **Step 2: Run and confirm missing-module failure**

Run: `node test_chinese_post_benchmark.mjs`

Expected: FAIL because the benchmark modules do not exist.

- [ ] **Step 3: Add 60 unique fixtures**

Each fixture uses this exact schema:

```js
{
  id: 'product-observation-01',
  family: 'product_observation',
  input: '很多 AI 产品第一次打开很惊艳，但第二次使用还要重新解释背景。真正影响留存的可能不是功能数量，而是上下文能不能接上。',
  requiredClaims: ['影响重复使用的是上下文连续性，而非单纯功能数量'],
  requiredTerms: ['AI 产品', '上下文'],
  allowedNumbers: [],
  allowedEntities: [],
  certainty: 'uncertain',
  hasFirstPersonExperience: false,
  forbiddenStructures: ['invented_experience', 'certainty_escalation', 'competition_bet'],
  maxExpansionRatio: 1.35
}
```

Create ten individually written fixtures for every supported family. At least two per family must be adversarial: thin input, uncertainty, unsupported number, extraction error, excessive-expansion risk, or marketing-template risk.

- [ ] **Step 4: Implement aggregate deterministic metrics**

The report returns counts and ratios, never a subjective success claim:

```js
{
  fixtureCount,
  candidateCount,
  claimPreservationRate,
  unsupportedFactCount,
  certaintyEscalationRate,
  templateHitRate,
  expansionViolationRate,
  strategyDuplicationRate,
  familyRoutingAccuracy,
  releaseGate: { deterministicPassed, failures }
}
```

- [ ] **Step 5: Implement the CLI**

`node scripts/run_chinese_post_benchmark.mjs --outputs path/to/outputs.json` evaluates existing outputs. Without `--outputs`, it evaluates routing and fixture integrity and prints `liveBlindComparison.status = "credentials_required"`.

- [ ] **Step 6: Run benchmark tests and fixture integrity**

Run: `node test_chinese_post_benchmark.mjs && node scripts/run_chinese_post_benchmark.mjs`

Expected: tests PASS; CLI prints valid JSON with `fixtureCount: 60` and does not invent a live win rate.

- [ ] **Step 7: Commit**

```bash
git add benchmarks/chinesePostFixtures.js core/contentSkills/zh/postBenchmark.js scripts/run_chinese_post_benchmark.mjs test_chinese_post_benchmark.mjs
git commit -m "test: add Chinese post skill benchmark"
```

---

### Task 4: Studio Post orchestration and immutable Skill attribution

**Files:**
- Modify: `core/studioGeneration.js`
- Modify: `core/studioPrompt.js`
- Modify: `core/generationAttribution.js`
- Modify: `handlers/llmHandler.js`
- Modify: `background.js`
- Modify: `test_studio_generation.mjs`
- Modify: `test_studio_session_flow.mjs`
- Create: `test_chinese_post_studio_integration.mjs`

**Interfaces:**
- Consumes: `resolveContentSkill`, `ZH_POST_SKILL` methods.
- Produces: Studio results and generation sessions containing `contentSkillId`, `contentSkillVersion`, `contentFamily`, and `candidateStrategyIds`.

- [ ] **Step 1: Write failing Chinese Studio integration tests**

```js
assert.deepEqual(result.candidates.map(item => item.strategyId), [
  'faithful_sharpening',
  'cognitive_reframe',
  'concrete_scene'
]);
assert.equal(result.contentSkill.id, 'zh-x-post');
assert.equal(result.contentSkill.version, '1.0.0');
assert.match(model.calls[3], /自然中文 X 表达/);
assert.equal(session.contentSkillId, 'zh-x-post');
assert.equal(session.contentSkillVersion, '1.0.0');
```

Also assert English generation has no Chinese Skill metadata and Auto Reply never resolves `zh/post`.

- [ ] **Step 2: Run and verify failures**

Run: `node test_chinese_post_studio_integration.mjs`

Expected: FAIL because Studio does not resolve or store content Skills.

- [ ] **Step 3: Resolve the Skill in the handler and pass it to orchestration**

After language normalization:

```js
const contentSkill = resolveContentSkill({
  language: config.engineLanguage,
  format: 'post',
  objective: 'studio_rewrite'
});
```

Only `viral_rewrite` receives this Skill. `draft_reply` passes `null`.

Read `contentSkillRollout` from storage with default `{ zhPost: false }`. Resolve the Skill only when `contentSkillRollout.zhPost === true`; benchmark and integration tests set the flag explicitly. Add the default on install without changing existing user configuration.

- [ ] **Step 4: Use Skill diagnosis and strategy instructions**

`orchestrateStudioGeneration` accepts `contentSkill`; it computes diagnosis once locally, replaces generic briefs with Skill strategies, includes the Skill judge instruction, merges deterministic Skill hard failures, and preserves the five-call maximum.

- [ ] **Step 5: Persist immutable Skill metadata**

`buildStudioSessionFromResult` stores Skill ID/version, family, and candidate strategy IDs. Editing or selecting another candidate cannot change these fields.

- [ ] **Step 6: Run Studio regression**

Run: `node test_chinese_post_studio_integration.mjs && node test_studio_generation.mjs && node test_studio_session_flow.mjs && node test_studio_multilingual_eval.mjs`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add core/studioGeneration.js core/studioPrompt.js core/generationAttribution.js handlers/llmHandler.js background.js test_studio_generation.mjs test_studio_session_flow.mjs test_chinese_post_studio_integration.mjs
git commit -m "feat: use Chinese post skill in Studio"
```

---

### Task 5: Auto Post integration without reply leakage

**Files:**
- Modify: `core/automation.js`
- Modify: `core/generationContext.js`
- Modify: `test_automation_generation.mjs`
- Modify: `test_loop_context.mjs`
- Create: `test_chinese_post_auto_integration.mjs`

**Interfaces:**
- Consumes: `resolveContentSkill({ language: 'zh', format: 'post', objective: 'auto_post' })`.
- Produces: Auto Post prompts with the same Skill baseline and objective-isolated user overlays.

- [ ] **Step 1: Write failing Auto isolation tests**

```js
assert.match(autoPostPrompt, /zh-x-post@1\.0\.0/);
assert.match(autoPostPrompt, /中文 X 内容诊断/);
assert.doesNotMatch(autoReplyPrompt, /zh-x-post|中文 X 内容诊断/);
assert.doesNotMatch(autoPostPrompt, /studio_reply|auto_relationship/);
```

- [ ] **Step 2: Run and verify the prompt lacks Skill context**

Run: `node test_chinese_post_auto_integration.mjs`

Expected: FAIL on missing Skill marker.

- [ ] **Step 3: Resolve and inject the Skill into Auto Post only**

`generateSingleTweetDraft` resolves `auto_post` after engine-language normalization and passes diagnosis, strategy rules, Chinese judge rubric, and Skill version to the existing Auto generation/review pipeline. Do not change `generateAIResponse` or the relationship prompt.

- [ ] **Step 4: Record the Skill on generated Auto records**

Auto draft records include `contentSkillId`, `contentSkillVersion`, and `contentFamily` before publishing and preserve them through X synchronization.

- [ ] **Step 5: Run Auto and context tests**

Run: `node test_chinese_post_auto_integration.mjs && node test_automation_generation.mjs && node test_loop_context.mjs && node test_relationship_loop.mjs`

Expected: all PASS and no Post Skill marker appears in reply prompts.

- [ ] **Step 6: Commit**

```bash
git add core/automation.js core/generationContext.js test_automation_generation.mjs test_loop_context.mjs test_chinese_post_auto_integration.mjs
git commit -m "feat: use Chinese post skill in Auto"
```

---

### Task 6: Release report, full regression, and live-data handoff

**Files:**
- Modify: `scripts/run_chinese_post_benchmark.mjs`
- Create: `docs/benchmarks/chinese-x-post-skill-v1.md`
- Modify: `test_generation_loop_integration.mjs`

**Interfaces:**
- Produces: a reproducible benchmark report with deterministic metrics, live-blind status, Skill version, commit, and explicit release decision.

- [ ] **Step 1: Add release-decision integration assertions**

```js
assert.equal(report.skillId, 'zh-x-post');
assert.equal(report.skillVersion, '1.0.0');
assert.equal(typeof report.releaseGate.deterministicPassed, 'boolean');
assert.ok(['passed', 'failed', 'credentials_required'].includes(report.liveBlindComparison.status));
assert.equal(report.liveBlindComparison.winRate ?? null, null);
```

The last assertion applies when status is `credentials_required`.

- [ ] **Step 2: Generate the deterministic benchmark report**

Run: `node scripts/run_chinese_post_benchmark.mjs --report docs/benchmarks/chinese-x-post-skill-v1.md`

Expected: report contains fixture counts, every deterministic metric, failures by fixture ID, and an honest live-comparison status.

- [ ] **Step 3: Run every formal test except the known baseline experiment**

Run:

```bash
for file in test_*.mjs; do
  if [ "$file" = "test_export.mjs" ]; then continue; fi
  node "$file" || exit 1
done
```

Expected: all formal tests PASS. `test_export.mjs` remains excluded because it is the repository's pre-existing intentionally invalid export experiment.

- [ ] **Step 4: Run all JavaScript syntax checks**

Run:

```bash
for file in background.js core/*.js core/contentSkills/*.js core/contentSkills/zh/*.js handlers/*.js options/*.js options/ui/*.js content/*.js content/logic/*.js scripts/*.mjs; do
  node --check "$file" || exit 1
done
```

Expected: every file parses.

- [ ] **Step 5: Inspect diff and benchmark claims**

Run: `git diff --check && git status --short --branch`

Expected: no whitespace errors; only intended Skill, benchmark, integration, test, and report files are changed. User-owned `fix_test.mjs` and `.superpowers/` remain untracked and untouched.

- [ ] **Step 6: Commit**

```bash
git add scripts/run_chinese_post_benchmark.mjs docs/benchmarks/chinese-x-post-skill-v1.md test_generation_loop_integration.mjs
git commit -m "test: report Chinese post skill quality"
```

## Execution Decision

The user explicitly requested direct execution and outcome-based reporting. Execute inline in this session with `superpowers:executing-plans`; do not pause for document review or offer subagent execution.

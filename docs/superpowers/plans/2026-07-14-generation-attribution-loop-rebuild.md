# Generation, Attribution, and Loop Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver quality-first Studio generation, reliable Studio-to-X attribution, evidence-gated Loop learning, and relationship-oriented Auto reply memory.

**Architecture:** Add four pure core modules for Studio orchestration, attribution, learning policy, and relationship aggregation. Chrome handlers and UI remain adapters. Storage schema v4 separates objectives and rule states while preserving existing posts and explicit user feedback.

**Tech Stack:** Chrome Manifest V3, JavaScript ES modules, `chrome.storage.local`, Node.js `assert` test scripts, existing provider-agnostic `callLLM` adapter.

## Global Constraints

- Studio never publishes automatically; Auto remains opt-in.
- Viral Rewrite uses three candidate calls, one judge call, and at most one repair call.
- Draft Reply uses two candidate calls, one judge call, and at most one repair call.
- Passing score is 82 with no hard failure.
- Five comparable observations can create a candidate rule; eight can activate it automatically.
- Only active, unexpired, same-objective, same-mode, same-language rules enter prompts.
- Auto relationship learning never uses views as success.
- Existing data is migrated without deletion.

---

### Task 1: Storage schema v4 and migration

**Files:**
- Create: `test_storage_schema_v4.mjs`
- Modify: `core/storageSchema.js`
- Modify: `background.js:35-55`

**Interfaces:**
- Produces: `LEARNING_OBJECTIVE`, `RULE_STATE`, `normalizeGenerationSession`, `migrateStoragePayload`.

- [ ] **Step 1: Write the failing migration test**

```js
import assert from 'node:assert/strict';
import { LEARNING_OBJECTIVE, RULE_STATE, STORAGE_SCHEMA_VERSION, migrateStoragePayload } from './core/storageSchema.js';

const migrated = migrateStoragePayload({
  storageSchemaVersion: 3,
  draftVault: [
    { id: 'manual', text: 'draft', origin: 'manual_rewrite', contentMode: 'rewrite' },
    { id: 'auto', text: 'post', origin: 'auto_generated', contentMode: 'post' }
  ],
  aiMemory: { learnedRules: [{ text: 'legacy rule', contentMode: 'post', confidence: 95 }] }
});

assert.equal(STORAGE_SCHEMA_VERSION, 4);
assert.equal(migrated.draftVault[0].objective, LEARNING_OBJECTIVE.STUDIO_REWRITE);
assert.equal(migrated.draftVault[1].objective, LEARNING_OBJECTIVE.AUTO_POST);
assert.equal(migrated.aiMemory.learnedRules[0].ruleState, RULE_STATE.LEGACY);
assert.equal(migrated.aiMemory.learnedRules[0].active, false);
assert.deepEqual(migrated.generationSessions, []);
assert.deepEqual(migrated.relationshipInteractions, []);
```

- [ ] **Step 2: Run and confirm the intended failure**

Run: `node test_storage_schema_v4.mjs`

Expected: FAIL because schema v4 exports do not exist.

- [ ] **Step 3: Implement objective and rule-state normalization**

```js
const LEARNING_OBJECTIVE = {
  STUDIO_REWRITE: 'studio_rewrite',
  STUDIO_REPLY: 'studio_reply',
  AUTO_POST: 'auto_post',
  AUTO_RELATIONSHIP: 'auto_relationship'
};
const RULE_STATE = {
  CANDIDATE: 'candidate', ACTIVE: 'active', DEMOTED: 'demoted',
  EXPIRED: 'expired', LEGACY: 'legacy'
};
const STORAGE_SCHEMA_VERSION = 4;

function inferObjective(item = {}) {
  if (item.objective) return item.objective;
  if (item.contentMode === POST_CONTENT_MODE.REPLY) return LEARNING_OBJECTIVE.AUTO_RELATIONSHIP;
  if (item.origin === POST_ORIGIN.AUTO_GENERATED) return LEARNING_OBJECTIVE.AUTO_POST;
  return LEARNING_OBJECTIVE.STUDIO_REWRITE;
}

function normalizeGenerationSession(session = {}) {
  return {
    ...session,
    id: String(session.id || `gen-${Date.now()}`),
    candidates: Array.isArray(session.candidates) ? session.candidates.slice(0, 3) : [],
    selectedText: String(session.selectedText || ''),
    finalText: String(session.finalText || session.selectedText || ''),
    createdAt: Number(session.createdAt) || Date.now(),
    updatedAt: Number(session.updatedAt) || Date.now(),
    publication: session.publication || null
  };
}

function migrateStoragePayload(payload = {}) {
  const draftVault = (Array.isArray(payload.draftVault) ? payload.draftVault : [])
    .map(item => normalizePostRecord({ ...item, objective: inferObjective(item) }));
  const memory = normalizeAiMemory(payload.aiMemory || {});
  return {
    ...payload,
    storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    draftVault,
    generationSessions: (payload.generationSessions || []).map(normalizeGenerationSession).slice(0, 100),
    relationshipInteractions: (payload.relationshipInteractions || []).slice(0, 300),
    aiMemory: {
      ...memory,
      learnedRules: memory.learnedRules.map(rule => ({
        ...rule,
        ruleState: rule.ruleState || RULE_STATE.LEGACY,
        active: rule.ruleState === RULE_STATE.ACTIVE
      }))
    }
  };
}
```

Change startup migration to load and persist all v4 fields through `migrateStoragePayload`.

```js
chrome.storage.local.get([
  'storageSchemaVersion', 'draftVault', 'aiMemory',
  'generationSessions', 'relationshipInteractions'
], current => {
  if (Number(current.storageSchemaVersion) >= STORAGE_SCHEMA_VERSION) return;
  chrome.storage.local.set(migrateStoragePayload(current), () => {
    addLog('info', 'storage_migrated', [STORAGE_SCHEMA_VERSION]);
  });
});
```

- [ ] **Step 4: Verify migration and existing context behavior**

Run: `node test_storage_schema_v4.mjs && node test_loop_context.mjs`

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add core/storageSchema.js background.js test_storage_schema_v4.mjs
git commit -m "feat: add objective-aware storage schema"
```

---

### Task 2: Evidence-gated learning policy

**Files:**
- Create: `core/learningPolicy.js`
- Create: `test_learning_policy.mjs`
- Modify: `core/performanceLoop.js`
- Modify: `core/generationContext.js`
- Modify: `test_performance_loop.mjs`
- Modify: `test_loop_context.mjs`

**Interfaces:**
- Produces: `buildPerformanceObservation`, `deriveLearningRules`, `selectActiveRules`.

- [ ] **Step 1: Write failing sample-gate and cohort tests**

```js
import assert from 'node:assert/strict';
import { deriveLearningRules, selectActiveRules } from './core/learningPolicy.js';

const base = { objective: 'studio_rewrite', contentMode: 'rewrite', engineLanguage: 'en', featureKey: 'short_opinion|specific|growth' };
const observations = count => Array.from({ length: count }, (_, index) => ({
  ...base, id: `obs-${index}`, direction: index < Math.ceil(count * 0.75) ? 'positive' : 'negative',
  liftRatio: index < Math.ceil(count * 0.75) ? 0.3 : -0.25, observedAt: 1700000000000 + index
}));

assert.deepEqual(deriveLearningRules(observations(4), []), []);
assert.equal(deriveLearningRules(observations(5), [])[0].ruleState, 'candidate');
const active = deriveLearningRules(observations(8), [])[0];
assert.equal(active.ruleState, 'active');
assert.equal(active.active, true);
assert.equal(selectActiveRules([active], { ...base, objective: 'auto_post' }).length, 0);
assert.equal(selectActiveRules([active], base).length, 1);
```

- [ ] **Step 2: Run and confirm module-not-found**

Run: `node test_learning_policy.mjs`

Expected: FAIL because `learningPolicy.js` is absent.

- [ ] **Step 3: Implement evidence gates and association wording**

```js
import { RULE_STATE } from './storageSchema.js';

const DAY_MS = 86400000;
const sameCohort = (a = {}, b = {}) => a.objective === b.objective
  && a.contentMode === b.contentMode && a.engineLanguage === b.engineLanguage;
const median = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
};

function deriveLearningRules(observations = [], existingRules = [], now = Date.now()) {
  const groups = new Map();
  observations.forEach(item => {
    const key = [item.objective, item.contentMode, item.engineLanguage, item.featureKey].join('|');
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return [...groups.entries()].flatMap(([key, group]) => {
    if (group.length < 5) return [];
    const directional = group.filter(item => item.direction !== 'neutral');
    const positive = directional.filter(item => item.direction === 'positive').length;
    const negative = directional.length - positive;
    const consistency = directional.length ? Math.max(positive, negative) / directional.length : 0;
    const effect = median(directional.map(item => Math.abs(item.liftRatio)));
    if (consistency < 0.7 || effect < 0.2) return [];
    const [objective, contentMode, engineLanguage, featureKey] = key.split('|');
    const ruleState = group.length >= 8 ? RULE_STATE.ACTIVE : RULE_STATE.CANDIDATE;
    const direction = positive >= negative ? 'higher' : 'lower';
    return [{
      id: `rule-${key}`, objective, contentMode, engineLanguage, featureKey,
      text: `In comparable ${engineLanguage} ${objective} content, ${featureKey} was associated with ${direction} performance.`,
      sampleCount: group.length, consistency, medianEffect: effect,
      ruleState, active: ruleState === RULE_STATE.ACTIVE,
      updatedAt: Math.max(...group.map(item => item.observedAt || 0)),
      expiresAt: now + 90 * DAY_MS
    }];
  });
}

function selectActiveRules(rules = [], context = {}, now = Date.now()) {
  return rules.filter(rule => rule.ruleState === RULE_STATE.ACTIVE && rule.active
    && Number(rule.expiresAt) > now && sameCohort(rule, context));
}
```

Add `buildPerformanceObservation` with same-objective/mode/language cohorts, minimum cohort size five, and normalized views/likes/replies/reposts/bookmarks. Replace causal `aiLearning` sentences. Make generation context retrieve only `selectActiveRules` results.

```js
function buildPerformanceObservation(item = {}, metrics = {}, prior = []) {
  const cohort = prior.filter(entry => sameCohort(item, entry)).slice(0, 50);
  const keys = ['views', 'likes', 'replies', 'reposts', 'bookmarks'];
  const baseline = Object.fromEntries(keys.map(key => [key, median(cohort.map(entry => Number(entry.metrics?.[key]) || 0))]));
  const weighted = value => keys.reduce((sum, key, index) => {
    const weights = [1, 2, 3, 4, 4];
    return sum + weights[index] * ((Number(value[key]) || 0) / Math.max(1, baseline[key] || 1));
  }, 0);
  const score = weighted(metrics);
  const baselineScore = median(cohort.map(entry => weighted(entry.metrics || {})));
  const liftRatio = baselineScore > 0 ? (score - baselineScore) / baselineScore : 0;
  return {
    id: `obs-${item.id}-${Date.now()}`,
    sourceId: item.id,
    objective: item.objective,
    contentMode: item.contentMode,
    engineLanguage: item.engineLanguage || item.language || 'unknown',
    featureKey: item.featureKey,
    metrics,
    cohortSize: cohort.length,
    score,
    liftRatio,
    direction: liftRatio >= 0.2 ? 'positive' : liftRatio <= -0.2 ? 'negative' : 'neutral',
    relativePerformance: cohort.length < 5 ? 'insufficient_data' : liftRatio >= 0.2 ? 'above_cohort' : liftRatio <= -0.2 ? 'below_cohort' : 'normal',
    observedAt: Date.now()
  };
}
```

- [ ] **Step 4: Verify policy integration**

Run: `node test_learning_policy.mjs && node test_performance_loop.mjs && node test_loop_context.mjs`

Expected: all PASS; one weak sample creates no prompt rule.

- [ ] **Step 5: Commit**

```bash
git add core/learningPolicy.js core/performanceLoop.js core/generationContext.js test_learning_policy.mjs test_performance_loop.mjs test_loop_context.mjs
git commit -m "feat: gate loop learning on comparable evidence"
```

---

### Task 3: Generation sessions and conservative X attribution

**Files:**
- Create: `core/generationAttribution.js`
- Create: `test_generation_attribution.mjs`
- Modify: `background.js:870-1010`
- Modify: `options/options.js`
- Modify: `options/ui/settings.js`

**Interfaces:**
- Produces: `createGenerationSession`, `updateGenerationSessionText`, `findGenerationMatch`, `mergeAttributedPost`, `buildVaultRecordFromSession`.

- [ ] **Step 1: Write failing immutable-session and matcher tests**

```js
import assert from 'node:assert/strict';
import { createGenerationSession, updateGenerationSessionText, findGenerationMatch, mergeAttributedPost } from './core/generationAttribution.js';

const now = 1700000000000;
const session = createGenerationSession({ id: 'gen-1', promptType: 'viral_rewrite', inputText: 'raw', selectedText: 'The workflow is the product.', engineLanguage: 'en', createdAt: now });
const edited = updateGenerationSessionText(session, 'The repeated workflow is the real product.', now + 10);
assert.equal(session.finalText, 'The workflow is the product.');
assert.equal(edited.finalText, 'The repeated workflow is the real product.');

const match = findGenerationMatch({ text: edited.finalText, language: 'en' }, [{ ...edited, copiedAt: now + 20 }], { now: now + 30 });
assert.equal(match.session.id, 'gen-1');
assert.equal(match.method, 'exact_final');

const merged = mergeAttributedPost({ id: 'manual', generationId: 'gen-1', text: edited.finalText, status: 'draft' }, { statusId: '123', postUrl: 'https://x.com/u/status/123', text: edited.finalText, createdAt: now + 100 });
assert.equal(merged.statusId, '123');
assert.equal(merged.status, 'published');
```

- [ ] **Step 2: Run and confirm module-not-found**

Run: `node test_generation_attribution.mjs`

Expected: FAIL because the attribution module is absent.

- [ ] **Step 3: Implement session lifecycle and matching**

```js
const WINDOW_MS = 7 * 86400000;
const normalizeText = text => String(text || '').normalize('NFKC')
  .replace(/https?:\/\/t\.co\/\S+/gi, '').replace(/\s+/g, ' ').trim();

function createGenerationSession(input = {}) {
  return {
    ...input,
    id: input.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    objective: input.promptType === 'draft_reply' ? 'studio_reply' : 'studio_rewrite',
    candidates: (input.candidates || []).slice(0, 3),
    selectedText: String(input.selectedText || ''),
    finalText: String(input.finalText || input.selectedText || ''),
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Number(input.updatedAt) || Number(input.createdAt) || Date.now(),
    publication: null
  };
}

function updateGenerationSessionText(session, finalText, now = Date.now()) {
  return { ...session, finalText: String(finalText || '').trim(), updatedAt: now };
}

function bigramSimilarity(left = '', right = '') {
  const make = value => {
    const set = new Set();
    if (value.length < 2) return new Set(value ? [value] : []);
    for (let index = 0; index < value.length - 1; index += 1) set.add(value.slice(index, index + 2));
    return set;
  };
  const a = make(left);
  const b = make(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(value => b.has(value)).length;
  return (2 * intersection) / (a.size + b.size);
}

function findGenerationMatch(post = {}, sessions = [], { now = Date.now(), fuzzyThreshold = 0.92, ambiguityGap = 0.05 } = {}) {
  const eligible = sessions.filter(item => !item.publication
    && Number(item.copiedAt || item.savedAt) > 0
    && now - Number(item.copiedAt || item.savedAt) <= WINDOW_MS
    && (!post.language || !item.engineLanguage || post.language === item.engineLanguage));
  const target = normalizeText(post.text);
  const exactFinal = eligible.find(item => normalizeText(item.finalText) === target);
  if (exactFinal) return { session: exactFinal, method: 'exact_final', score: 1 };
  const exactSelected = eligible.find(item => normalizeText(item.selectedText) === target);
  if (exactSelected) return { session: exactSelected, method: 'exact_selected', score: 1 };
  const ranked = eligible.map(session => ({ session, score: bigramSimilarity(target, normalizeText(session.finalText)) })).sort((a, b) => b.score - a.score);
  if (!ranked[0] || ranked[0].score < fuzzyThreshold) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < ambiguityGap) return null;
  return { ...ranked[0], method: 'fuzzy_final' };
}
```

Implement `bigramSimilarity`, unique-status merge, and vault record creation preserving `generationId`, input source, selected model text, and edited final text. Match synced X posts before inserting independent records.

```js
function mergeAttributedPost(draft = {}, synced = {}) {
  return normalizePostRecord({
    ...draft,
    text: synced.text || draft.text,
    statusId: synced.statusId || draft.statusId || '',
    postUrl: synced.postUrl || draft.postUrl || '',
    publishedAt: synced.createdAt || synced.publishedAt || draft.publishedAt || Date.now(),
    actualViews: synced.actualViews || draft.actualViews || 0,
    performanceMetrics: { ...(draft.performanceMetrics || {}), ...(synced.performanceMetrics || {}) },
    status: Number(synced.actualViews || synced.performanceMetrics?.views) > 0 ? 'reviewed' : 'published',
    attributedAt: Date.now()
  });
}

function buildVaultRecordFromSession(session = {}) {
  return normalizePostRecord({
    id: `manual-${session.id}`,
    generationId: session.id,
    text: session.finalText,
    originalAIOutput: session.selectedText,
    source: session.inputText,
    objective: session.objective,
    contentMode: session.promptType === 'draft_reply' ? 'reply' : 'rewrite',
    origin: 'manual_rewrite',
    status: 'draft',
    savedAt: session.savedAt || Date.now()
  });
}
```

- [ ] **Step 4: Verify attribution**

Run: `node test_generation_attribution.mjs && node test_performance_loop.mjs`

Expected: both PASS, including ambiguous-match rejection.

- [ ] **Step 5: Commit**

```bash
git add core/generationAttribution.js background.js options/options.js options/ui/settings.js test_generation_attribution.mjs
git commit -m "feat: attribute studio generations to X posts"
```

---

### Task 4: Quality-first Studio orchestrator

**Files:**
- Create: `core/studioGeneration.js`
- Create: `test_studio_generation.mjs`
- Modify: `core/studioQuality.js`
- Modify: `core/studioPrompt.js`
- Modify: `core/rewritePrompts.js`

**Interfaces:**
- Produces: `orchestrateStudioGeneration(input, { callModel })`.

- [ ] **Step 1: Write failing candidate/judge/repair tests**

```js
import assert from 'node:assert/strict';
import { orchestrateStudioGeneration } from './core/studioGeneration.js';

const outputs = [
  'Weak generic output.',
  'The demo is not the product. The workflow people repeat is.',
  'A product becomes real when the boring workflow gets repeated.',
  JSON.stringify({ selectedCandidateId: 'candidate-b', scores: [
    { id: 'candidate-a', total: 55, hardFailures: [] },
    { id: 'candidate-b', total: 90, hardFailures: [] },
    { id: 'candidate-c', total: 84, hardFailures: [] }
  ], rationale: 'Candidate B preserves the claim.' })
];
let calls = 0;
const result = await orchestrateStudioGeneration({ promptType: 'viral_rewrite', sourceText: 'Demos do not matter if nobody repeats the workflow.', engineLanguage: 'en', generationContext: {} }, { callModel: async () => outputs[calls++] });
assert.equal(calls, 4);
assert.equal(result.selectedCandidateId, 'candidate-b');
assert.equal(result.text, outputs[1]);
assert.equal(result.quality.approved, true);
```

Add separate cases for one failed provider call, judge score below 82 invoking exactly one repair, invalid judge JSON, and all candidate calls failing.

```js
await assert.rejects(
  () => orchestrateStudioGeneration({ promptType: 'viral_rewrite', sourceText: 'source', engineLanguage: 'en' }, {
    callModel: async () => { throw new Error('provider timeout'); }
  }),
  /All Studio candidate calls failed/
);

let repairCalls = 0;
const repaired = await orchestrateStudioGeneration({ promptType: 'draft_reply', sourceText: 'Original post', engineLanguage: 'en' }, {
  callModel: async () => {
    repairCalls += 1;
    if (repairCalls <= 2) return `Reply ${repairCalls}`;
    if (repairCalls === 3) return JSON.stringify({ selectedCandidateId: 'candidate-a', scores: [{ id: 'candidate-a', total: 70, hardFailures: [] }], rationale: 'too generic' });
    return 'A repaired reply with one specific relevant observation.';
  }
});
assert.equal(repairCalls, 4);
assert.equal(repaired.repaired, true);
```

- [ ] **Step 2: Run and confirm module-not-found**

Run: `node test_studio_generation.mjs`

Expected: FAIL because `studioGeneration.js` is absent.

- [ ] **Step 3: Implement orchestration**

```js
const PASS_SCORE = 82;
const REWRITE_BRIEFS = [
  'Faithful compression with a concrete first-line hook.',
  'Contrast or variable reversal without changing the claim.',
  'Natural observation or short narrative without adding facts.'
];
const REPLY_BRIEFS = [
  'One specific relevant observation with conversational value.',
  'A different concrete angle without repeating the source.'
];

function buildCandidatePrompt(input, brief, index) {
  return buildStudioPrompt({
    promptType: input.promptType,
    textToProcess: input.sourceText,
    generationContext: input.generationContext || {},
    config: input.config || {},
    langConstraint: getLanguageInstruction(input.engineLanguage, input.promptType === 'draft_reply' ? 'output' : 'rewrite'),
    candidateBrief: `${index + 1}. ${brief}`,
    includePerformanceMemory: true,
    includeTopPerformanceSamples: false
  });
}

function buildCandidateRecord(value, index, input) {
  const text = String(value || '').replace(/\*\*|__/g, '').trim();
  const quality = assessStudioOutputQuality(input.sourceText, text, {
    engineLanguage: input.engineLanguage,
    requireTopicOverlap: true
  });
  return { id: `candidate-${String.fromCharCode(97 + index)}`, text, deterministicIssues: quality.issues };
}

function buildJudgePrompt(input, candidates) {
  return JSON.stringify({
    task: 'Judge Studio candidates and return JSON only.',
    source: input.sourceText,
    language: input.engineLanguage,
    passScore: PASS_SCORE,
    rubric: { fidelity: 30, specificity: 20, humanVoice: 20, styleFit: 15, hookReadability: 15 },
    candidates
  });
}

function parseJudgeResult(raw = '') {
  const parsed = JSON.parse(String(raw).replace(/```json|```/g, '').trim());
  if (!parsed.selectedCandidateId || !Array.isArray(parsed.scores)) throw new Error('Invalid Studio judge response');
  return parsed;
}

function buildRepairPrompt(input, selected, judge, hardFailures) {
  return JSON.stringify({
    task: 'Repair the draft and return only the repaired text.',
    source: input.sourceText,
    language: input.engineLanguage,
    draft: selected.text,
    failures: [...hardFailures, judge.rationale].filter(Boolean)
  });
}

async function orchestrateStudioGeneration(input, { callModel }) {
  const briefs = input.promptType === 'draft_reply' ? REPLY_BRIEFS : REWRITE_BRIEFS;
  const settled = await Promise.allSettled(briefs.map((brief, index) => callModel(buildCandidatePrompt(input, brief, index))));
  const candidates = settled.flatMap((entry, index) => entry.status === 'fulfilled'
    ? [buildCandidateRecord(entry.value, index, input)] : []);
  if (!candidates.length) throw new Error('All Studio candidate calls failed');
  const judge = parseJudgeResult(await callModel(buildJudgePrompt(input, candidates)));
  const selected = candidates.find(item => item.id === judge.selectedCandidateId);
  const score = judge.scores.find(item => item.id === judge.selectedCandidateId);
  if (!selected || !score) throw new Error('Studio judge selected an unavailable candidate');
  const hardFailures = [...selected.deterministicIssues, ...(score.hardFailures || [])];
  if (score.total >= PASS_SCORE && hardFailures.length === 0) {
    return { text: selected.text, selectedCandidateId: selected.id, candidates, judge, repaired: false, quality: { approved: true, issues: [] } };
  }
  const repairedText = String(await callModel(buildRepairPrompt(input, selected, judge, hardFailures))).trim();
  const quality = assessStudioOutputQuality(input.sourceText, repairedText, { engineLanguage: input.engineLanguage, requireTopicOverlap: true });
  if (!quality.approved) throw new Error(`Studio repair failed quality gate: ${quality.issues.join(', ')}`);
  return { text: repairedText, selectedCandidateId: selected.id, candidates, judge, repaired: true, quality };
}
```

Add deterministic language mismatch and topic-overlap checks. Localize the writer role by engine language. Retrieve no more than three style samples, three edit pairs, and three active performance rules.

- [ ] **Step 4: Verify Studio core**

Run: `node test_studio_generation.mjs && node test_studio_prompt.mjs && node test_studio_quality.mjs && node test_rewrite_prompts.mjs`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add core/studioGeneration.js core/studioQuality.js core/studioPrompt.js core/rewritePrompts.js test_studio_generation.mjs test_studio_prompt.mjs test_studio_quality.mjs test_rewrite_prompts.mjs
git commit -m "feat: add quality-first studio generation"
```

---

### Task 5: Handler and editable Studio UI

**Files:**
- Create: `test_studio_session_flow.mjs`
- Modify: `handlers/llmHandler.js:158-289`
- Modify: `options/options.html:44-65`
- Modify: `options/options.css`
- Modify: `options/options.js:370-530`
- Modify: `options/ui/settings.js:440-520`
- Modify: `core/generationAttribution.js`

**Interfaces:**
- Produces response `{ result, generationSession, candidates, quality }` and current-session update/copy/save actions.

- [ ] **Step 1: Write failing flow test**

```js
import assert from 'node:assert/strict';
import { buildStudioSessionFromResult, buildVaultRecordFromSession } from './core/generationAttribution.js';

const session = buildStudioSessionFromResult({ generationId: 'gen-flow', promptType: 'viral_rewrite', sourceText: 'source', result: {
  text: 'selected', selectedCandidateId: 'candidate-a', candidates: [{ id: 'candidate-a', text: 'selected' }], judge: { scores: [{ id: 'candidate-a', total: 90 }] }
}, engineLanguage: 'en', now: 1700000000000 });
const record = buildVaultRecordFromSession({ ...session, finalText: 'human edited', copiedAt: 1700000000100 });
assert.equal(record.generationId, 'gen-flow');
assert.equal(record.originalAIOutput, 'selected');
assert.equal(record.text, 'human edited');
assert.equal(record.objective, 'studio_rewrite');
```

- [ ] **Step 2: Run and confirm helper-export failure**

Run: `node test_studio_session_flow.mjs`

Expected: FAIL because the flow helpers do not exist.

- [ ] **Step 3: Integrate orchestration, phases, editing, and persistence**

```js
const generationId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const result = await orchestrateStudioGeneration({
  promptType: req.promptType,
  sourceText: textToProcess,
  engineLanguage: config.engineLanguage,
  generationContext,
  config
}, { callModel: prompt => callLLM(prompt, config, false) });
const session = buildStudioSessionFromResult({
  generationId, promptType: req.promptType, sourceText: textToProcess,
  inputContext: req.contextData || {}, result, engineLanguage: config.engineLanguage
});
await prependGenerationSession(session);
sendResponse({ success: true, result: result.text, generationSession: session, candidates: result.candidates, quality: result.quality });
```

Make `#generation-result` contenteditable with textbox semantics. Keep the previous successful result until the new request succeeds. Debounce edits by 300 ms. Copy, Save, Like, and Dislike read current edited text and current generation ID. Save preserves source, selected model output, and final text. Render other candidates in a collapsed control with judge scores.

```html
<div id="generation-result" class="hover-copy-card hidden" contenteditable="true" role="textbox" aria-multiline="true"></div>
<details id="generation-candidates" class="generation-candidates hidden">
  <summary data-i18n="studio_other_candidates">Other candidates</summary>
  <div id="generation-candidate-list"></div>
</details>
```

```js
let editTimer = null;
resultBox.addEventListener('input', () => {
  clearTimeout(editTimer);
  editTimer = setTimeout(() => persistCurrentGenerationText(resultBox.textContent.trim()), 300);
});
```

- [ ] **Step 4: Verify handler-facing flow**

Run: `node test_studio_session_flow.mjs && node test_studio_generation.mjs && node test_studio_quality.mjs`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add handlers/llmHandler.js options/options.html options/options.css options/options.js options/ui/settings.js core/generationAttribution.js test_studio_session_flow.mjs
git commit -m "feat: connect studio pipeline and editing"
```

---

### Task 6: Auto relationship records and prompt isolation

**Files:**
- Create: `core/relationshipLoop.js`
- Create: `test_relationship_loop.mjs`
- Modify: `content/x_automator.js:82-90,690-830,1349-1490`
- Modify: `handlers/queueHandler.js:65-120`
- Modify: `core/generationContext.js`
- Modify: `background.js`
- Modify: `test_queue_handler.mjs`

**Interfaces:**
- Produces: `buildRelationshipInteraction`, `aggregateRelationshipAuthors`, `buildRelationshipVaultRecord`.

- [ ] **Step 1: Write failing relationship tests**

```js
import assert from 'node:assert/strict';
import { buildRelationshipInteraction, aggregateRelationshipAuthors, buildRelationshipVaultRecord } from './core/relationshipLoop.js';

const first = buildRelationshipInteraction({ id: 'rel-1', targetAuthor: '@Builder', sourceStatusId: '111', sourceText: 'source', replyText: 'reply', engineLanguage: 'ja', completedAt: 100 });
const second = buildRelationshipInteraction({ id: 'rel-2', targetAuthor: 'builder', sourceStatusId: '222', sourceText: 'source 2', replyText: 'reply 2', engineLanguage: 'ja', completedAt: 200 });
assert.equal(first.objective, 'auto_relationship');
assert.equal(first.metrics.views, undefined);
const summary = aggregateRelationshipAuthors([first, second])[0];
assert.equal(summary.outboundReplies, 2);
assert.equal(summary.repeatInteraction, true);
assert.equal(summary.replyBackCount, 0);
const record = buildRelationshipVaultRecord(first);
assert.equal(record.contentMode, 'reply');
assert.equal(record.objective, 'auto_relationship');
```

- [ ] **Step 2: Run and confirm module-not-found**

Run: `node test_relationship_loop.mjs`

Expected: FAIL because `relationshipLoop.js` is absent.

- [ ] **Step 3: Implement relationship persistence**

```js
const normalizeAuthor = value => String(value || '').trim().replace(/^@+/, '').toLowerCase();

function buildRelationshipInteraction(input = {}) {
  return {
    id: input.id || `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    objective: 'auto_relationship',
    targetAuthor: input.targetAuthor || 'unknown',
    authorKey: normalizeAuthor(input.targetAuthor),
    sourceStatusId: String(input.sourceStatusId || ''),
    sourceUrl: input.sourceUrl || '', sourceText: input.sourceText || '',
    replyText: input.replyText || '', engineLanguage: input.engineLanguage || 'unknown',
    completedAt: Number(input.completedAt) || Date.now(),
    replyBackAt: Number(input.replyBackAt) || 0,
    continuedAt: Number(input.continuedAt) || 0,
    followDetectedAt: Number(input.followDetectedAt) || 0,
    metrics: { outboundCompleted: 1 }
  };
}

function aggregateRelationshipAuthors(interactions = []) {
  const grouped = new Map();
  interactions.forEach(item => {
    const current = grouped.get(item.authorKey) || {
      authorKey: item.authorKey, outboundReplies: 0, replyBackCount: 0,
      continuationCount: 0, lastInteractionAt: 0, repeatInteraction: false
    };
    current.outboundReplies += 1;
    current.replyBackCount += item.replyBackAt ? 1 : 0;
    current.continuationCount += item.continuedAt ? 1 : 0;
    current.lastInteractionAt = Math.max(current.lastInteractionAt, item.completedAt || 0);
    current.repeatInteraction = current.outboundReplies > 1;
    grouped.set(item.authorKey, current);
  });
  return [...grouped.values()].sort((a, b) => b.lastInteractionAt - a.lastInteractionAt);
}

function buildRelationshipVaultRecord(interaction = {}) {
  return normalizePostRecord({
    id: interaction.id,
    text: interaction.replyText,
    source: interaction.sourceText,
    sourceStatusId: interaction.sourceStatusId,
    origin: 'auto_generated',
    contentMode: 'reply',
    objective: 'auto_relationship',
    status: 'published',
    engineLanguage: interaction.engineLanguage,
    publishedAt: interaction.completedAt,
    savedAt: interaction.completedAt,
    relationshipMetrics: interaction.metrics
  });
}
```

Implement author aggregation and reply vault records. Pass pending reply status ID/URL/language into `replyCompleted`. Queue handling appends capped interaction data and author summaries. Reply prompts select only `auto_relationship` active rules; Auto post rules are excluded.

```js
const interaction = buildRelationshipInteraction({
  targetAuthor: request.tweetAuthor,
  sourceStatusId: request.tweetStatusId,
  sourceUrl: request.tweetStatusHref,
  sourceText: request.tweetContent,
  replyText: request.replyText,
  engineLanguage: request.engineLanguage,
  completedAt: Date.now()
});
const relationshipInteractions = [interaction, ...(res.relationshipInteractions || [])].slice(0, 300);
const draftVault = [buildRelationshipVaultRecord(interaction), ...(res.draftVault || [])].slice(0, 100);
const relationshipAuthors = aggregateRelationshipAuthors(relationshipInteractions);
chrome.storage.local.set({ relationshipInteractions, relationshipAuthors, draftVault });
```

- [ ] **Step 4: Verify relationship behavior**

Run: `node test_relationship_loop.mjs && node test_queue_handler.mjs && node test_loop_context.mjs`

Expected: all PASS and no relationship record has a view outcome.

- [ ] **Step 5: Commit**

```bash
git add core/relationshipLoop.js content/x_automator.js handlers/queueHandler.js core/generationContext.js background.js test_relationship_loop.mjs test_queue_handler.mjs test_loop_context.mjs
git commit -m "feat: track auto relationship outcomes"
```

---

### Task 7: Review scheduling, multilingual evaluation, and final regression

**Files:**
- Create: `test_generation_loop_integration.mjs`
- Create: `test_studio_multilingual_eval.mjs`
- Modify: `background.js:660-672,1247-1266,1952-2000`
- Modify: `core/performanceReviewScheduler.js`
- Modify: `test_performance_review_scheduler.mjs`
- Modify: `core/rewritePrompts.js`
- Modify: `options/locales.js`
- Modify: `core/logCatalog.js`

**Interfaces:**
- Produces: performance review scheduling independent of Auto running state and localized quality fixtures.

- [ ] **Step 1: Write failing scheduler and multilingual tests**

```js
import assert from 'node:assert/strict';
import { shouldSchedulePerformanceReview } from './core/performanceReviewScheduler.js';

assert.equal(shouldSchedulePerformanceReview({
  isRunning: false,
  posts: [{ id: 'tracked', status: 'published', autoReviewEnabled: true, nextAutoReviewAt: 100 }],
  now: 50
}), true);
```

```js
import assert from 'node:assert/strict';
import { buildViralRewritePromptPrefix } from './core/rewritePrompts.js';
import { assessStudioOutputQuality } from './core/studioQuality.js';

const cases = [
  ['zh', '产品不是功能列表，而是用户愿意重复的工作流。'],
  ['en', 'The product is not the feature list. It is the workflow users repeat.'],
  ['ja', 'プロダクトは機能一覧ではなく、ユーザーが繰り返すワークフローです。'],
  ['es', 'El producto no es la lista de funciones, sino el flujo que el usuario repite.'],
  ['id', 'Produk bukan daftar fitur, melainkan alur kerja yang terus dipakai pengguna.']
];
for (const [language, output] of cases) {
  const prompt = buildViralRewritePromptPrefix({ engineLanguage: language, persona: {} });
  assert.doesNotMatch(prompt, /顶级 X 中文写作者/);
  const quality = assessStudioOutputQuality(output, output, { engineLanguage: language, requireTopicOverlap: true });
  assert.equal(quality.issues.includes('language_mismatch'), false, language);
  assert.equal(quality.issues.includes('topic_drift'), false, language);
}
```

- [ ] **Step 2: Run and confirm both new behaviors fail**

Run: `node test_generation_loop_integration.mjs && node test_studio_multilingual_eval.mjs`

Expected: FAIL because review remains coupled to Auto and the writer identity remains Chinese-specific.

- [ ] **Step 3: Decouple review and localize Studio roles**

```js
function shouldSchedulePerformanceReview({ posts = [] } = {}) {
  return posts.some(item => item.autoReviewEnabled
    && item.status !== 'reviewed'
    && Number(item.nextAutoReviewAt) > 0);
}

const WRITER_ROLE = {
  zh: '你是一位擅长自然、具体表达的 X 写作者。',
  en: 'You are an X writer known for natural, specific writing.',
  ja: 'あなたは自然で具体的な文章を得意とするXライターです。',
  es: 'Eres un escritor de X con un estilo natural y concreto.',
  id: 'Anda adalah penulis X dengan gaya yang alami dan konkret.'
};
```

Remove only the `isRunning` guard from tracked performance review alarms. Keep all generation and reply automation guarded. Add localized pipeline phases, attribution labels, rule states, insufficient-data text, and relationship labels. Logs include generation ID and phase but never keys or tokens.

- [ ] **Step 4: Run full tests and syntax checks**

Run: `for file in test_*.mjs; do node "$file" || exit 1; done`

Expected: every test script exits 0.

Run: `for file in background.js core/*.js handlers/*.js options/*.js options/ui/*.js content/*.js content/logic/*.js; do node --check "$file" || exit 1; done`

Expected: all JavaScript parses.

Run: `git diff --check`

Expected: no output and exit 0.

- [ ] **Step 5: Review requirements from evidence**

Confirm:

- Rewrite makes three candidates; Reply makes two.
- Judge threshold is 82 and repair count is at most one.
- Studio result is editable and preserves selected versus final text.
- Attribution is unique and conservative.
- Five observations create only candidates; eight consistent observations activate.
- Legacy and cross-objective rules are absent from prompts.
- Auto replies create relationship records without view scoring.
- Tracked reviews continue while Auto is off.

- [ ] **Step 6: Commit final integration**

```bash
git add background.js core/performanceReviewScheduler.js core/rewritePrompts.js options/locales.js core/logCatalog.js test_generation_loop_integration.mjs test_studio_multilingual_eval.mjs test_performance_review_scheduler.mjs
git commit -m "test: verify rebuilt generation and loop"
```

## Final Verification

```bash
for file in test_*.mjs; do node "$file" || exit 1; done
for file in background.js core/*.js handlers/*.js options/*.js options/ui/*.js content/*.js content/logic/*.js; do node --check "$file" || exit 1; done
git diff --check
git status --short --branch
```

Expected: all tests pass, all JavaScript parses, the diff check is clean, and only intended rebuild files plus the user's pre-existing untracked `fix_test.mjs` appear.

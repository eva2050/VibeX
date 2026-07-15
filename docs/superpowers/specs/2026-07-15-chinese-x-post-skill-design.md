# Chinese X Post Skill Design

## Objective

Build a versioned, immutable Chinese X Post Skill for AI, technology, product, indie-building, and creator-business content. The Skill must outperform the current generic Chinese rewrite rules in repeatable blind evaluation before it becomes the default for Studio Post or Auto Post.

The Skill is the shared professional baseline. User profile, curated samples, explicit edits, likes/dislikes, and evidence-gated Loop rules remain separate overlays and cannot mutate the Skill package.

## Scope

This delivery covers the Chinese Post Skill only:

- Studio `viral_rewrite` Post generation;
- Auto original-post generation;
- deterministic and model-judged benchmark tooling;
- version and generation-session attribution.

The following are explicitly deferred until the Post Skill meets its quality gate:

- X Article research and focused editor;
- Chinese X interaction Reply Skill;
- English, Japanese, Spanish, and Indonesian content skills.

## Content Territory

Version 1 targets six content families:

1. AI or technology product observation;
2. tool-use experience and product criticism;
3. build-in-public progress;
4. failure story and retrospective;
5. industry opinion and trend judgment;
6. method, workflow, or practical framework.

The Skill is not a universal Chinese social-copy generator. Inputs outside this territory use the existing language-safe fallback and are marked `fallback_generic` in generation metadata.

## Architecture

The product-internal Skill package has a stable interface and language/format registry:

```text
core/contentSkills/
├── registry.js
└── zh/
    ├── postSkill.js
    ├── postStrategies.js
    ├── postJudge.js
    └── postBenchmark.js
```

`registry.js` resolves a Skill by `{ language, format, objective }`. Version 1 registers `zh/post` for `studio_rewrite` and `auto_post`.

The Skill exposes:

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

Input diagnosis is deterministic and does not consume an additional model call. The existing maximum remains three candidate calls, one independent judge call, and at most one repair call.

## Content Diagnosis

The diagnosis records:

- content family;
- source claim and key entities;
- factual certainty markers;
- first-person experience availability;
- concrete signals already present;
- recommended and forbidden structures;
- target length band;
- fallback reason when outside the Skill territory.

Diagnosis must reject structural misuse:

- no competition or allocation relationship means no betting/game framing;
- no supplied first-person experience means no invented personal story;
- a question, suspicion, or uncertain claim cannot become a factual assertion;
- a short observation cannot become a long tutorial;
- account samples cannot replace the source topic or claim.

## Candidate Diversity

The three candidates have separate jobs:

1. `faithful_sharpening`: preserve the source argument while improving hook, compression, and rhythm;
2. `cognitive_reframe`: surface an existing contrast, constraint, or overlooked variable without adding a new claim;
3. `concrete_scene`: express the existing idea through supplied actions, costs, workflow, or observable product behavior without inventing an event.

When a strategy is not supported by the diagnosis, the Skill substitutes another eligible strategy rather than forcing it. Candidate similarity is measured after normalization; near-duplicate strategies are a quality failure.

## Chinese Quality Standard

The independent judge uses a Chinese X-specific rubric:

- claim and certainty fidelity: 25;
- concrete information density: 20;
- natural Chinese X voice: 20;
- first-line continuation value: 15;
- save/share/discussion value: 10;
- audience and account fit: 10.

Hard failures cannot be offset by a high numeric score:

- unsupported external fact;
- invented personal experience;
- topic drift or changed conclusion;
- wrong output language;
- certainty escalation;
- forced structure unsupported by the source;
- obvious marketing-account, translation, or template-heavy voice.

The existing Studio threshold remains 82 for the first benchmark so the comparison isolates Skill quality rather than changing both the prompt and the gate. Threshold recalibration requires benchmark evidence.

## Base Skill and User Memory

Generation precedence is fixed:

1. safety, factual, language, and source-lock constraints;
2. Chinese Post Skill diagnosis, strategies, and judge rubric;
3. account positioning and boundaries;
4. user-curated high-quality samples;
5. explicit edit and preference feedback;
6. active same-objective Chinese Loop rules.

The Skill package is versioned and read-only at runtime. User history can choose among quality-passing drafts and influence voice. It cannot lower hard constraints or rewrite the shared Skill.

## Benchmark Dataset

The repository includes a minimum of 60 Chinese fixtures, ten for each content family. Fixtures contain only synthetic or user-owned text and store no copied third-party post corpus.

Each fixture defines:

- input text;
- content family;
- claims and entities that must remain;
- certainty level;
- permitted and forbidden structures;
- whether first-person experience is available;
- required concrete signals;
- maximum expansion ratio;
- anti-pattern expectations.

Adversarial fixtures include short low-quality input, emotion without a claim, uncertain statements, unsupported numbers, extraction-error text, prompts likely to trigger excessive expansion, and prompts likely to trigger marketing formatting.

## Evaluation and Release Gate

Deterministic metrics:

- core-claim preservation rate;
- unsupported entity/number introduction rate;
- certainty-escalation rate;
- banned Chinese template hit rate;
- output expansion violations;
- pairwise candidate similarity and diversity;
- correct content-family and forbidden-structure routing.

Model-assisted blind comparison evaluates the current generator and Skill generator without revealing which is which. The evaluator returns fidelity, specificity, naturalness, hook, audience value, hard failures, and a winner.

The Skill becomes the default only when all gates pass:

- at least 95% core-claim preservation;
- zero unsupported external facts in the golden set;
- no more than 10% obvious template-hit rate;
- no more than 20% candidate strategy duplication;
- at least 65% blind-comparison win rate against the current generator;
- no regression in non-Chinese generation tests.

If live provider credentials are unavailable in automated tests, deterministic gates still block integration and the blind benchmark reports `credentials_required` rather than fabricating a win rate. The Skill remains opt-in until the live comparison has been run.

## Integration

Studio Post resolves `zh/post` after engine-language normalization. The generation session stores `contentSkillId`, `contentSkillVersion`, diagnosis family, candidate strategy IDs, judge scores, and repair outcome.

Auto Post uses the same Skill and quality gate but retains explicit Auto enablement and existing safe-publish behavior. Studio never publishes automatically.

Non-Chinese generation and unsupported Chinese territory retain the current pipeline through an explicit fallback. Auto Reply continues using the independent `auto_relationship` objective and receives no Post Skill instructions.

## Error Handling

- Invalid diagnosis returns `fallback_generic` and does not fail the user request.
- One candidate failure is tolerated when another candidate succeeds.
- Invalid judge output fails the request and preserves the prior Studio result.
- Repair runs at most once.
- Benchmark output includes fixture IDs and aggregate counts but never API keys or complete provider payloads.
- Skill/version metadata is immutable inside a generation session.

## Delivery Order

1. Skill registry, diagnosis, strategy selection, and deterministic evaluator;
2. 60-fixture benchmark and aggregate report;
3. Studio Post integration behind `contentSkillRollout.zhPost`;
4. Auto Post integration using the same resolver;
5. live blind benchmark and release decision;
6. X Article Skill as a separate specification;
7. Chinese X interaction Reply Skill as a separate specification.

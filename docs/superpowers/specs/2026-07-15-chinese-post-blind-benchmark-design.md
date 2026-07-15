# Chinese X Post Skill Blind Benchmark Design

## Objective

Build an internal, reproducible A/B benchmark that answers one question: does `zh-x-post@1.0.0` produce better Chinese X posts than the current Studio production pipeline when both use the same configured model and account context?

The first release decision is based on blind preference, not live X distribution data. The benchmark must run through the real Studio orchestration paths, preserve user credentials inside the extension, survive interruptions, and add no friction to normal Studio usage.

## Scope

This phase includes:

- 24 balanced Chinese fixtures: four from each of the six supported content families;
- current Studio versus Chinese Skill Studio production-pipeline generation;
- two order-reversed blind model judgments per fixture;
- human review of exactly 10 uncertain fixtures;
- deterministic safety metrics and a reproducible local report;
- automatic enablement of Chinese Studio Post only when every release gate passes.

This phase excludes:

- publishing benchmark content to X;
- using views, likes, replies, or reposts as success metrics;
- enabling Chinese Auto Post;
- Article or Reply Skill work;
- exporting API keys or benchmark inputs to a separate service.

## Success Criteria

The Skill passes only when all conditions are true:

- Skill blind win rate is at least 65% among non-tie decisions;
- claim preservation is at least 95%;
- unsupported fact count is zero;
- template hit rate is at most 10%;
- all 24 fixtures have both valid current and Skill outputs;
- all 10 required human decisions are complete;
- at least 18 of the 24 final comparisons are non-ties;
- the benchmark used one identical provider, model, language, account context, and generation configuration for both arms.

A blind win cannot compensate for a deterministic safety failure. An incomplete or interrupted run remains `in_progress` or `blocked`; it cannot pass.

## Benchmark Dataset

The runner deterministically selects four fixtures from each existing family in `benchmarks/chinesePostFixtures.js`:

- `product_observation`;
- `tool_experience`;
- `build_in_public`;
- `failure_retrospective`;
- `industry_opinion`;
- `workflow_framework`.

Selection is fixed by benchmark version, not randomized per run. This makes results comparable across Skill versions. The benchmark record stores fixture IDs and benchmark version so future fixture changes cannot silently alter an old result.

## Production-Path A/B Generation

Each fixture runs both arms:

1. **Current arm:** the existing generic Studio rewrite pipeline with the Chinese Skill explicitly disabled.
2. **Skill arm:** the same Studio pipeline with `zh-x-post@1.0.0` explicitly supplied.

Both arms use the same extension-configured provider, model, engine language, account/profile context, performance memory, regeneration state, and source text. The runner does not read or return the API key; model calls stay inside the existing extension service worker.

Each arm uses the actual three-candidate generation plus independent candidate judge. A single-prompt approximation is not accepted because it would not measure the product users receive.

Generation is processed one fixture at a time. The three candidate calls inside an arm may retain the existing controlled concurrency. The runner checkpoints after every completed arm and fixture.

## Blind Model Evaluation

After both outputs exist, the evaluator creates anonymous labels using a stored random seed. It performs two fresh judgments:

- judgment one receives outputs as A/B;
- judgment two receives the same outputs in reversed order.

The judge receives the source fixture and scores fidelity, information gain, natural Chinese X voice, hook quality, audience value, and template risk. It never receives arm names, Skill IDs, prompt text, or candidate strategy IDs.

A model decision is considered stable only when both order-reversed judgments resolve to the same underlying arm. Disagreements are marked uncertain. Stable decisions retain a confidence gap derived from the two score differences.

## Human Review

The runner selects exactly 10 fixtures for human review in this order:

1. model-judge disagreements, ordered from the smallest combined confidence margin upward;
2. then the smallest stable confidence gaps until 10 fixtures are selected.

The internal review page displays only:

- the source fixture;
- anonymous version A and version B;
- controls for A, B, or tie;
- review progress.

It does not reveal Skill identity, model scores, generation metadata, or prior decisions until the review is complete. A human choice overrides both model judgments for that fixture. Among the remaining 14 fixtures, order-reversed judge disagreements count as ties. This preserves the 10-review limit without pretending an unstable model decision is a win. The run fails the minimum-decisive-sample gate when fewer than 18 final comparisons are non-ties.

## Final Scoring

The report converts anonymous A/B choices back to current/Skill arms only after all 10 human decisions are saved.

The primary metric is:

`skill wins / (skill wins + current wins)`

Ties are reported and excluded from the win-rate denominator. Deterministic safety metrics are calculated on the 24 final Skill-arm outputs, not on the current arm. The report also breaks results down by the six content families and includes:

- valid comparison count;
- Skill wins, current wins, and ties;
- model/human agreement rate;
- claim preservation;
- unsupported facts;
- certainty escalation;
- template hits;
- expansion violations;
- strategy duplication;
- per-family win rate and failure reasons.

## State and Persistence

Benchmark state is stored in `chrome.storage.local` under a dedicated versioned key and is separate from generation sessions, draft vault, Loop memory, and publication attribution.

Each run stores:

- run ID, status, benchmark version, Skill ID/version, and app commit;
- provider and model names, without API credentials;
- fixture IDs and anonymous ordering seed;
- current and Skill outputs plus production judge metadata;
- both blind model judgments;
- selected human-review fixture IDs and human choices;
- deterministic metrics, final scoring, release decision, and timestamps;
- per-step errors and retry counts.

Only one active run is allowed. Starting over requires an explicit reset and creates a new run ID rather than mutating a completed report.

## Internal User Interface

The benchmark lives in an internal Options tools section and is not shown in the normal Studio workflow.

The interface has three states:

1. **Setup:** shows the fixed 24-fixture scope, configured provider/model, a minimum of 240 model calls, up to 288 calls when every Studio arm requires its one allowed repair, and a start button. Provider retries are reported separately.
2. **Running:** shows completed fixtures, current phase, failures, retry status, pause/resume, and estimated remaining calls.
3. **Review/report:** presents the 10 anonymous human comparisons, then reveals aggregate and per-family results after completion.

Normal Studio users see no additional controls or required steps.

## Error Handling and Resume

- Missing or mock API keys block the run before the first call.
- Provider/model configuration is snapshotted at start. A configuration change pauses the run and requires restart, preventing mixed-model comparisons.
- Rate limits and transient network errors retain progress and use bounded retries with backoff.
- Invalid JSON, missing candidates, or failed Studio quality gates are recorded per arm. The fixture can be retried without rerunning completed fixtures.
- Closing Options or restarting the browser does not lose progress.
- The report cannot transition to `passed` while any required arm, judgment, or human choice is missing.
- Resetting the benchmark never deletes normal Studio sessions, posts, Loop data, or account configuration.

## Rollout Behavior

When all gates pass, the extension updates the current installation to enable `contentSkillRollout.zhPostStudio` for Studio Post generation. Auto Post continues to receive no rollout authorization in this phase.

To preserve that separation, the rollout schema is `{ zhPostStudio: boolean, zhPostAuto: boolean }`. Existing installations replace the legacy shared `zhPost` value with both new flags set to `false`, because the legacy flag cannot prove which surface was authorized. A successful benchmark sets only `zhPostStudio: true`; it never changes `zhPostAuto`.

When the run fails or remains incomplete, both modes stay disabled. The report identifies the weakest content families and representative losses for Skill iteration.

## Testing

Automated tests cover:

- deterministic selection of 24 balanced fixtures;
- identical model/config snapshots across A/B arms;
- full Studio production-path use for both arms;
- anonymous ordering and reversed-order judge consistency;
- selection of exactly 10 uncertain human-review fixtures;
- human override and tie handling;
- the 65% win-rate calculation and every safety gate;
- checkpoint/resume without duplicate completed calls;
- missing-key, rate-limit, invalid-output, and configuration-change behavior;
- separation of benchmark storage from Loop and publication data;
- pass enabling Studio only, never Auto or Reply;
- preservation of current Studio, multilingual, Auto, Reply, privacy, and storage regressions.

## Release Decision

The current `zh-x-post@1.0.0` rollout remains disabled until this benchmark completes and passes. The benchmark result, not implementation completion, is the authority for enabling Chinese Studio Post.

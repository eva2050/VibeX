# Generation, Attribution, and Loop Rebuild Design

Date: 2026-07-14

## Objective

Rebuild VibeX around two explicit product paths:

1. Studio / Rewrite is a human-controlled writing tool that prioritizes output quality. It generates, evaluates, repairs, and records drafts, but never publishes automatically.
2. Auto remains an opt-in agent mode. Auto posts optimize content performance, while Auto replies optimize relationship formation across language regions.

The rebuild does not preserve weak behavior merely for compatibility with the already-published extension version. Existing stored records must still be migrated safely, but current quality and learning defects take priority over behavioral compatibility.

## Success Criteria

- A Studio rewrite uses three independent candidate-generation calls, one independent judge call, and at most one repair call.
- Studio never returns a candidate that fails a hard quality constraint. If every provider call fails, Studio shows an error rather than silently accepting a weak draft.
- Users can edit the selected Studio result before copying it, and VibeX records the original input, candidate set, selected draft, final edited text, and copy time under one stable generation ID.
- A later X sync can attribute a published post to the matching Studio generation without requiring Auto publishing.
- One weak historical post cannot create an active performance rule.
- Performance rules are segmented by objective, content mode, and language and are expressed as associations rather than unsupported causal claims.
- Global quality rules and explicit user preferences always outrank account-performance history.
- Auto replies are persisted as relationship interactions and no longer use views as their primary learning objective.

## Product Boundaries

### Studio / Rewrite

- Studio may make three to five model calls and may take roughly 10–30 seconds when that improves quality.
- Studio does not publish, schedule, or click X controls.
- The user remains responsible for final review and publishing.
- The selected result is editable in Studio. Copy and Save use the edited text, not the original model result.

### Auto

- Auto remains available and opt-in.
- Auto post generation and publishing continue to use the existing explicit Auto enablement state.
- Auto reply generation and sending continue to use the existing explicit Auto enablement state.
- Studio and Auto share account identity, language configuration, user-curated style samples, and explicit preference feedback. They do not share performance objectives or unvalidated performance rules.

## Architecture

The rebuild introduces four focused modules:

1. `studioGeneration`: orchestrates candidate generation, deterministic checks, independent judging, and optional repair.
2. `generationAttribution`: owns generation-session records, user-edit snapshots, copy/save events, and matching to X-synced posts.
3. `learningPolicy`: turns reviewed performance observations into candidate or active rules using cohort and sample safeguards.
4. `relationshipLoop`: records Auto reply interactions and derives relationship-oriented summaries without treating views as success.

Existing handlers remain responsible for Chrome messaging, storage access, and UI wiring. The new core modules contain pure functions where possible so their behavior can be exercised by Node tests without Chrome mocks.

## Studio Quality Pipeline

### Candidate generation

For `viral_rewrite`, VibeX starts three independent model calls with the same source lock and account context but different structural briefs:

- Candidate A: faithful compression and a concrete first-line hook.
- Candidate B: contrast or variable-reversal structure without changing the source claim.
- Candidate C: natural observation or short narrative structure without adding facts.

The calls may run concurrently with `Promise.allSettled`. A provider failure removes only that candidate. At least one successful candidate is required to continue.

Each candidate prompt retrieves only relevant context:

- up to three user-curated style samples;
- up to three recent user edit pairs;
- up to three active rules for the same objective, content mode, and language;
- no raw account-history dump;
- no historical sample may introduce the topic, claim, product, person, or data point.

### Deterministic checks

Before judging, each candidate is checked for:

- empty output;
- language mismatch;
- unsupported hard facts;
- topic drift signals;
- forbidden AI-template phrases;
- Markdown and hashtag artifacts;
- over-expansion and excessive segmentation.

Candidates with deterministic hard failures remain visible to the judge as rejected evidence but cannot be selected.

### Independent judge

One independent model call receives the input, accepted candidates, account-language requirement, and scoring rubric. It returns strict JSON containing per-candidate scores, hard-failure reasons, the selected candidate ID, and a concise selection rationale.

The 100-point rubric is:

- topic and claim fidelity: 30;
- specificity and information gain: 20;
- natural human voice: 20;
- account/style fit: 15;
- hook and mobile readability: 15.

Passing requires a score of at least 82 and no hard failure. The judge may not reward unsupported novelty or facts absent from the source.

### Repair

If the best candidate scores below 82, one final repair call receives only the source, the best candidate, and the judge's concrete failure reasons. The repaired output is checked again deterministically and judged against the same rubric using the prior judge result as the repair contract. No more than one repair call is made.

If no candidate or repair passes, Studio returns an actionable generation error and keeps the previous successful result on screen. It does not silently return a low-quality draft.

### Draft reply

`draft_reply` uses two candidates plus the independent judge because reply relevance matters more than structural variation. It uses the same hard constraints and repair behavior, with a reply-specific rubric emphasizing relevance, conversational value, and non-repetition. This keeps the maximum call count within five.

## Generation Attribution

### Generation session record

Each Studio request creates a record with the following conceptual shape:

```js
{
  id: "gen-<timestamp>-<random>",
  promptType: "viral_rewrite" | "draft_reply",
  objective: "studio_rewrite" | "studio_reply",
  inputText: "...",
  inputContext: { author, url, statusId, language },
  candidates: [{ id, text, deterministicIssues, score, judgeIssues }],
  selectedCandidateId: "candidate-b",
  selectedText: "...",
  finalText: "...",
  engineLanguage: "en",
  createdAt: 0,
  updatedAt: 0,
  copiedAt: 0,
  savedAt: 0,
  publication: null
}
```

Storage keeps the most recent 100 sessions. Candidate payloads may be trimmed after publication attribution, but `inputText`, `selectedText`, `finalText`, and judge metadata remain available for learning and debugging.

### Editing and copying

The Studio result becomes editable. Each edit updates `finalText` with a short debounce. Copy and Save first flush the current text to the session, then record `copiedAt` or `savedAt`.

Saving to Posts preserves:

- `generationId`;
- original source text;
- `originalAIOutput` as `selectedText`;
- edited `text` as `finalText`;
- objective and content mode;
- draft status until publication attribution succeeds.

The before/after edit pair enters edit memory only when the normalized selected and final texts differ. It is recorded once per generation ID and does not overwrite the original model output.

### Matching X-synced posts

When X posts are synced, attribution runs before a new independent `x_synced` record is created.

Candidates are limited to Studio sessions that:

- were copied or saved within the previous seven days;
- are not already attributed;
- belong to the active X account;
- have the same detected output language when language is known.

Matching order:

1. exact normalized final-text match;
2. exact normalized selected-text match;
3. character-bigram similarity of at least 0.92 against final text.

Normalization standardizes whitespace and X URL presentation but does not remove substantive words, numbers, or punctuation-bearing claims. A fuzzy match is accepted only when it is the unique best candidate and exceeds the next candidate by at least 0.05. Otherwise the X post remains independent and no learning attribution is claimed.

An attributed synced post updates the existing draft record with `statusId`, `postUrl`, `publishedAt`, metrics, and published/reviewed state. It does not create a duplicate Posts card.

## Learning Policy

### Memory layers and precedence

Generation context uses the following fixed precedence:

1. hard safety, language, topic, and factual constraints;
2. global quality rubric;
3. explicit user-curated style samples;
4. explicit like/dislike and before/after edit feedback;
5. active performance rules;
6. candidate performance observations, which are not placed in prompts.

Account history can adjust choices among quality-passing drafts. It cannot lower the global quality threshold or redefine poor content as good content.

### Observation cohorts

Every reviewed item produces an observation tagged with:

- objective: `studio_rewrite`, `auto_post`, or `auto_relationship`;
- content mode;
- engine/output language;
- inferred content features;
- metric snapshot;
- cohort baseline;
- source generation or interaction ID when available.

Comparisons use only the same objective, content mode, and language. The most recent 50 comparable observations form the maximum cohort.

With fewer than five comparable historical observations, relative performance is `insufficient_data`. The observation is stored but cannot create a candidate or active performance rule.

### Candidate and active rules

- At five comparable observations, a recurring association may become a candidate rule when at least 70% of matching observations point in the same direction and median lift or decline is at least 20%.
- Candidate rules are visible for review but are not injected into generation prompts.
- At eight comparable observations, a candidate may become active automatically when directional consistency remains at least 70% and the effect threshold remains at least 20%.
- An explicit user approval may activate a candidate rule after five observations.
- Active rules are demoted when the last eight comparable observations fall below 55% directional consistency.
- Rules expire from prompt use after 90 days without supporting observations.

Rule wording must use association language such as "In comparable English Auto posts, concrete first-line scenes were associated with higher engagement." It must not state that an external link "caused platform suppression" or make another causal claim that the data cannot prove.

### Metrics by objective

`studio_rewrite` and `auto_post` use a normalized content-performance score inside their own separate cohorts. The score combines views with observable engagement instead of treating one raw metric as universally sufficient:

```text
content score = normalized views
              + 2 * normalized likes
              + 3 * normalized replies
              + 4 * normalized reposts
              + 4 * normalized bookmarks
```

Missing metrics contribute zero but are identified as unavailable. No comparison crosses accounts, objectives, modes, or languages.

`auto_relationship` does not use views. Its observable outcomes are:

- outbound reply completed;
- unique target author;
- repeat interaction with the same author;
- detected reply-back from the target;
- detected conversation continuation;
- detected follow relationship when available.

The first implementation records completed outbound replies and repeated-author interactions immediately. Reply-back, conversation continuation, and follow signals are updated only when X synchronization provides evidence; unavailable signals remain unknown rather than false.

## Auto Relationship Records

`replyCompleted` is extended to preserve the target author, source tweet ID/URL/text, generated reply text, output language, and completion time. The record is stored under a stable interaction ID and is also represented in Posts with `contentMode: reply` and `objective: auto_relationship`.

Repeated interactions are aggregated per normalized author. A relationship summary contains counts and last-interaction time, but it does not invent reciprocal engagement. Only evidence from synchronized X content may set `replyBackAt`, `continuedAt`, or `followDetectedAt`.

Auto reply generation receives only:

- account identity and boundaries;
- the current source post;
- relevant explicit style/edit preferences;
- active relationship rules for the same language;
- recent replies for uniqueness.

Auto-post view rules are never injected into Auto replies.

## Migration

Storage schema advances by one version. Migration behavior is deterministic:

- existing manual rewrites remain `studio_rewrite` drafts;
- existing Auto-generated posts become `auto_post`;
- existing X-synced posts remain unattributed unless an exact current generation ID already exists;
- existing learned rules become inactive legacy candidates because they lack the new cohort evidence;
- existing like/dislike, edit feedback, persona, agent memory, and user-curated style samples remain intact;
- no existing post or feedback record is deleted.

Legacy rules are visible in memory diagnostics but are excluded from prompts until rebuilt under the new policy.

## Error Handling

- Individual candidate-call failures do not fail the Studio request if another candidate succeeds.
- Judge JSON parse failure triggers one strict-format retry only when the total model-call cap allows it; otherwise Studio returns a judge error and preserves the previous result.
- Storage writes use immutable copies and cap session, observation, interaction, and rule arrays.
- Attribution never mutates two records for one X status ID.
- Ambiguous fuzzy matches are skipped and logged without creating a rule.
- Missing X metrics remain unknown. They are not coerced into evidence of poor performance.
- Auto review scheduling is separated from the Auto running switch so already-published tracked content can mature and be reviewed even when Auto has subsequently been turned off.

## UI Changes

Studio keeps the existing primary layout and actions.

- The selected result is editable.
- A compact status line shows `Generating candidates`, `Reviewing`, or `Repairing`.
- The primary result appears only after selection.
- A collapsed `Other candidates` control exposes alternatives and scores without forcing users to read evaluator internals.
- Quality badges represent unresolved warnings only; passed checks do not create visual noise.
- Posts show whether a record is `Studio`, `Auto Post`, or `Auto Relationship`, plus attribution status and learning eligibility.
- Candidate rules are distinguishable from active rules in Loop diagnostics.

## Testing Strategy

All behavior changes follow test-first development.

Unit tests cover:

- candidate orchestration, partial provider failure, judge selection, threshold failure, and repair;
- deterministic language, fact, template, topic, and length checks;
- generation-session lifecycle and immutable edit snapshots;
- exact, fuzzy, ambiguous, expired, and already-attributed matching;
- cohort segmentation and minimum sample enforcement;
- candidate activation, automatic activation, demotion, and expiry;
- migration of legacy posts and rules;
- relationship interaction persistence and author aggregation;
- prompt retrieval that excludes legacy, candidate, cross-language, and cross-objective rules.

Integration-style Node tests cover:

- Studio result to saved draft to X sync to reviewed observation;
- edited Studio output producing one edit-memory pair and one attributed post;
- Auto reply completion producing a relationship record without view-based learning;
- performance review continuing for already tracked posts while Auto is off.

The existing extension test suite and production build must pass before commit or push.

## Rollout and Observability

The rebuild ships behind the new storage schema, not a user-facing feature flag. Diagnostic logs include generation ID, pipeline phase, candidate count, judge score, attribution method, cohort size, and rule state transition. Logs must never contain API keys or OAuth tokens.

The implementation is complete only when new tests demonstrate the redesigned behavior and the existing build succeeds. Live model quality is additionally checked with a small fixed multilingual evaluation set covering Chinese, English, Japanese, Spanish, and Indonesian source material.

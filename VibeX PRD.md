# VibeX PRD - AI X Growth Copilot

Version: 2026-06-15
Owner: VibeX
Product type: Chrome Extension, Manifest V3
Primary platform: X.com

## 1. Product Summary

VibeX is an AI growth copilot for X creators, solo builders, and technical founders. It helps the user define an account voice, generate native X posts and replies, publish with browser-side automation, collect performance data, and continuously improve future content through a local learning loop.

The product is not a generic writing assistant. Its core promise is an account-specific growth system:

- Connect to the user's X account.
- Learn the user's public profile, avatar, recent posts, replies, and performance baseline.
- Generate posts and replies in a consistent voice.
- Save and review published content in Posts.
- Feed real performance back into Loop after a stable measurement window.
- Use the learned rules in later generation, rewriting, and reply decisions.

## 2. Goals

### 2.1 Business Goals

- Provide a usable Chrome extension for AI-assisted X growth without requiring a hosted backend.
- Reduce the time required to write, rewrite, publish, and review X content.
- Build a defensible product loop around account-specific memory and performance learning.
- Support creator workflows across manual creation, semi-automated publishing, and background review.

### 2.2 User Goals

- Connect X once and let VibeX understand the account context.
- Produce posts that sound like the user, not generic AI copy.
- Automatically collect recent posts and performance metrics into Posts.
- Learn from what actually performed instead of relying only on prompt guesses.
- Keep control over publishing, API keys, language, and account strategy.

### 2.3 Product Principles

- Local-first: user configuration, posts, and memory are stored in Chrome local storage.
- No Client Secret in extension code.
- No LLM token consumption for metric sync or local Loop calculations.
- Stable performance before learning: use a 48-hour review window before feeding post metrics into Loop.
- Human-readable controls and logs: users should be able to tell what the agent did and why.
- Safe automation: prefer official X pages, intent flows, and visible browser actions over hidden platform abuse.

## 3. Target Users

### 3.1 Primary Persona

Solo AI builders, indie hackers, technical founders, and AI/tech creators who want to build an opinionated X presence while continuing to ship product.

### 3.2 Secondary Personas

- Consultants or agency operators creating content for a personal brand.
- Technical KOLs who need help turning complex ideas into native X posts.
- Builders who want a lightweight performance memory system without a full social media backend.

## 4. Core User Journeys

### 4.1 First-Time Setup

1. User opens the extension Options page.
2. User configures AI provider and model.
3. User connects X through OAuth 2.0 PKCE.
4. VibeX stores the local OAuth connection state and refresh token when granted.
5. VibeX opens or reuses the user's X Profile page and reads public handle, avatar, display name, bio, and visible recent posts/replies from the page DOM.
6. Profile tab shows connected state and the user's circular X avatar once the page scan succeeds.
7. VibeX seeds Account Voice and Posting Strategy from the scanned public profile and existing account context.
8. VibeX scans visible high-signal posts/replies and creates an account performance baseline.

### 4.2 Manual Creation

1. User pastes text, a link, or source material into Studio.
2. VibeX extracts or accepts the material.
3. User runs Viral Rewrite, Smart Reply, Style Analysis, or related magic actions.
4. Generation uses account persona, style samples, edit feedback, performance memory, and top-performing recent samples.
5. User copies, edits, saves, or publishes the output.

### 4.3 Auto Post

1. User enables automation.
2. VibeX generates a single high-quality post draft using account context and Loop memory.
3. The draft is quality-checked and published through browser-side X automation.
4. The published post is saved into Posts with status `published`.
5. VibeX schedules one performance review at `publishedAt + 48h`.
6. At review time, VibeX opens the post page and reads visible views, likes, replies, and reposts from the page.
7. The result is saved into Posts and summarized into Loop.

### 4.4 X Profile Scan

1. User connects X or VibeX runs a scheduled local baseline scan.
2. VibeX opens or reuses the user's X Profile page.
3. VibeX reads public profile data and visible recent posts/replies from the DOM.
4. Posts are merged into Posts by `statusId`, avoiding duplicates.
5. Posts younger than 48 hours are stored but not used for Loop learning yet.
6. Posts older than 48 hours with visible metrics are reviewed and can feed Loop once.
7. Future scheduled review uses the same 48-hour rule for known posts.

### 4.5 Loop Learning

1. A post has a prediction or generated performance expectation.
2. After stable metrics are available, VibeX compares actual views to the predicted range.
3. The system classifies performance as hit, overestimated, underestimated, breakout, below baseline, or related status.
4. VibeX creates a compact learning event and learned rule.
5. Future generation prompts include relevant learned rules and top-performing account samples.

## 5. Functional Requirements

## 5.1 Profile

### Requirements

- Show account connection state for X.
- On successful OAuth connection, display:
  - handle
  - connected state
  - X avatar as a circular image
- Remove marketing/help copy under Profile heading to keep the view compact.
- Provide Disconnect control.
- Seed Profile fields from public X Profile page data when the existing persona is empty or weak.
- Respect selected Engine Language for generated persona and strategy text.

### Acceptance Criteria

- Connected account shows `Connected @username`.
- Avatar uses the image URL read from the X Profile page and is displayed as a circle.
- If avatar is unavailable, fallback icon is shown.
- Disconnect clears local X auth state and restores fallback UI.

## 5.2 X OAuth

### Requirements

- Use OAuth 2.0 Authorization Code with PKCE.
- Auth URL: `https://x.com/i/oauth2/authorize`.
- Callback path: `chrome.identity.getRedirectURL('x-oauth')`.
- Support popup authorization flow.
- Use public client only; never store or send Client Secret from the extension.
- Use configured Client ID:
  - `bDZmWnRPUW8zLXVaNmh1ZVVwdHA6MTpjaQ`
- Request scopes:
  - `tweet.read`
  - `users.read`
  - `offline.access`
- Store refresh token when X grants it.

### Callback URIs

Production Chrome Web Store:

`https://pnebfccjecdlpcjaonmppfidlipkojoj.chromiumapp.org/x-oauth`

Local test extension:

`https://lcpfgcaonmcncmhbiahcicgdeidjjnfi.chromiumapp.org/x-oauth`

### Acceptance Criteria

- No legacy Client ID remains.
- No Client Secret exists in source.
- OAuth can connect with the current X Developer App.
- Refresh flow can renew expired access tokens when refresh token exists.

## 5.3 Studio

### Requirements

- Accept manual text input.
- Support link extraction paths where available.
- Generate:
  - viral rewrite
  - draft reply
  - style analysis
  - visual prompt
  - profile audit
- Apply account context:
  - Account Bio
  - Account Voice
  - Posting Strategy
  - Agent Memory
  - Style Training
  - Edit Feedback
  - Preference Memory
  - Performance Memory
  - Top-performing X samples
- Enforce output language based on Engine Language.
- For Viral Rewrite, output language must follow the user's configured Engine Language, regardless of input language. Input language is used only to understand the source material correctly.
- Treat the user's current input as the only topic and intent source. Account samples, high-performing posts, Profile, and Loop memory may guide rhythm, hook strength, formatting, and tone only; they must not replace the subject, product, claim, or point of view of the current input.

### Acceptance Criteria

- Viral Rewrite and Draft Reply include performance memory and top-performing samples when available.
- Viral Rewrite follows the configured Engine Language and preserves the current-input intent.
- Generation output follows selected language setting.
- Outputs avoid common AI phrasing, hashtags by default, external links when rewriting, and unsupported Markdown styling.

## 5.4 Posts

### Requirements

Posts is the user's local content and performance vault.

Each post record should support:

- `id`
- `text`
- `origin`
- `contentMode`
- `status`
- `statusId`
- `postUrl`
- `author`
- `publishedAt`
- `savedAt`
- `actualViews`
- `performanceMetrics`
- `prediction`
- `performanceStatus`
- `aiLearning`
- `reviewedAt`
- `autoReviewEnabled`
- `nextAutoReviewAt`

Supported origins:

- `manual_rewrite`
- `auto_generated`
- `collected`
- `x_synced`

Supported content modes:

- `post`
- `reply`
- `rewrite`

### X Profile Scan Behavior

- On X connection or local baseline scan, read visible recent posts/replies from the user's X Profile page.
- Merge by `statusId`.
- Do not duplicate existing Posts records.
- Preserve user-edited text when a synced record already exists.
- Write scanned X records with origin `x_synced`.
- Keep records younger than 48 hours in `published` state.
- Review records after 48 hours when metrics are available.

### Acceptance Criteria

- Profile-scanned posts appear in Posts.
- Existing records update metrics instead of duplicating.
- 48-hour-old records can become reviewed and contribute to Loop.

## 5.5 Loop

### Requirements

Loop converts post performance into reusable writing memory.

Inputs:

- reviewed Posts records
- prediction range
- actual views
- likes
- replies
- reposts
- bookmarks when available
- content features

Processing:

- Infer content features.
- Compute actual-vs-predicted deviation.
- Classify relative performance against account baseline.
- Generate learning event.
- Compact learning events into active learned rules.

Outputs:

- `aiMemory.learningEvents`
- `aiMemory.learnedRules`
- updated `accountPerformanceBaseline`
- top-performing account samples for prompt context

### 48-Hour Review Rule

VibeX should not feed a post into Loop immediately after publishing. New posts often have unstable metrics. The default behavior is:

- Save post immediately after publishing or Profile scan.
- Schedule one review at `publishedAt + 48h`.
- At the 48-hour review, open the post page and read visible metrics once.
- Update Posts and Loop.
- Disable further auto review for that post.

This flow does not consume LLM tokens or X API credits by default. It uses visible X pages and local JavaScript calculations. LLM tokens are only consumed when generating, rewriting, analyzing, or chatting.

### Acceptance Criteria

- No 90-minute recurring all-account performance sync.
- Auto-generated posts are reviewed once after 48 hours.
- X-synced posts younger than 48 hours are not used for Loop.
- A reviewed post does not create duplicate Loop learning on later sync.

## 5.6 Auto

### Requirements

- Allow user to enable/disable automation.
- Support smart posting schedule and fixed interval schedule.
- Generate one post at execution time rather than maintaining a large queue.
- Publish through X page automation or official intent flow.
- Track daily post count and session counters.
- When AutoReply/AutoEngage starts, VibeX must open or wake an X home/feed tab and explicitly start the content-script browsing and scanning loop.
- Before navigation, only treat an X editor as unfinished when a visible composer contains real text/draft content or has an enabled submit button. Hidden or empty X editors must not block switching to For You/Search.
- Enforce safety stop after long continuous work.
- Pause on likely automation errors.

### Modes

- Auto-Engage: posting plus reply discovery.
- Auto-Post: posting only.
- Auto-Reply: reply discovery and response only.

### Acceptance Criteria

- Automation state is visible in UI.
- Publishing success writes content to Posts.
- Publishing failure pauses automation and logs the reason.

## 5.7 Reply Automation

### Requirements

- Discover relevant posts based on account strategy, topics, target handles, and quality thresholds.
- Skip low-value engagement bait, ads, project accounts when unsuitable, and irrelevant targets.
- Generate replies using selected reply strategy:
  - Minimal
  - Expert
  - Contrarian
  - Custom
- Respect cooldowns and recent replied author history.

### Acceptance Criteria

- Own posts are skipped.
- Low-value replies are rejected.
- Replies use account context and language settings.

## 5.8 Language

### Requirements

- Engine Language controls model output language.
- `auto` should infer from browser/system language.
- UI text should follow configured language where translation exists.
- Persona analysis should produce Account Voice and Posting Strategy in the selected language.

### Supported Languages

- Chinese
- English
- Japanese
- Spanish
- Indonesian

### Acceptance Criteria

- Account Voice and Posting Strategy are not hardcoded to Chinese.
- Rewrite and reply outputs obey Engine Language.

## 6. Non-Functional Requirements

### 6.1 Privacy

- Store user data locally in Chrome storage.
- Do not send Client Secret.
- Do not introduce a hosted backend requirement.
- Only send user content to configured LLM provider when generation or analysis is requested.
- Metric sync does not call LLM.

### 6.2 Reliability

- MV3 service worker must tolerate sleep/wake behavior.
- Alarms should be used for scheduled work.
- Long-running actions should write logs.
- Optional X API enhancement failures should never block the default page-scan flow.
- Token expiry should use refresh token when available; otherwise prompt reconnect through logs/errors.

### 6.3 Performance

- Avoid frequent polling.
- Avoid recurring 90-minute all-account metric sync.
- Use 48-hour post-level review for stable metrics.
- Keep local vault bounded to avoid uncontrolled storage growth.

### 6.4 Security

- Avoid unsafe DOM injection.
- Use DOM APIs for UI rendering.
- Keep OAuth public-client safe.
- Restrict host permissions to required X/Twitter and configured extraction/API endpoints.

## 7. Data Model

### 7.1 X Auth

```json
{
  "connected": true,
  "clientId": "string",
  "accessToken": "string",
  "refreshToken": "string",
  "expiresAt": 0,
  "scope": "tweet.read users.read offline.access",
  "user": {
    "id": "string",
    "name": "string",
    "username": "string",
    "description": "string",
    "profile_image_url": "string",
    "public_metrics": {}
  },
  "connectedAt": 0
}
```

### 7.2 Post Record

```json
{
  "id": "string",
  "text": "string",
  "origin": "manual_rewrite | auto_generated | collected | x_synced",
  "contentMode": "post | reply | rewrite",
  "status": "draft | published | reviewed",
  "statusId": "string",
  "postUrl": "string",
  "author": "string",
  "authorName": "string",
  "savedAt": 0,
  "publishedAt": 0,
  "actualViews": 0,
  "performanceMetrics": {
    "views": 0,
    "likes": 0,
    "replies": 0,
    "reposts": 0,
    "bookmarks": 0,
    "follows": 0
  },
  "prediction": {},
  "performanceStatus": "hit | overestimated | underestimated | unknown",
  "aiLearning": "string",
  "reviewedAt": 0,
  "autoReviewEnabled": true,
  "nextAutoReviewAt": 0
}
```

### 7.3 AI Memory

```json
{
  "learningEvents": [],
  "learnedRules": [],
  "lastReviewedAt": 0,
  "updatedAt": 0
}
```

### 7.4 Account Performance Baseline

```json
{
  "sampleCount": 0,
  "averageViews": 0,
  "medianViews": 0,
  "p75Views": 0,
  "p90Views": 0,
  "topPosts": [],
  "handle": "string",
  "updatedBy": "profile_scan | auto_review | optional_x_api_sync",
  "scannedAt": 0
}
```

## 8. Technical Architecture

### 8.1 Extension Surfaces

- `background.js`: service worker, scheduling, OAuth orchestration, post sync, auto review, generation orchestration.
- `content/x_scraper.js`: X page scraping for profile, metrics, and opportunity scanning.
- `content/x_automator.js`: browser-side posting and reply automation.
- `options/options.html`: app shell.
- `options/ui/settings.js`: Profile, settings, X connection UI, configuration persistence.
- `options/ui/logs.js`: Posts, Loop, logs rendering.
- `services/xApi.js`: OAuth and X API access.
- `services/llm.js`: model provider calls.
- `core/performanceLoop.js`: prediction, review, baseline, and learning rules.
- `core/generationContext.js`: prompt context assembly.
- `core/storageSchema.js`: normalized post and memory schema.

### 8.2 Scheduling

- `postTweetAlarm`: scheduled publishing.
- `performanceReviewAlarm`: post-level performance review.
- `autoShutdownAlarm`: safety stop.

The performance review alarm should point to the next post whose `nextAutoReviewAt` is due. For default behavior, that timestamp is 48 hours after publish or X sync creation time.

### 8.3 X API Usage

Default free-product behavior:

- X OAuth is used to establish account connection state.
- Profile identity, avatar, bio, and historical samples are read from visible X pages by DOM scan.
- 48-hour post review opens the post page and reads visible metrics.
- The default product path should not require VibeX to provide X API credits.

Optional future paid/enhanced endpoints:

- `/users/me`
- `/users/:id/tweets`
- `/tweets/:id`

Usage rules:

- Do not call X data APIs automatically in the default free flow.
- X API reads may be introduced as an explicit paid/enhanced mode with clear cost controls.
- Metric scan does not use the LLM provider and does not consume LLM tokens.

## 9. Logging Requirements

Run Logs should clearly show:

- Extension install/update.
- X OAuth request and connection.
- X connection failure and actionable error.
- Profile scan summary.
- Baseline scan start/success/fallback.
- Post generation and publish success.
- 48-hour performance review start/success/failure.
- Config saves.

## 10. Product Metrics

### Activation

- X connected successfully.
- API key configured successfully.
- Account profile seeded.

### Engagement

- Posts generated.
- Posts saved.
- Posts published.
- Manual rewrites performed.
- Replies generated and sent.

### Learning

- Posts reviewed after 48 hours.
- Learning events created.
- Learned rules count.
- Baseline sample count.
- Percentage of generated posts with reviewed metrics.

### Quality

- Generation rejection rate.
- Prediction accuracy.
- Manual edit rate.
- User likes/dislikes on generated content.

## 11. Risks and Mitigations

### X OAuth Configuration Risk

Risk: X Developer App callback URI or app type misconfiguration blocks OAuth.

Mitigation: show precise Client ID, callback URI, app type, and scope in logs.

### Token Expiry Risk

Risk: access token expires before metric review.

Mitigation: request `offline.access`, store refresh token, and prompt reconnect if refresh is unavailable.

### API Credit Risk

Risk: default product behavior consumes VibeX-owned X API credits.

Mitigation: do not use X data API calls in the free default flow. Use Profile/page scan for account identity, historical samples, and 48-hour performance review. Keep X API access as an optional future paid/enhanced path only.

### Premature Learning Risk

Risk: early views distort Loop memory.

Mitigation: only feed Loop after 48-hour review.

### Automation Safety Risk

Risk: repeated browser automation can look unnatural.

Mitigation: cooldowns, safety stop, low-value filtering, visible browser actions, and conservative scheduling.

## 12. Out of Scope

- Server-hosted dashboard.
- Multi-account management.
- Full historical backfill beyond current X API endpoint limits.
- Paid analytics ingestion.
- Team collaboration.
- Guaranteed X algorithm growth.
- Using Client Secret inside extension code.

## 13. Release Criteria

- OAuth connection works for local and production callback URI.
- Connected Profile shows handle and circular X avatar.
- Profile scan writes visible recent posts/replies into Posts without duplicates.
- Posts younger than 48 hours do not feed Loop.
- Posts at or older than 48 hours can be reviewed once and update Loop.
- No recurring 90-minute metric polling or default X API metric sync remains.
- Auto-generated posts are scheduled for one 48-hour review.
- Generation context includes Account Voice, Posting Strategy, Agent Memory, Style Training, Performance Memory, and top-performing samples.
- Checks pass:
  - `node --check background.js`
  - `node --check services/xApi.js`
  - `node --check options/ui/settings.js`
  - `node --check options/options.js`
  - `node --check core/storageSchema.js`
  - `node --check core/logCatalog.js`
  - `manifest.json` parse
  - loop tests

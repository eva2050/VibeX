# VibeX Privacy Policy Alignment Design

Date: 2026-07-14

## Objective

Align the public website privacy policy and the extension repository privacy policy with the current VibeX implementation and Chrome Web Store disclosure expectations.

## Scope

Update only:

- `/Users/eva/Documents/VibeX_page/privacy.html`
- `/Users/eva/Documents/VibeX/PRIVACY_POLICY.md`

Do not change landing-page marketing copy or Terms of Service in this task.

## Product Model

VibeX has two user-controlled modes:

- Studio and Rewrite: user-initiated content generation and rewriting.
- Auto: an optional personal Agent that uses the user's configured profile, style, language, and strategy to discover and interact with relevant people across language communities on X.

Auto is never described as risk-free. The policy will explain that it performs actions only after the user enables automation and remains subject to X rules and account controls.

## Required Disclosures

Both policies must consistently describe:

1. Data stored in `chrome.storage.local`: AI API keys, X OAuth tokens, configuration, persona and strategy, prompts, drafts, saved posts, performance metrics, logs, feedback, and learned rules.
2. X page access: visible profile information, posts, replies, engagement metrics, and page context used for requested features and enabled automation.
3. Third-party transmissions:
   - configured AI providers, including Gemini, OpenAI, OpenRouter, DeepSeek, and Qwen/DashScope;
   - X OAuth and X API endpoints when account connection requires them;
   - Jina and DataHub for link extraction when those routes are used.
4. Auto behavior: optional user-enabled posting, replying, liking, reposting, browsing, and page navigation according to the selected mode.
5. Data control: users can disconnect X, remove saved items and settings, clear extension storage, or uninstall the extension. Uninstalling may delete locally stored data.
6. Security limits: HTTPS is used for supported external transmissions, but local Chrome storage is not described as end-to-end encrypted or immune from device/browser compromise.
7. No VibeX-hosted personal-data backend and no sale of personal data.
8. Chrome permissions and why they are used.
9. Contact channel and policy update date.

## Content and Layout

The website keeps its existing visual design and English language. The legal content will use short sections, bullet lists, and explicit service names. The repository Markdown policy will mirror the same facts in a simpler document format.

## Verification

- Confirm both policies cover the same data categories and third parties.
- Confirm neither policy claims local data is encrypted.
- Confirm Auto is described as optional and user-enabled.
- Confirm `privacy.html` remains valid HTML and retains navigation/contact links.
- Inspect the final diffs for accidental changes outside the two policy files and this design record.

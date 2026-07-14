# Privacy Policy for VibeX: AI Copilot for X Growth

**Effective Date:** July 14, 2026

This Privacy Policy explains how the VibeX Chrome Extension processes information. VibeX is a local-first product and does not operate a VibeX-hosted backend that stores your API keys, X account content, drafts, or Agent memory.

## 1. Product Modes

- **Studio and Rewrite** process content when you actively request generation, rewriting, analysis, or link extraction.
- **Auto mode** is optional and runs only after you enable it. Depending on the mode you select, your personal Agent may browse X pages, discover relevant people and posts, generate or publish posts and replies, and like or repost content using your configured profile, strategy, and language settings.

Auto mode is not required to use Studio or Rewrite. You can stop Auto mode from the extension controls.

## 2. Information Processed from X

To provide account context, content assistance, performance review, and enabled Agent actions, VibeX may read information visible in your browser on X or Twitter pages, including:

- Profile name, handle, avatar, bio, and public account statistics.
- Visible posts, replies, authors, links, languages, and engagement metrics.
- The active X page, visible composer state, and page elements needed to complete an action you requested or enabled.

VibeX uses this information only for its user-facing content, Profile, Posts, Loop, and optional Auto features.

## 3. Data Stored Locally

VibeX stores product data on your device with Chrome's `chrome.storage.local` API. This may include:

- AI provider API keys and optional link-extraction API keys.
- X OAuth tokens, token expiry information, and connected public profile details.
- Language, appearance, automation, scheduling, and safety settings.
- Account positioning, prompts, writing samples, style preferences, and Agent memory.
- Drafts, generated content, saved posts, public performance metrics, feedback, learned rules, and local logs.

This local data is not sent to a VibeX-hosted personal-data database. Chrome local storage is not described as end-to-end encrypted and may be accessible to anyone who can access your browser profile or device. Protect your device and Chrome profile accordingly.

## 4. AI Providers

When you request AI generation or enable an Auto action that requires generation, VibeX sends the prompt and relevant context directly from your browser to the AI provider configured for the extension. Supported routes may include:

- Google Gemini
- OpenAI
- OpenRouter
- DeepSeek
- Qwen through Alibaba Cloud DashScope

Relevant context may include your current input, selected X post, account Profile, writing samples, preferences, and local performance memory. Your API key and submitted content are handled under the selected provider's own terms and privacy policy. VibeX does not control how a third-party provider retains or processes data.

## 5. X OAuth and X Services

If you choose to connect an X account, VibeX uses X OAuth 2.0 with PKCE. X OAuth tokens are stored locally and are sent only to X authentication or API endpoints when required to connect, validate, refresh, or use the connected account. Public Profile and performance context may also be read from visible X pages in your browser.

Disconnecting X removes the locally stored X connection state from VibeX. Your use of X remains subject to X's terms, policies, limits, and account controls.

## 6. Link Extraction Services

When you submit a link for extraction or rewriting, VibeX may send that URL to Jina Reader. For supported complex or media links, VibeX may use DataHub when you have configured the required DataHub access. The URL and extraction request are then processed under the selected service's own terms and privacy policy.

## 7. Optional Auto Mode Actions

When you explicitly enable Auto mode, VibeX may navigate visible X pages and perform the actions included in the mode you selected, such as posting, replying, liking, or reposting. These actions are performed through your logged-in X session and may be visible publicly as actions from your account.

You remain responsible for reviewing your Agent configuration, choosing appropriate frequency and language settings, monitoring its activity, and complying with X rules and applicable law.

## 8. Chrome Permissions

VibeX uses Chrome permissions to provide its disclosed features:

- `storage` stores configuration and product memory locally.
- `activeTab`, X/Twitter site access, and `scripting` read and interact with the X page needed for requested or enabled features.
- `alarms` schedules enabled posting and performance reviews.
- `sidePanel` displays the VibeX interface.
- `identity` supports the X OAuth callback flow.
- `power` may keep the display awake while you have explicitly enabled a running automation session.
- Provider and extraction host access allows direct HTTPS requests to configured AI, X, Jina, and DataHub services.

## 9. Security and Retention

Supported external requests use HTTPS. No browser extension or local storage mechanism can guarantee absolute security. VibeX retains local data until you delete it, reset extension storage, or uninstall the extension, subject to Chrome's own storage behavior. Third-party services may retain transmitted data under their own policies.

## 10. Delete or Reset Your Data

You can control VibeX data by:

- Disconnecting X.
- Removing saved posts or learning items in the extension.
- Replacing or removing API keys and settings.
- Clearing the extension's site/storage data in Chrome.
- Uninstalling VibeX.

Uninstalling or clearing extension storage may permanently remove locally stored drafts, settings, and Agent memory, so export or copy anything you need before doing so.

## 11. Data Sharing and Sale

VibeX does not sell your personal data. Data is transmitted only when needed for a feature you request or enable, such as communicating with X, your configured AI provider, Jina, or DataHub. We do not use your X content or browsing activity for advertising.

## 12. Children's Privacy

VibeX is not directed to children under 13, and we do not knowingly collect children's personal information through a VibeX-hosted service.

## 13. Policy Changes

We may update this policy as VibeX changes. Material updates will be reflected by changing the effective date above and, when appropriate, through the extension or Chrome Web Store listing.

## 14. Contact

If you have questions or concerns about this Privacy Policy, contact us on X at [@Sakura_dacc](https://x.com/Sakura_dacc) or through the GitHub repository issues page.

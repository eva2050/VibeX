# VibeX Privacy Policy Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public website and extension repository privacy policies accurately and consistently disclose VibeX data handling and optional Auto behavior.

**Architecture:** Keep the existing website layout and replace only its legal copy. Mirror the same factual disclosures in the repository Markdown policy so the public page, source repository, and Chrome Web Store declaration can remain aligned.

**Tech Stack:** Static HTML, Markdown, Chrome Extension Manifest V3

## Global Constraints

- Modify only `/Users/eva/Documents/VibeX_page/privacy.html` and `/Users/eva/Documents/VibeX/PRIVACY_POLICY.md`, plus this approved planning record.
- Do not modify landing-page marketing copy or Terms of Service.
- Describe Studio/Rewrite as user-initiated and Auto as optional and user-enabled.
- Do not claim that `chrome.storage.local` is encrypted.
- Name the actual third-party service categories and explain when data is sent.
- Preserve the existing website legal-page layout, navigation, contact link, and footer.

---

### Task 1: Public Website Privacy Policy

**Files:**
- Modify: `/Users/eva/Documents/VibeX_page/privacy.html`
- Test: `/Users/eva/Documents/VibeX/test_privacy_policy_alignment.mjs`

**Interfaces:**
- Consumes: Current VibeX data-flow facts in the approved design specification.
- Produces: A public English privacy policy whose headings and disclosures can be checked as static HTML text.

- [ ] **Step 1: Write the failing website policy check**

Create `/Users/eva/Documents/VibeX/test_privacy_policy_alignment.mjs` with assertions that the website policy contains `X OAuth tokens`, `Google Gemini`, `Jina`, `DataHub`, `Auto mode`, `HTTPS`, and `Delete or reset your data`, and does not contain a claim that local storage is encrypted.

- [ ] **Step 2: Run the check and verify it fails**

Run: `node test_privacy_policy_alignment.mjs`

Expected: FAIL because the current website policy omits the new disclosures.

- [ ] **Step 3: Replace the website legal copy**

Keep the existing HTML shell and write sections covering:

1. Scope and product modes.
2. Information processed from X pages.
3. Data stored locally.
4. AI provider transmissions.
5. X OAuth and X services.
6. Link extraction services.
7. Optional Auto actions.
8. Chrome permissions.
9. Security and retention limits.
10. User controls and deletion.
11. No sale of data, children, changes, and contact.

- [ ] **Step 4: Run the website policy check**

Run: `node test_privacy_policy_alignment.mjs`

Expected: The website assertions pass; repository assertions may still fail until Task 2.

### Task 2: Repository Policy Alignment and Verification

**Files:**
- Modify: `/Users/eva/Documents/VibeX/PRIVACY_POLICY.md`
- Modify: `/Users/eva/Documents/VibeX/test_privacy_policy_alignment.mjs`

**Interfaces:**
- Consumes: The disclosure categories established by Task 1.
- Produces: Matching Markdown policy facts and a reusable static alignment check.

- [ ] **Step 1: Add repository alignment assertions**

Extend the test so both files must mention the same required service and data categories and neither can claim local Chrome storage is encrypted.

- [ ] **Step 2: Run the check and verify repository assertions fail**

Run: `node test_privacy_policy_alignment.mjs`

Expected: FAIL against the old `PRIVACY_POLICY.md`.

- [ ] **Step 3: Rewrite the repository policy**

Mirror the website policy facts in Markdown, including local storage categories, X page context, AI providers, X OAuth, Jina/DataHub, optional Auto actions, permissions, deletion, security limits, no sale, policy changes, and contact.

- [ ] **Step 4: Run complete verification**

Run:

```bash
node test_privacy_policy_alignment.mjs
node --check test_privacy_policy_alignment.mjs
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Inspect repository boundaries**

Run:

```bash
git -C /Users/eva/Documents/VibeX status --short
git -C /Users/eva/Documents/VibeX_page status --short
```

Expected: policy-related changes only, while the pre-existing untracked `/Users/eva/Documents/VibeX/fix_test.mjs` remains untouched.

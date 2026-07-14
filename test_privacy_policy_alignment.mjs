import assert from 'node:assert/strict';
import fs from 'node:fs';

const websitePath = '/Users/eva/Documents/VibeX_page/privacy.html';
const websitePolicy = fs.readFileSync(websitePath, 'utf8');
const repositoryPolicy = fs.readFileSync(new URL('./PRIVACY_POLICY.md', import.meta.url), 'utf8');

const requiredWebsiteDisclosures = [
  'X OAuth tokens',
  'Google Gemini',
  'Jina',
  'DataHub',
  'Auto mode',
  'HTTPS',
  'Delete or reset your data'
];

requiredWebsiteDisclosures.forEach((text) => {
  assert.match(
    websitePolicy,
    new RegExp(text, 'i'),
    `Website privacy policy must disclose: ${text}`
  );
});

assert.doesNotMatch(
  websitePolicy,
  /(?:API keys?|tokens?|local data|chrome\.storage\.local)[^.<]{0,100}(?:are|is) encrypted/i,
  'Website policy must not claim that Chrome local storage is encrypted'
);

const sharedDisclosures = [
  'chrome.storage.local',
  'API keys',
  'X OAuth tokens',
  'Google Gemini',
  'OpenAI',
  'OpenRouter',
  'DeepSeek',
  'Qwen',
  'Jina',
  'DataHub',
  'Auto mode',
  'HTTPS',
  'Disconnecting X',
  'uninstall'
];

for (const disclosure of sharedDisclosures) {
  const pattern = new RegExp(disclosure.replace('.', '\\.'), 'i');
  assert.match(websitePolicy, pattern, `Website policy must mention: ${disclosure}`);
  assert.match(repositoryPolicy, pattern, `Repository policy must mention: ${disclosure}`);
}

for (const [name, policy] of [['website', websitePolicy], ['repository', repositoryPolicy]]) {
  assert.doesNotMatch(
    policy,
    /(?:API keys?|tokens?|local data|chrome\.storage\.local)[^.<\n]{0,100}(?:are|is) encrypted/i,
    `${name} policy must not claim that Chrome local storage is encrypted`
  );
  assert.match(policy, /does not sell your personal data/i, `${name} policy must state that personal data is not sold`);
}

console.log('privacy policy alignment checks passed');

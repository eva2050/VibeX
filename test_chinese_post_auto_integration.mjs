import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveContentSkill } from './core/contentSkills/registry.js';
import './core/contentSkills/zh/postSkill.js';
import {
  buildAutoPostPrompt,
  buildAutoPostSkillContext,
  buildAutoPostSkillMetadata
} from './core/automation.js';

const contentSkill = resolveContentSkill({
  language: 'zh',
  format: 'post',
  objective: 'auto_post'
});
const skillContext = buildAutoPostSkillContext({
  contentSkill,
  sourceText: 'AI 产品开发记录：这周删掉了自动发布里一个不可靠的步骤。'
});
const autoPostPrompt = buildAutoPostPrompt({
  config: { accountBio: '记录 AI 产品开发和真实工作流' },
  generationContext: {},
  persona: {},
  outputLangInstruction: 'CHINESE (zh)',
  contentSkillContext: skillContext.prompt
});

assert.match(autoPostPrompt, /zh-x-post@1\.0\.0/);
assert.match(autoPostPrompt, /中文 X 内容诊断/);
assert.match(autoPostPrompt, /中文 X Post Skill 独立评审/);
assert.doesNotMatch(autoPostPrompt, /studio_reply|auto_relationship/);

const metadata = buildAutoPostSkillMetadata(contentSkill, '这周删掉了自动发布里一个不可靠的步骤。');
assert.deepEqual(metadata, {
  contentSkillId: 'zh-x-post',
  contentSkillVersion: '1.0.0',
  contentFamily: 'build_in_public'
});

const backgroundSource = readFileSync(new URL('./background.js', import.meta.url), 'utf8');
const automationSource = readFileSync(new URL('./core/automation.js', import.meta.url), 'utf8');
assert.match(automationSource, /objective: 'auto_post'/);
assert.match(automationSource, /config\.contentSkillRollout\?\.zhPost === true/);
assert.match(backgroundSource, /pendingPostMetadata/);
assert.match(backgroundSource, /contentSkillVersion: existing\?\.contentSkillVersion/);
const replyStart = backgroundSource.indexOf('async function generateAIResponse');
const replyEnd = backgroundSource.indexOf('\nfunction ', replyStart + 20);
const autoReplySource = backgroundSource.slice(replyStart, replyEnd > replyStart ? replyEnd : undefined);
assert.doesNotMatch(autoReplySource, /zh-x-post|中文 X 内容诊断/);

console.log('Chinese post Auto integration checks passed');

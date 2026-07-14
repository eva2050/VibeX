import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// content/logic/evaluator.js is a plain browser IIFE (not an ES module) that
// attaches its API to `window`. Load it the same way the content script
// context does, by giving it a `window` global inside a fresh VM context.
const source = fs.readFileSync(new URL('./content/logic/evaluator.js', import.meta.url), 'utf8');
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const { hasRelevantTopic, keywordMatchesText, collectTopicKeywords } = sandbox.VibeXEvaluator;

// Regression: naive substring matching let "ai" match inside completely
// unrelated words, making the topic-relevance filter close to a no-op for
// English tweets. Word-boundary matching should stop those false positives...
assert.equal(keywordMatchesText('he said he would maintain the raise', 'ai'), false);
assert.equal(keywordMatchesText('captain of the ship', 'ai'), false);
// ...while still matching genuine standalone mentions.
assert.equal(keywordMatchesText('this ai model is impressive', 'ai'), true);
assert.equal(keywordMatchesText('AI is changing everything', 'ai'), true);

// Multi-word Latin phrases should still match as a whole phrase.
assert.equal(keywordMatchesText('day 12 of build in public', 'build in public'), true);
assert.equal(keywordMatchesText('nothing related here', 'build in public'), false);

// CJK keywords keep substring matching (no whitespace word boundaries in
// Chinese), so this must remain unaffected by the Latin-only boundary logic.
assert.equal(keywordMatchesText('这条推文在聊产品增长的事', '产品'), true);
assert.equal(keywordMatchesText('这条推文和用户没关系', '产品'), false);

// End-to-end: hasRelevantTopic on a tweet that merely happens to contain "ai"
// as a substring of another word should no longer be considered relevant
// just because of that; it should still correctly flag genuinely on-topic
// tweets that mention AI/tools/etc. as real words.
const state = { onboardingStrategy: {}, agentMemory: {}, aiPersona: {} };
assert.equal(
  hasRelevantTopic('I said we should maintain our current plan and raise later', state),
  false
);
assert.equal(
  hasRelevantTopic('Just shipped an AI agent that automates my workflow', state),
  true
);

// Sanity: the keyword list itself is unchanged in shape/size expectations -
// this isn't meant to redesign the list, just fix how it's matched.
assert.ok(collectTopicKeywords(state).includes('ai'));
assert.ok(collectTopicKeywords(state).includes('产品'));

console.log('topic relevance keyword matching checks passed');

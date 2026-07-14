import assert from 'node:assert/strict';
import {
  LEARNING_OBJECTIVE,
  RULE_STATE,
  STORAGE_SCHEMA_VERSION,
  migrateStoragePayload
} from './core/storageSchema.js';

const migrated = migrateStoragePayload({
  storageSchemaVersion: 3,
  draftVault: [
    {
      id: 'manual',
      text: 'draft',
      origin: 'manual_rewrite',
      contentMode: 'rewrite'
    },
    {
      id: 'auto',
      text: 'post',
      origin: 'auto_generated',
      contentMode: 'post'
    }
  ],
  aiMemory: {
    learnedRules: [{ text: 'legacy rule', contentMode: 'post', confidence: 95 }]
  }
});

assert.equal(STORAGE_SCHEMA_VERSION, 4);
assert.equal(migrated.storageSchemaVersion, 4);
assert.equal(migrated.draftVault[0].objective, LEARNING_OBJECTIVE.STUDIO_REWRITE);
assert.equal(migrated.draftVault[1].objective, LEARNING_OBJECTIVE.AUTO_POST);
assert.equal(migrated.aiMemory.learnedRules[0].ruleState, RULE_STATE.LEGACY);
assert.equal(migrated.aiMemory.learnedRules[0].active, false);
assert.deepEqual(migrated.generationSessions, []);
assert.deepEqual(migrated.relationshipInteractions, []);

const preserved = migrateStoragePayload({
  storageSchemaVersion: 4,
  draftVault: [{
    id: 'reply',
    text: 'useful reply',
    contentMode: 'reply',
    objective: 'auto_relationship'
  }],
  aiMemory: {
    learnedRules: [{
      id: 'active-rule',
      text: 'active rule',
      contentMode: 'reply',
      objective: 'auto_relationship',
      ruleState: 'active',
      active: true
    }]
  },
  generationSessions: [{ id: 'gen-1', selectedText: 'AI draft', finalText: 'User draft' }],
  relationshipInteractions: [{ id: 'rel-1' }]
});

assert.equal(preserved.draftVault[0].objective, LEARNING_OBJECTIVE.AUTO_RELATIONSHIP);
assert.equal(preserved.aiMemory.learnedRules[0].ruleState, RULE_STATE.ACTIVE);
assert.equal(preserved.aiMemory.learnedRules[0].active, true);
assert.equal(preserved.generationSessions[0].id, 'gen-1');
assert.equal(preserved.generationSessions[0].finalText, 'User draft');
assert.equal(preserved.relationshipInteractions[0].id, 'rel-1');

console.log('storage schema v4 checks passed');

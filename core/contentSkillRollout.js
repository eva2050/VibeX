const CONTENT_SKILL_ROLLOUT_SCHEMA_VERSION = 2;

function normalizeContentSkillRollout(value = {}) {
  const isCurrentSchema = Number(value?.schemaVersion) === CONTENT_SKILL_ROLLOUT_SCHEMA_VERSION;
  if (!isCurrentSchema) {
    return {
      schemaVersion: CONTENT_SKILL_ROLLOUT_SCHEMA_VERSION,
      zhPostStudio: true,
      zhPostAuto: false
    };
  }
  return {
    schemaVersion: CONTENT_SKILL_ROLLOUT_SCHEMA_VERSION,
    zhPostStudio: value.zhPostStudio !== false,
    zhPostAuto: value.zhPostAuto === true
  };
}

export { CONTENT_SKILL_ROLLOUT_SCHEMA_VERSION, normalizeContentSkillRollout };

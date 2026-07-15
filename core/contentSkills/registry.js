const contentSkillRegistry = new Map();

function normalizeSkillKey({ language = '', format = '', objective = '' } = {}) {
  return [language, format, objective]
    .map(value => String(value || '').trim().toLowerCase())
    .join('|');
}

function registerContentSkill(skill = {}) {
  const objectives = Object.freeze([...(Array.isArray(skill.objectives) ? skill.objectives : [])]);
  if (!skill.id || !skill.version || !skill.language || !skill.format || objectives.length === 0) {
    throw new Error('Content Skill requires id, version, language, format, and objectives');
  }
  const frozenSkill = Object.freeze({ ...skill, objectives });
  objectives.forEach((objective) => {
    contentSkillRegistry.set(normalizeSkillKey({
      language: frozenSkill.language,
      format: frozenSkill.format,
      objective
    }), frozenSkill);
  });
  return frozenSkill;
}

function resolveContentSkill(query = {}) {
  return contentSkillRegistry.get(normalizeSkillKey(query)) || null;
}

function getRegisteredContentSkills() {
  return [...new Set(contentSkillRegistry.values())];
}

export {
  getRegisteredContentSkills,
  registerContentSkill,
  resolveContentSkill
};

function normalizeContentSkillRollout(value = {}) {
  const hasSplitSchema = Object.hasOwn(value || {}, 'zhPostStudio')
    || Object.hasOwn(value || {}, 'zhPostAuto');
  if (!hasSplitSchema) return { zhPostStudio: false, zhPostAuto: false };
  return {
    zhPostStudio: value.zhPostStudio === true,
    zhPostAuto: value.zhPostAuto === true
  };
}

export { normalizeContentSkillRollout };

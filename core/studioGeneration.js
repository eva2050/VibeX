import { buildStudioPrompt } from './studioPrompt.js';
import { assessStudioOutputQuality } from './studioQuality.js';

const STUDIO_PASS_SCORE = 82;

const REWRITE_CANDIDATE_BRIEFS = [
  'Write one publication-ready draft. Start from a concrete signal already present in the source, preserve its claim and certainty, and add no facts.'
];

const REPLY_CANDIDATE_BRIEFS = [
  'Write one specific, relevant reply that gives the author something useful to respond to without summarizing, flattering, or overclaiming.'
];

function cleanModelText(value = '') {
  return String(value || '')
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/\*\*|__/g, '')
    .trim();
}

function getCandidateBriefs(promptType = '') {
  return promptType === 'draft_reply'
    ? REPLY_CANDIDATE_BRIEFS
    : REWRITE_CANDIDATE_BRIEFS;
}

function getCandidatePlans(input = {}, contentSkill = null, diagnosis = null) {
  if (contentSkill && diagnosis) {
    return contentSkill.selectCandidateStrategies(diagnosis).slice(0, 1).map((strategy) => ({
      brief: contentSkill.buildCandidateInstruction(strategy, diagnosis),
      strategyId: strategy.id
    }));
  }
  return getCandidateBriefs(input.promptType).slice(0, 1).map(brief => ({ brief, strategyId: '' }));
}

function buildCandidatePrompt(input = {}, brief = '') {
  return buildStudioPrompt({
    promptType: input.promptType,
    promptPrefix: input.promptPrefix || '',
    textToProcess: input.sourceText || '',
    config: input.config || { engineLanguage: input.engineLanguage || 'auto' },
    generationContext: input.generationContext || {},
    langConstraint: input.langConstraint || '',
    inputLockConstraint: input.inputLockConstraint || '',
    strictAntiAI: input.strictAntiAI || '',
    regenerateConstraint: input.regenerateConstraint || '',
    candidateBrief: brief,
    includePerformanceMemory: input.includePerformanceMemory !== false,
    includeTopPerformanceSamples: false
  });
}

function buildCandidateRecord(value, index, input = {}, strategyId = '', contentSkill = null, diagnosis = null) {
  const text = cleanModelText(value);
  const quality = assessStudioOutputQuality(input.sourceText, text, {
    engineLanguage: input.engineLanguage,
    requireTopicOverlap: true,
    requireConcreteSignal: input.promptType !== 'draft_reply'
  });
  return {
    id: `candidate-${String.fromCharCode(97 + index)}`,
    text,
    ...(strategyId ? { strategyId } : {}),
    deterministicIssues: [...new Set([
      ...quality.issues,
      ...(contentSkill && diagnosis
        ? contentSkill.evaluateDeterministically(input.sourceText, text, diagnosis).issues
        : [])
    ])]
  };
}

function buildJudgePrompt(input = {}, candidates = [], contentSkill = null, diagnosis = null) {
  if (contentSkill && diagnosis) {
    return [
      'You are an independent quality judge for X writing. Return valid JSON only.',
      contentSkill.buildJudgeInstruction(diagnosis),
      `Required output language: ${input.engineLanguage || 'auto'}.`,
      `Source text: ${input.sourceText || ''}`,
      `A passing candidate needs at least ${STUDIO_PASS_SCORE} and no hard failure.`,
      `Candidates: ${JSON.stringify(candidates)}`
    ].join('\n');
  }
  return [
    'You are an independent quality judge for X writing. Return valid JSON only.',
    `Required output language: ${input.engineLanguage || 'auto'}.`,
    `Source text: ${input.sourceText || ''}`,
    'Score each candidate out of 100 with this exact rubric:',
    '- topic and claim fidelity: 30',
    '- specificity and information gain: 20',
    '- natural human voice: 20',
    '- account/style fit: 15',
    '- hook and mobile readability: 15',
    `A passing candidate needs at least ${STUDIO_PASS_SCORE} and no hard failure.`,
    'Unsupported facts, wrong language, topic drift, or changing uncertainty into certainty are hard failures.',
    `Candidates: ${JSON.stringify(candidates)}`,
    'Return: {"selectedCandidateId":"candidate-a","scores":[{"id":"candidate-a","total":0,"hardFailures":[]}],"rationale":"..."}'
  ].join('\n');
}

function parseJudgeResult(raw = '') {
  try {
    const cleaned = String(raw || '')
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed?.selectedCandidateId || !Array.isArray(parsed.scores)) {
      throw new Error('missing judge fields');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid Studio judge response: ${error.message}`);
  }
}

function buildRepairPrompt(input = {}, selected = {}, judge = {}, hardFailures = [], contentSkill = null, diagnosis = null) {
  return [
    'Repair the draft below. Return only the repaired X text.',
    contentSkill && diagnosis ? contentSkill.buildRepairInstruction(diagnosis, hardFailures) : '',
    `Required language: ${input.engineLanguage || 'auto'}.`,
    `Source text: ${input.sourceText || ''}`,
    `Draft: ${selected.text || ''}`,
    `Quality failures: ${JSON.stringify([...hardFailures, judge.rationale].filter(Boolean))}`,
    'Preserve the source topic, claim, certainty, entities, and facts. Add no unsupported detail.',
    'Make the result concrete, natural, concise, and useful.'
  ].filter(Boolean).join('\n');
}

async function orchestrateStudioGeneration(input = {}, dependencies = {}) {
  const callModel = dependencies.callModel;
  if (typeof callModel !== 'function') throw new Error('Studio callModel dependency is required');
  const onPhase = typeof dependencies.onPhase === 'function' ? dependencies.onPhase : () => {};
  const requestedSkill = input.promptType === 'viral_rewrite' ? input.contentSkill : null;
  const contentSkill = requestedSkill?.supports({ text: input.sourceText }) ? requestedSkill : null;
  const diagnosis = contentSkill ? contentSkill.analyze({ text: input.sourceText }) : null;
  const plans = getCandidatePlans(input, contentSkill, diagnosis);

  const plan = plans[0] || { brief: '', strategyId: '' };
  onPhase('generating_draft');
  let rawDraft = '';
  try {
    rawDraft = await callModel(buildCandidatePrompt(input, plan.brief));
  } catch (error) {
    throw new Error(`Studio draft call failed: ${error.message}`);
  }
  const draft = buildCandidateRecord(
    rawDraft,
    0,
    input,
    plan.strategyId,
    contentSkill,
    diagnosis
  );
  if (!draft.text) throw new Error('Studio draft call failed: empty output');
  const candidates = [draft];

  onPhase('reviewing_draft');
  const judge = parseJudgeResult(await callModel(buildJudgePrompt(input, candidates, contentSkill, diagnosis)));
  const selected = candidates.find(candidate => candidate.id === judge.selectedCandidateId);
  const selectedScore = judge.scores.find(score => score.id === judge.selectedCandidateId);
  if (!selected || !selectedScore) {
    throw new Error('Studio judge selected an unavailable candidate');
  }
  const hardFailures = [
    ...selected.deterministicIssues,
    ...(Array.isArray(selectedScore.hardFailures) ? selectedScore.hardFailures : [])
  ];
  if (Number(selectedScore.total) >= STUDIO_PASS_SCORE && hardFailures.length === 0) {
    return {
      text: selected.text,
      selectedCandidateId: selected.id,
      candidates,
      judge,
      repaired: false,
      quality: { approved: true, issues: [] },
      ...(contentSkill ? {
        contentSkill: { id: contentSkill.id, version: contentSkill.version },
        contentFamily: diagnosis.family,
        candidateStrategyIds: candidates.map(candidate => candidate.strategyId).filter(Boolean)
      } : {})
    };
  }

  onPhase('repairing_draft');
  const repairedText = cleanModelText(await callModel(
    buildRepairPrompt(input, selected, judge, hardFailures, contentSkill, diagnosis)
  ));
  const repairedQuality = assessStudioOutputQuality(input.sourceText, repairedText, {
    engineLanguage: input.engineLanguage,
    requireTopicOverlap: true,
    requireConcreteSignal: input.promptType !== 'draft_reply'
  });
  if (!repairedQuality.approved) {
    throw new Error(`Studio repair failed quality gate: ${repairedQuality.issues.join(', ')}`);
  }
  const skillRepairQuality = contentSkill
    ? contentSkill.evaluateDeterministically(input.sourceText, repairedText, diagnosis)
    : { approved: true, issues: [] };
  if (!skillRepairQuality.approved) {
    throw new Error(`Studio repair failed content Skill gate: ${skillRepairQuality.issues.join(', ')}`);
  }
  return {
    text: repairedText,
    selectedCandidateId: selected.id,
    candidates,
    judge,
    repaired: true,
    quality: repairedQuality,
    ...(contentSkill ? {
      contentSkill: { id: contentSkill.id, version: contentSkill.version },
      contentFamily: diagnosis.family,
      candidateStrategyIds: candidates.map(candidate => candidate.strategyId).filter(Boolean)
    } : {})
  };
}

export {
  REPLY_CANDIDATE_BRIEFS,
  REWRITE_CANDIDATE_BRIEFS,
  STUDIO_PASS_SCORE,
  buildCandidatePrompt,
  buildJudgePrompt,
  buildRepairPrompt,
  cleanModelText,
  getCandidateBriefs,
  getCandidatePlans,
  orchestrateStudioGeneration,
  parseJudgeResult
};

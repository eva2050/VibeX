import { buildStudioPrompt } from './studioPrompt.js';
import { assessStudioOutputQuality } from './studioQuality.js';

const STUDIO_PASS_SCORE = 82;

const REWRITE_CANDIDATE_BRIEFS = [
  'Faithful compression with a concrete first-line hook. Preserve the source claim and do not add facts.',
  'Use contrast or variable reversal without changing the source claim, topic, or factual certainty.',
  'Use a natural observation or short narrative structure without adding people, products, data, or events.'
];

const REPLY_CANDIDATE_BRIEFS = [
  'Respond with one specific, relevant observation that gives the author something useful to reply to.',
  'Use a different concrete angle without repeating, summarizing, flattering, or overclaiming.'
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

function buildCandidateRecord(value, index, input = {}) {
  const text = cleanModelText(value);
  const quality = assessStudioOutputQuality(input.sourceText, text, {
    engineLanguage: input.engineLanguage,
    requireTopicOverlap: true,
    requireConcreteSignal: input.promptType !== 'draft_reply'
  });
  return {
    id: `candidate-${String.fromCharCode(97 + index)}`,
    text,
    deterministicIssues: quality.issues
  };
}

function buildJudgePrompt(input = {}, candidates = []) {
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

function buildRepairPrompt(input = {}, selected = {}, judge = {}, hardFailures = []) {
  return [
    'Repair the draft below. Return only the repaired X text.',
    `Required language: ${input.engineLanguage || 'auto'}.`,
    `Source text: ${input.sourceText || ''}`,
    `Draft: ${selected.text || ''}`,
    `Quality failures: ${JSON.stringify([...hardFailures, judge.rationale].filter(Boolean))}`,
    'Preserve the source topic, claim, certainty, entities, and facts. Add no unsupported detail.',
    'Make the result concrete, natural, concise, and useful.'
  ].join('\n');
}

async function orchestrateStudioGeneration(input = {}, dependencies = {}) {
  const callModel = dependencies.callModel;
  if (typeof callModel !== 'function') throw new Error('Studio callModel dependency is required');
  const onPhase = typeof dependencies.onPhase === 'function' ? dependencies.onPhase : () => {};
  const briefs = getCandidateBriefs(input.promptType);

  onPhase('generating_candidates');
  const settled = await Promise.allSettled(
    briefs.map(brief => callModel(buildCandidatePrompt(input, brief)))
  );
  const candidates = settled.flatMap((entry, index) => {
    if (entry.status !== 'fulfilled') return [];
    const candidate = buildCandidateRecord(entry.value, index, input);
    return candidate.text ? [candidate] : [];
  });
  if (!candidates.length) throw new Error('All Studio candidate calls failed');

  onPhase('judging_candidates');
  const judge = parseJudgeResult(await callModel(buildJudgePrompt(input, candidates)));
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
      quality: { approved: true, issues: [] }
    };
  }

  onPhase('repairing_candidate');
  const repairedText = cleanModelText(await callModel(
    buildRepairPrompt(input, selected, judge, hardFailures)
  ));
  const repairedQuality = assessStudioOutputQuality(input.sourceText, repairedText, {
    engineLanguage: input.engineLanguage,
    requireTopicOverlap: true,
    requireConcreteSignal: input.promptType !== 'draft_reply'
  });
  if (!repairedQuality.approved) {
    throw new Error(`Studio repair failed quality gate: ${repairedQuality.issues.join(', ')}`);
  }
  return {
    text: repairedText,
    selectedCandidateId: selected.id,
    candidates,
    judge,
    repaired: true,
    quality: repairedQuality
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
  orchestrateStudioGeneration,
  parseJudgeResult
};

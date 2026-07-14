import assert from 'node:assert/strict';
import { analyzeStyleSample, formatStyleSampleLearningForPrompt, getStyleSamples } from './core/styleLearning.js';
import { buildGenerationContext, formatStyleTrainingForPrompt } from './core/generationContext.js';

const sample = `京东赌的是国家经济越来越向好，然后中产家庭越来越多，京东客户也就越多。

淘宝赌的是贫困人口会逐渐减少，网购人群会不断扩大，同时发展了一个天猫用于服务高端群体。

拼多多赌的是贫困人口越来越多，消费不断降级。
结果竟然让拼多多赌对了。`;

const analysis = analyzeStyleSample(sample);
assert.equal(analysis.hook, '用数字或具体对象提高可信度');
assert.equal(analysis.structure, '多对象对照：逐个解释变量，最后给出胜负手');
assert.ok(analysis.strengths.some(item => item.includes('具体对象')));
assert.ok(analysis.reusableRules.some(item => item.includes('对象 A')));

const lightRoastSample = `以前失业：我是个自由职业者。
现在失业：CEO，好久不见🤝

从原来的自由职业者，到现在的一人公司。劳心劳力干了半年，有谁实现了稳定现金流的——

麻烦请举手让我嫉妒一下🙋`;

const lightRoast = analyzeStyleSample(lightRoastSample);
assert.match(lightRoast.structure, /低频轻吐槽对照/);
assert.ok(lightRoast.strengths.some(item => item.includes('轻吐槽')));
assert.ok(lightRoast.reusableRules.some(item => item.includes('10-15%')));

const experienceReframeSample = `越来越觉得，vibe coding 更像一种创造型消费，做东西也只是为了短暂的悦己。

产品没人用，商业逻辑跑不通，甚至你自己下周都不会再打开页面看一眼。

可那又怎样呢？你在做的时候是开心的，这件事本身就已经成立了。刷短视频是别人喂你多巴胺，vibe coding 是你自己造一点内啡肽。`;

const experienceReframe = analyzeStyleSample(experienceReframeSample);
assert.match(experienceReframe.structure, /体验重命名/);
assert.ok(experienceReframe.strengths.some(item => item.includes('活人感')));
assert.ok(experienceReframe.reusableRules.some(item => item.includes('情绪许可')));

const samples = getStyleSamples(['a', 'b', 'c', 'd', 'e', 'f'], 5);
assert.deepEqual(samples, ['b', 'c', 'd', 'e', 'f']);

const prompt = formatStyleSampleLearningForPrompt([sample]);
assert.match(prompt, /为什么优质/);
assert.match(prompt, /可复用规则/);
assert.match(prompt, /不要复制原句/);

const stylePrompt = formatStyleTrainingForPrompt([sample]);
assert.match(stylePrompt, /优质推文样本学习/);
assert.match(stylePrompt, /输出约束/);
assert.match(stylePrompt, /变量解释/);
assert.doesNotMatch(stylePrompt, /【绝密数据】/);
assert.match(stylePrompt, /严禁使用任何常见 AI 模板/);

const context = buildGenerationContext({
  styleTrainingData: [sample]
}, { promptType: 'viral_rewrite' });
assert.match(context.stylePrompt, /为什么优质/);
assert.match(context.stylePrompt, /多对象对照/);

console.log('style learning checks passed');

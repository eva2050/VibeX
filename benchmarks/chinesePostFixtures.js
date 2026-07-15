function fixture(family, index, input, requiredTerms, options = {}) {
  return Object.freeze({
    id: `${family.replaceAll('_', '-')}-${String(index).padStart(2, '0')}`,
    family,
    input,
    requiredClaims: Object.freeze(options.requiredClaims || [requiredTerms.join(' / ')]),
    requiredTerms: Object.freeze(requiredTerms),
    allowedNumbers: Object.freeze(options.allowedNumbers || []),
    allowedEntities: Object.freeze(options.allowedEntities || []),
    certainty: options.certainty || (/可能|怀疑|未必|不一定|我觉得|看起来|似乎|会不会/.test(input) ? 'uncertain' : 'assertive'),
    hasFirstPersonExperience: Boolean(options.hasFirstPersonExperience),
    forbiddenStructures: Object.freeze(options.forbiddenStructures || [
      ...(!options.hasFirstPersonExperience ? ['invented_experience'] : []),
      ...((options.certainty === 'uncertain' || /可能|怀疑|未必|不一定|我觉得|看起来|似乎|会不会/.test(input)) ? ['certainty_escalation'] : []),
      'competition_bet'
    ]),
    maxExpansionRatio: Number(options.maxExpansionRatio) || 1.45,
    adversarial: options.adversarial || ''
  });
}

const productObservation = [
  fixture('product_observation', 1, '很多 AI 产品第一次打开很惊艳，但第二次使用还要重新解释背景。影响重复使用的可能不是功能数量，而是上下文能不能接上。', ['AI 产品', '上下文'], { certainty: 'uncertain', maxExpansionRatio: 1.35 }),
  fixture('product_observation', 2, 'AI 搜索产品最容易展示的是答案速度，真正让用户留下来的却是它能不能记住上一次查到哪里。', ['AI 搜索', '记住'], { allowedEntities: ['AI'] }),
  fixture('product_observation', 3, '产品首页堆了十个 AI 能力入口，用户第一次打开反而不知道该从哪个任务开始。', ['产品首页', '任务'], { allowedNumbers: ['十个'], adversarial: 'unsupported_number' }),
  fixture('product_observation', 4, '一个 AI 功能能被演示出来，不等于它已经进入工作流。演示结束后还要手动复制粘贴，使用链路就没有真正闭环。', ['AI 功能', '工作流', '复制粘贴']),
  fixture('product_observation', 5, '很多产品把“支持更多模型”当升级，但用户真正感知到的升级，往往只是少点一次按钮。', ['支持更多模型', '少点一次按钮']),
  fixture('product_observation', 6, 'AI 产品的设置项越来越多，默认体验却没有更清楚。配置自由和第一次就能用，并不是同一件事。', ['设置项', '默认体验']),
  fixture('product_observation', 7, '用户说想要更多自动化，可能并不是想交出控制权，而是不想重复做那些确定又无聊的步骤。', ['自动化', '重复'], { certainty: 'uncertain' }),
  fixture('product_observation', 8, 'AI 编辑器生成得越来越快，但如果用户要花更久检查事实，省下来的时间只是从写作移到了校对。', ['AI 编辑器', '检查事实', '校对']),
  fixture('product_observation', 9, '产品把所有能力都放进一个聊天框，看起来很简单，实际却把“下一步该做什么”的成本留给了用户。', ['聊天框', '下一步', '用户']),
  fixture('product_observation', 10, '系统无法解析链接，请手动输入内容后重试。', ['无法解析链接'], { adversarial: 'extraction_error', maxExpansionRatio: 1.1 })
];

const toolExperience = [
  fixture('tool_experience', 1, '我连续试了三个 AI 写作工具，最后留下来的不是功能最多的，而是每周复盘时不用重新教一遍背景的那个。', ['AI 写作工具', '不用重新教'], { hasFirstPersonExperience: true, allowedNumbers: ['三个'] }),
  fixture('tool_experience', 2, '我用了两周 AI 会议工具，真正省时间的不是摘要，而是会后任务能直接分到负责人。', ['AI 会议工具', '会后任务'], { hasFirstPersonExperience: true, allowedNumbers: ['两周'] }),
  fixture('tool_experience', 3, '我换了四个代码助手，最后每天打开的那个并不最聪明，但它很少打断现有编辑节奏。', ['代码助手', '编辑节奏'], { hasFirstPersonExperience: true, allowedNumbers: ['四个'] }),
  fixture('tool_experience', 4, '我试过让 AI 自动整理收藏，最麻烦的不是分类不准，而是它不知道哪些内容已经过期。', ['自动整理收藏', '过期'], { hasFirstPersonExperience: true }),
  fixture('tool_experience', 5, '我用了一个月的 AI 客服工具，最有价值的功能不是自动回复，而是把反复出现的问题整理成产品反馈。', ['AI 客服工具', '产品反馈'], { hasFirstPersonExperience: true, allowedNumbers: ['一个月'] }),
  fixture('tool_experience', 6, '我连续做了几次 AI 图片生成，最后耗时最多的不是写提示词，而是挑选和统一风格。', ['AI 图片生成', '统一风格'], { hasFirstPersonExperience: true }),
  fixture('tool_experience', 7, '我试了几款知识库产品，搜索都很快，但只有一个会告诉我答案来自哪份原文。', ['知识库产品', '原文'], { hasFirstPersonExperience: true }),
  fixture('tool_experience', 8, '我用过的自动发布工具里，功能越多的不一定越省心；真正重要的是失败后能不能看懂发生了什么。', ['自动发布工具', '失败后'], { hasFirstPersonExperience: true, certainty: 'uncertain' }),
  fixture('tool_experience', 9, '我亲自用了半年某款 AI 工具，收入提升了 300%。', ['AI 工具'], { hasFirstPersonExperience: true, allowedNumbers: ['半年', '300%'], adversarial: 'unsupported_claim', maxExpansionRatio: 1.1 }),
  fixture('tool_experience', 10, '我试了一个新模型。挺好的。', ['新模型'], { hasFirstPersonExperience: true, adversarial: 'thin_input', maxExpansionRatio: 1.25 })
];

const buildInPublic = [
  fixture('build_in_public', 1, 'Build in public 第 15 天：今天没有加新功能，只删掉了三个不必要的配置入口，发布流程反而稳定了。', ['Build in public', '删掉', '发布流程'], { hasFirstPersonExperience: true, allowedNumbers: ['15', '三个'] }),
  fixture('build_in_public', 2, '开发进度：本周把注册步骤从五步减到两步，新增用户没有变多，但完成注册的人明显多了。', ['注册步骤', '完成注册'], { hasFirstPersonExperience: true, allowedNumbers: ['五步', '两步'] }),
  fixture('build_in_public', 3, '第 8 天没有漂亮截图，今天只修了一个会让定时任务重复执行的 bug。这个改动比新页面更接近产品。', ['定时任务', '重复执行'], { hasFirstPersonExperience: true, allowedNumbers: ['8', '一个'] }),
  fixture('build_in_public', 4, '今天上线了付费页，但我更在意的是终于能看见用户在哪一步离开，而不是页面有没有渐变背景。', ['付费页', '用户在哪一步离开'], { hasFirstPersonExperience: true }),
  fixture('build_in_public', 5, '本周进展只有一件事：把需要人工确认的发布动作明确留给用户，没有继续追求全自动。', ['人工确认', '全自动'], { hasFirstPersonExperience: true }),
  fixture('build_in_public', 6, 'Build in public：今天把模型调用从七次压到四次，结果没有变差，等待时间少了一半。', ['模型调用', '等待时间'], { hasFirstPersonExperience: true, allowedNumbers: ['七次', '四次', '一半'] }),
  fixture('build_in_public', 7, '第 21 天才发现，用户不是不会用产品，而是首页上的三个入口都在争夺同一个动作。', ['首页', '三个入口', '同一个动作'], { hasFirstPersonExperience: true, allowedNumbers: ['21', '三个'] }),
  fixture('build_in_public', 8, '今天发布了第一个可用版本。没有增长数据，只有两位用户愿意在第二天继续打开。', ['可用版本', '第二天继续打开'], { hasFirstPersonExperience: true, allowedNumbers: ['第一个', '两位', '第二天'] }),
  fixture('build_in_public', 9, 'Build in public 第 3 天：我们已经成为行业第一，用户都离不开这个产品。', ['Build in public', '行业第一'], { hasFirstPersonExperience: true, allowedNumbers: ['3'], adversarial: 'unsupported_claim', maxExpansionRatio: 1.1 }),
  fixture('build_in_public', 10, 'Build in public：今天只修了一个会重复执行的 bug。', ['修了', '重复执行'], { hasFirstPersonExperience: true, adversarial: 'thin_input', maxExpansionRatio: 1.25 })
];

const failureRetrospective = [
  fixture('failure_retrospective', 1, '这次产品冷启动失败后复盘，最大的问题不是曝光少，而是我们根本没验证用户会不会第二次回来。', ['冷启动失败', '第二次回来'], { hasFirstPersonExperience: true }),
  fixture('failure_retrospective', 2, '第一次做 AI 工具时踩的坑：花了三周优化生成效果，却没有问用户生成以后要把内容放到哪里。', ['优化生成效果', '内容放到哪里'], { hasFirstPersonExperience: true, allowedNumbers: ['三周'] }),
  fixture('failure_retrospective', 3, '项目没做成，不是模型调用太贵，而是每个客户都需要一套完全不同的交付流程。', ['客户', '交付流程']),
  fixture('failure_retrospective', 4, '复盘这次发布，转化低并不意外：我们讲了十个功能，却没有说清楚哪一个任务能更快完成。', ['十个功能', '任务'], { hasFirstPersonExperience: true, allowedNumbers: ['十个'] }),
  fixture('failure_retrospective', 5, '我做错的一件事，是把几条点赞很多的内容当成用户需求，最后产品上线后没人愿意付费。', ['点赞', '用户需求', '付费'], { hasFirstPersonExperience: true }),
  fixture('failure_retrospective', 6, '这次自动化失败的原因很简单：异常发生以后系统继续执行，用户根本不知道哪一步已经完成。', ['自动化失败', '异常', '哪一步']),
  fixture('failure_retrospective', 7, '冷启动没效果，可能不是内容发得少，而是每条内容面对的受众都不一样。', ['冷启动', '受众'], { certainty: 'uncertain' }),
  fixture('failure_retrospective', 8, '我们花了一个月做完整后台，真正被用户反复使用的却只有导出按钮。', ['完整后台', '导出按钮'], { hasFirstPersonExperience: true, allowedNumbers: ['一个月'] }),
  fixture('failure_retrospective', 9, '复盘证明，所有带外链的内容都会被平台限流。', ['带外链', '平台限流'], { adversarial: 'causal_overclaim', maxExpansionRatio: 1.1 }),
  fixture('failure_retrospective', 10, '这次产品发布失败了，但目前能确认的原因还不多。', ['发布失败', '原因'], { adversarial: 'thin_input', maxExpansionRatio: 1.25 })
];

const industryOpinion = [
  fixture('industry_opinion', 1, '我越来越觉得，AI 应用接下来的分水岭不会只是模型能力，而是谁先进入真实工作流。', ['AI 应用', '真实工作流'], { certainty: 'uncertain' }),
  fixture('industry_opinion', 2, '下一轮 AI 产品竞争，模型差距可能会缩小，产品是否理解具体任务会变得更重要。', ['模型差距', '具体任务'], { certainty: 'uncertain' }),
  fixture('industry_opinion', 3, '创作者工具市场正在从“帮你生成更多”转向“帮你稳定完成”，数量和交付不是同一个价值。', ['创作者工具', '稳定完成']),
  fixture('industry_opinion', 4, '独立开发的门槛被 AI 降低后，真正稀缺的可能不再是写出功能，而是判断哪个问题值得长期做。', ['独立开发', '哪个问题值得长期做'], { certainty: 'uncertain' }),
  fixture('industry_opinion', 5, 'AI Agent 赛道看起来很热，但如果每次执行都需要人盯着，它更像演示，不像可托付的系统。', ['AI Agent', '需要人盯着'], { certainty: 'uncertain', allowedEntities: ['AI', 'Agent'] }),
  fixture('industry_opinion', 6, 'SaaS 的下一个变化未必是加一个聊天框，而是把原来割裂的动作重新连成工作流。', ['SaaS', '工作流'], { certainty: 'uncertain', allowedEntities: ['SaaS'] }),
  fixture('industry_opinion', 7, '未来内容工具的差异，可能不在生成速度，而在它是否知道什么不该替用户决定。', ['内容工具', '不该替用户决定'], { certainty: 'uncertain' }),
  fixture('industry_opinion', 8, 'AI 创业越来越便宜，也意味着复制功能越来越容易。长期价值可能更多来自数据边界和用户习惯。', ['AI 创业', '用户习惯'], { certainty: 'uncertain' }),
  fixture('industry_opinion', 9, '2027 年所有传统软件都会被 Agent 取代，这是不可逆趋势。', ['传统软件', 'Agent'], { allowedNumbers: ['2027'], allowedEntities: ['Agent'], adversarial: 'absolute_forecast', maxExpansionRatio: 1.1 }),
  fixture('industry_opinion', 10, 'AI 很火，未来会更火。', ['AI'], { adversarial: 'thin_input', maxExpansionRatio: 1.25 })
];

const workflowFramework = [
  fixture('workflow_framework', 1, '我现在验证 AI 产品只看三步：先找重复任务，再观察用户是否主动回来，最后才考虑扩功能。', ['重复任务', '主动回来', '扩功能'], { hasFirstPersonExperience: true, allowedNumbers: ['三步'] }),
  fixture('workflow_framework', 2, '做内容复盘分两步：先看哪些主题带来目标用户，再看用户为什么愿意回复，不先拿浏览量下结论。', ['目标用户', '愿意回复', '浏览量'], { allowedNumbers: ['两步'] }),
  fixture('workflow_framework', 3, '我的 AI 工作流很简单：收集原始资料、保留来源、生成初稿、最后逐条检查外部事实。', ['保留来源', '检查外部事实'], { hasFirstPersonExperience: true }),
  fixture('workflow_framework', 4, '判断一个自动化能不能上线，先看失败能否停止，再看状态能否恢复，最后才看速度。', ['失败能否停止', '状态能否恢复', '速度']),
  fixture('workflow_framework', 5, '产品冷启动先做十次人工交付，再把重复动作自动化；顺序反过来，很容易优化一个没人需要的流程。', ['人工交付', '重复动作自动化'], { allowedNumbers: ['十次'] }),
  fixture('workflow_framework', 6, '我筛选内容选题只问三个问题：目标读者是谁、他现在卡在哪里、这条内容能补充什么具体判断。', ['目标读者', '具体判断'], { hasFirstPersonExperience: true, allowedNumbers: ['三个问题'] }),
  fixture('workflow_framework', 7, '建立知识库不要先追求收集量。第一步去重，第二步标记时效，第三步才是检索。', ['去重', '时效', '检索'], { allowedNumbers: ['第一步', '第二步', '第三步'] }),
  fixture('workflow_framework', 8, '验证创作者产品的流程：先手动服务五个人，记录重复需求，再决定哪些部分值得做成软件。', ['手动服务', '重复需求', '做成软件'], { allowedNumbers: ['五个人'] }),
  fixture('workflow_framework', 9, '增长方法只有一步：每天发十条内容，保证一个月涨粉十万。', ['每天发十条', '涨粉十万'], { allowedNumbers: ['一步', '十条', '一个月', '十万'], adversarial: 'guaranteed_growth', maxExpansionRatio: 1.1 }),
  fixture('workflow_framework', 10, '我的内容流程很简单：先做出一版，再根据反馈优化。', ['先做', '反馈优化'], { adversarial: 'thin_input', maxExpansionRatio: 1.25 })
];

const CHINESE_POST_FIXTURES = Object.freeze([
  ...productObservation,
  ...toolExperience,
  ...buildInPublic,
  ...failureRetrospective,
  ...industryOpinion,
  ...workflowFramework
]);

export { CHINESE_POST_FIXTURES };

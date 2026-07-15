const CAPTURED_AT = '2026-07-15';

function sample({
  id,
  author,
  statusId,
  label,
  ageAtCapture,
  publishedAt = '',
  topic,
  format,
  sourceType,
  metrics,
  summary,
  learn = [],
  avoid = []
}) {
  return Object.freeze({
    id,
    author,
    url: `https://x.com/${author}/status/${statusId}`,
    capturedAt: CAPTURED_AT,
    ageAtCapture,
    publishedAt,
    label,
    topic,
    format,
    sourceType,
    metrics: Object.freeze({
      replies: Number(metrics.replies) || 0,
      reposts: Number(metrics.reposts) || 0,
      likes: Number(metrics.likes) || 0,
      views: Number(metrics.views) || 0,
      bookmarks: Number(metrics.bookmarks) || 0
    }),
    summary,
    learn: Object.freeze([...learn]),
    avoid: Object.freeze([...avoid])
  });
}

const CHINESE_X_CORPUS = Object.freeze([
  sample({
    id: 'op7418-xhs-mini-tools', author: 'op7418', statusId: '2075535634375082364', label: 'positive', ageAtCapture: '14h',
    topic: '小红书小工具', format: 'product_observation', sourceType: 'public_feedback',
    metrics: { replies: 26, reposts: 11, likes: 104, views: 14000, bookmarks: 87 },
    summary: '从小红书新功能切入，具体分析平台只做发布、不包生成的产品取舍。',
    learn: ['具体产品行为', '有边界的产品判断'], avoid: []
  }),
  sample({
    id: 'op7418-ad-agent-roi', author: 'op7418', statusId: '2075470041345360382', label: 'negative', ageAtCapture: '19h',
    topic: '广告生成 Agent', format: 'quote_comment', sourceType: 'abstract_opinion',
    metrics: { replies: 12, reposts: 1, likes: 9, views: 7000, bookmarks: 17 },
    summary: '看到广告生成 Agent 后直接推断利润和付费意愿，缺少自己的测试与口径。',
    learn: [], avoid: ['从演示跳到商业结论', '缺少实测']
  }),
  sample({
    id: 'op7418-chatgpt-cards', author: 'op7418', statusId: '2075467584863142215', label: 'positive', ageAtCapture: '19h',
    topic: 'ChatGPT 语音卡片', format: 'short_post', sourceType: 'product_observation',
    metrics: { replies: 22, reposts: 1, likes: 37, views: 14000, bookmarks: 15 },
    summary: '点名新版语音模式中的可视化卡片，并列出世界杯、股票和天气三个例子。',
    learn: ['点名界面变化', '例子替代升华'], avoid: []
  }),
  sample({
    id: 'op7418-chatgpt-app-review', author: 'op7418', statusId: '2075383179859648669', label: 'positive', ageAtCapture: '1d',
    topic: '新版 ChatGPT App', format: 'long_post', sourceType: 'first_hand_test',
    metrics: { replies: 50, reposts: 3, likes: 72, views: 55000, bookmarks: 45 },
    summary: '逐项体验新版客户端，既写命名和分栏问题，也保留 Site 插件等好用部分。',
    learn: ['正反体验并存', '界面细节', '实际操作'], avoid: []
  }),
  sample({
    id: 'op7418-tab-critique', author: 'op7418', statusId: '2075389540387455355', label: 'positive', ageAtCapture: '1d',
    topic: '客户端分栏', format: 'short_post', sourceType: 'public_feedback',
    metrics: { replies: 58, reposts: 2, likes: 45, views: 19000, bookmarks: 4 },
    summary: '用一句带情绪的话批评客户端照搬三栏设计，依附于明确的产品更新。',
    learn: ['具体对象', '原生情绪', '说完即停'], avoid: []
  }),
  sample({
    id: 'op7418-source-retraction', author: 'op7418', statusId: '2075169890277982282', label: 'positive', ageAtCapture: '2d',
    topic: 'GPT 5.6 日区传闻', format: 'short_post', sourceType: 'source_correction',
    metrics: { replies: 34, reposts: 0, likes: 50, views: 25000, bookmarks: 2 },
    summary: '发现消息只有单一来源且无法评论后主动删帖，公开说明证据为什么不足。',
    learn: ['纠错过程', '来源核验', '保留不确定性'], avoid: []
  }),
  sample({
    id: 'op7418-seedream-test', author: 'op7418', statusId: '2074862226905948549', label: 'positive', ageAtCapture: '2d',
    topic: 'Seedream 5.0 实测', format: 'test_note', sourceType: 'first_hand_test',
    metrics: { replies: 34, reposts: 21, likes: 192, views: 45000, bookmarks: 122 },
    summary: '用四个不同任务测试图像模型，最后明确指出高分辨率下文字细节仍有问题。',
    learn: ['多任务实测', '明确短板', '不只报喜'], avoid: []
  }),

  sample({
    id: 'dotey-codex-quota', author: 'dotey', statusId: '2076372677577576864', label: 'negative', ageAtCapture: '7h',
    topic: 'Codex 使用限制', format: 'quote_comment', sourceType: 'news_recap',
    metrics: { replies: 35, reposts: 2, likes: 146, views: 35000, bookmarks: 12 },
    summary: '转述临时移除使用限制和重置用量，信息有用但个人增量很少。',
    learn: [], avoid: ['只复述公告', '没有判断依据']
  }),
  sample({
    id: 'dotey-caveman-skill', author: 'dotey', statusId: '2076371173244588135', label: 'positive', ageAtCapture: '7h',
    topic: '省 Token Skill', format: 'long_explainer', sourceType: 'sourced_analysis',
    metrics: { replies: 18, reposts: 0, likes: 39, views: 14000, bookmarks: 34 },
    summary: '用电报体解释省 Token Skill，再用 86 个任务和约 240 次试验数据校正宣传。',
    learn: ['熟悉类比', '测试口径', '反证宣传'], avoid: []
  }),
  sample({
    id: 'dotey-agent-infra-talk', author: 'dotey', statusId: '2076174130135674907', label: 'positive', ageAtCapture: '20h',
    topic: 'Agent 基础设施', format: 'sourced_explainer', sourceType: 'sourced_update',
    metrics: { replies: 38, reposts: 67, likes: 337, views: 46000, bookmarks: 450 },
    summary: '基于公开对谈拆出脚手架变薄、个人 ROI 和团队协调三个一线观察。',
    learn: ['明确来源', '多个独立增量', '写出限制'], avoid: []
  }),
  sample({
    id: 'dotey-chat-work-codex', author: 'dotey', statusId: '2075652538058109385', label: 'positive', ageAtCapture: '2d',
    topic: 'Chat Work Codex 区别', format: 'qa_explainer', sourceType: 'sourced_update',
    metrics: { replies: 63, reposts: 187, likes: 840, views: 149000, bookmarks: 851 },
    summary: '针对真实混淆整理问答，用产品行为和额度口径区分 Chat、Work 与 Codex。',
    learn: ['回答真实问题', '可核对口径', '具体场景'], avoid: []
  }),
  sample({
    id: 'dotey-ui-clothes', author: 'dotey', statusId: '2076054180251218197', label: 'negative', ageAtCapture: '1d',
    topic: 'AI UI 与代码', format: 'quote_comment', sourceType: 'abstract_opinion',
    metrics: { replies: 30, reposts: 4, likes: 97, views: 54000, bookmarks: 12 },
    summary: '用衣服面子和棉花里子类比 UI 与代码，传播强但压平了维护成本等反例。',
    learn: [], avoid: ['类比替代证据', '把复杂取舍说成定律']
  }),
  sample({
    id: 'dotey-desktop-panel', author: 'dotey', statusId: '2075729483026305070', label: 'positive', ageAtCapture: '2d',
    topic: 'Claude Code 桌面版', format: 'product_feedback', sourceType: 'public_feedback',
    metrics: { replies: 31, reposts: 0, likes: 40, views: 29000, bookmarks: 12 },
    summary: '指出右侧面板挤压浏览器、结果文件不能点击，并直接与 Codex 的预览行为对比。',
    learn: ['具体交互摩擦', '可见对比'], avoid: []
  }),
  sample({
    id: 'dotey-apple-openai-case', author: 'dotey', statusId: '2075712647723397452', label: 'positive', ageAtCapture: '2d',
    topic: 'Apple 起诉 OpenAI', format: 'news_brief', sourceType: 'sourced_update',
    metrics: { replies: 31, reposts: 7, likes: 79, views: 43000, bookmarks: 24 },
    summary: '用诉状主体、法院和相关人员说明案件，明确谁在被告名单、谁不在。',
    learn: ['关键事实密度', '避免过度推断'], avoid: []
  }),

  sample({
    id: 'coder-codex-flow', author: 'coder_left', statusId: '2064554547138486432', label: 'negative', ageAtCapture: '6h-indexed',
    topic: 'Codex 执行流程', format: 'quote_comment', sourceType: 'news_recap',
    metrics: { replies: 0, reposts: 0, likes: 2, views: 88, bookmarks: 1 },
    summary: '把别人的长文压成箭头流程，但开头仍是“终于说清楚”和通用推荐。',
    learn: [], avoid: ['推荐语盖过增量', '复述原文目录']
  }),
  sample({
    id: 'coder-qoder-free', author: 'coder_left', statusId: '2064300741611974923', label: 'negative', ageAtCapture: '22h-indexed',
    topic: 'Qoder 免费额度', format: 'short_news', sourceType: 'news_recap',
    metrics: { replies: 112, reposts: 4, likes: 73, views: 76000, bookmarks: 111 },
    summary: '用粗口和厂商对打猜测包装价格新闻，缺少亲测，主要依赖情绪拉动。',
    learn: [], avoid: ['情绪代替信息', '无依据揣测竞争']
  }),
  sample({
    id: 'coder-ark-price', author: 'coder_left', statusId: '2064004987471220786', label: 'negative', ageAtCapture: '2d-indexed',
    topic: '火山方舟套餐', format: 'deal_post', sourceType: 'promotion',
    metrics: { replies: 101, reposts: 2, likes: 60, views: 30000, bookmarks: 84 },
    summary: '用价格刺激和模型名单制造信息量，没有使用结果与适用边界。',
    learn: [], avoid: ['促销信息堆叠', '没有效果验证']
  }),
  sample({
    id: 'coder-fable-hype', author: 'coder_left', statusId: '2064414930665939199', label: 'negative', ageAtCapture: '15h-indexed',
    topic: 'Claude Fable 5', format: 'long_news', sourceType: 'promotion',
    metrics: { replies: 0, reposts: 0, likes: 4, views: 525, bookmarks: 1 },
    summary: '以“最炸裂、怪物级、赶紧上”包装模型更新，信息和未经验证判断混在一起。',
    learn: [], avoid: ['内容农场词', '催促行动', '确定性夸张']
  }),
  sample({
    id: 'coder-wwdc-alarm', author: 'coder_left', statusId: '2064331935862882784', label: 'positive', ageAtCapture: '20h-indexed',
    topic: 'WWDC 闹钟功能', format: 'short_joke', sourceType: 'event_reaction',
    metrics: { replies: 0, reposts: 0, likes: 3, views: 880, bookmarks: 0 },
    summary: '从节假日闹钟这个具体小功能直接吐槽，没有扩写成苹果创新方法论。',
    learn: ['具体小事', '短反应', '不升华'], avoid: []
  }),
  sample({
    id: 'coder-must-read', author: 'coder_left', statusId: '2038090895417901451', label: 'negative', ageAtCapture: '3mo', publishedAt: '2026-03-28',
    topic: 'Agentic CLI 文章', format: 'quote_promotion', sourceType: 'promotion',
    metrics: { replies: 4, reposts: 126, likes: 638, views: 240400, bookmarks: 1100 },
    summary: '用“恐怖查看、绝对必看、完美复刻”推荐文章，高传播但标题党特征明显。',
    learn: [], avoid: ['恐怖', '绝对必看', '完美', '借播放量证明质量']
  }),

  sample({
    id: 'james-regulation-reaction', author: 'JamesAI', statusId: '2066287586273091827', label: 'negative', ageAtCapture: '1d-indexed',
    topic: '模型监管', format: 'channel_promo', sourceType: 'abstract_opinion',
    metrics: { replies: 0, reposts: 0, likes: 0, views: 684, bookmarks: 0 },
    summary: '用“监管不减速反而加速”概括一周新闻，结尾导流频道，事实支撑不足。',
    learn: [], avoid: ['宏观结论先行', '导流压过内容']
  }),
  sample({
    id: 'james-github-list', author: 'JamesAI', statusId: '2066287564907270432', label: 'negative', ageAtCapture: '1d-indexed',
    topic: 'GitHub 热门', format: 'list_post', sourceType: 'news_recap',
    metrics: { replies: 1, reposts: 0, likes: 0, views: 449, bookmarks: 2 },
    summary: '罗列四个仓库和星标增量，但没有选择理由、使用体验或读者任务。',
    learn: [], avoid: ['清单即内容', '缺少筛选依据']
  }),
  sample({
    id: 'james-export-control', author: 'JamesAI', statusId: '2066287397755879845', label: 'positive', ageAtCapture: '1d-indexed',
    topic: '模型出口管制', format: 'thread', sourceType: 'sourced_update',
    metrics: { replies: 1, reposts: 0, likes: 1, views: 5000, bookmarks: 0 },
    summary: '用时间线交代安全测试、电话和禁令生效，并附上被引用的公开来源。',
    learn: ['事件顺序', '明确来源'], avoid: []
  }),
  sample({
    id: 'james-regulation-door', author: 'JamesAI', statusId: '2066287382752829630', label: 'negative', ageAtCapture: '1d-indexed',
    topic: '全球 AI 监管', format: 'short_opinion', sourceType: 'abstract_opinion',
    metrics: { replies: 1, reposts: 0, likes: 0, views: 3000, bookmarks: 2 },
    summary: '把多个国家和公司事件压成“监管已到家门口”，像新闻口号而非个人观察。',
    learn: [], avoid: ['时代宣言', '多个事件强行归因']
  }),
  sample({
    id: 'james-vibe-meeting', author: 'JamesAI', statusId: '2065648397483491451', label: 'positive', ageAtCapture: '3d-indexed',
    topic: '会议中的 Vibe Coding', format: 'meme_post', sourceType: 'scene_note',
    metrics: { replies: 8, reposts: 0, likes: 12, views: 4000, bookmarks: 0 },
    summary: '只写会议现场发现有人 Vibe Coding 的瞬间，依靠配图完成表达。',
    learn: ['现场片段', '正文克制'], avoid: []
  }),

  sample({
    id: 'gefei-150-subscription', author: 'gefei55', statusId: '2062175815010570428', label: 'positive', ageAtCapture: '24h-indexed',
    topic: '出海产品定价', format: 'data_observation', sourceType: 'data_snapshot',
    metrics: { replies: 47, reposts: 4, likes: 104, views: 44000, bookmarks: 78 },
    summary: '用每月 150 美元订阅和国内 1000 元服务的售前售后差异讨论市场结构。',
    learn: ['具体价格', '购买路径', '市场对比'], avoid: []
  }),
  sample({
    id: 'gefei-notion-domain', author: 'gefei55', statusId: '2062099179036402003', label: 'positive', ageAtCapture: '1d-indexed',
    topic: 'Notion 域名', format: 'case_story', sourceType: 'sourced_analysis',
    metrics: { replies: 40, reposts: 3, likes: 57, views: 29000, bookmarks: 35 },
    summary: '先讲 Notion 换域名，再补充真实发生年份并追加 Paint.net 的商标案例。',
    learn: ['主动纠正时间', '第二案例补充边界'], avoid: []
  }),
  sample({
    id: 'gefei-trademark-timing', author: 'gefei55', statusId: '2061359767311053149', label: 'positive', ageAtCapture: '3d-indexed',
    topic: '出海商标', format: 'practical_advice', sourceType: 'experience_rule',
    metrics: { replies: 85, reposts: 1, likes: 22, views: 8000, bookmarks: 8 },
    summary: '把商标流程两三年的时间成本与小团队存续周期放在一起，给出明确适用条件。',
    learn: ['条件化建议', '具体时间成本'], avoid: []
  }),
  sample({
    id: 'gefei-seo-economics', author: 'gefei55', statusId: '2061297435708952622', label: 'positive', ageAtCapture: '3d-indexed',
    topic: 'SEO 流量价值', format: 'data_snapshot', sourceType: 'first_hand_result',
    metrics: { replies: 117, reposts: 1, likes: 46, views: 10000, bookmarks: 31 },
    summary: '公开每日自然流量、注册人数和单个注册价值，再展示月度营销费用的计算过程。',
    learn: ['数据口径', '计算过程', '第一手结果'], avoid: []
  }),
  sample({
    id: 'gefei-crayfish', author: 'gefei55', statusId: '2060746906448576586', label: 'positive', ageAtCapture: '5d-indexed',
    topic: '小龙虾误食', format: 'personal_note', sourceType: 'scene_note',
    metrics: { replies: 41, reposts: 9, likes: 55, views: 59000, bookmarks: 44 },
    summary: '从自己长期收集小龙虾部位蒸蛋的具体习惯写到刚发现可能不能吃，反应直接。',
    learn: ['真实小事', '自嘲', '不讲大道理'], avoid: []
  }),

  sample({
    id: 'turing-agent-ui-distribution', author: 'turingou', statusId: '2076351213415841899', label: 'positive', ageAtCapture: '17h',
    topic: 'Agent 中的 UI 分发', format: 'product_question', sourceType: 'concrete_observation',
    metrics: { replies: 34, reposts: 11, likes: 114, views: 30000, bookmarks: 117 },
    summary: '从 ChatCut 在 Agent 内打开应用的具体做法，追问软件是否还需要自建 Agent。',
    learn: ['案例后提问', '新产品行为'], avoid: []
  }),
  sample({
    id: 'turing-leaf-sensor', author: 'turingou', statusId: '2075941129426698537', label: 'negative', ageAtCapture: '2d',
    topic: '植物交互传感器', format: 'quote_reaction', sourceType: 'thin_reaction',
    metrics: { replies: 14, reposts: 4, likes: 58, views: 41000, bookmarks: 44 },
    summary: '面对有趣实验只写“牛逼、怎么做到”，传播来自被引用内容，正文没有增量。',
    learn: [], avoid: ['把引用流量算成内容质量', '只有情绪']
  }),
  sample({
    id: 'turing-chatgpt-model-picker', author: 'turingou', statusId: '2075938566883119536', label: 'positive', ageAtCapture: '2d',
    topic: 'ChatGPT 模型选项', format: 'product_feedback', sourceType: 'public_feedback',
    metrics: { replies: 79, reposts: 0, likes: 37, views: 39000, bookmarks: 13 },
    summary: '列出 Pro、极高、高、中和极速等真实选项，直接问用户究竟该如何判断智能等级。',
    learn: ['复现用户困惑', '问题本身就是内容'], avoid: []
  }),
  sample({
    id: 'turing-airport-supercharger', author: 'turingou', statusId: '2075814096830943396', label: 'positive', ageAtCapture: '2d',
    topic: '成田机场超充', format: 'personal_note', sourceType: 'scene_note',
    metrics: { replies: 67, reposts: 2, likes: 197, views: 86000, bookmarks: 27 },
    summary: '从去机场接人和以前要提前充电的经历写新超充，再自然联想到车内使用 Grok。',
    learn: ['生活场景', '具体前后变化'], avoid: []
  }),
  sample({
    id: 'turing-codex-browser-pip', author: 'turingou', statusId: '2075619702802702637', label: 'positive', ageAtCapture: '3d',
    topic: 'Codex 浏览器画中画', format: 'first_impression', sourceType: 'first_hand_test',
    metrics: { replies: 32, reposts: 9, likes: 274, views: 44000, bookmarks: 99 },
    summary: '点名右侧画中画展示浏览器操作，并说明它解决了默认浏览器 profile 不透明的问题。',
    learn: ['新功能现场', '旧问题对照'], avoid: []
  }),

  sample({
    id: 'tz-observer-effect', author: 'Tz_2022', statusId: '2037199640513089751', label: 'negative', ageAtCapture: 'indexed-snapshot',
    topic: 'AI 观察者效应', format: 'quote_comment', sourceType: 'abstract_opinion',
    metrics: { replies: 4, reposts: 8, likes: 31, views: 8000, bookmarks: 18 },
    summary: '从一张视觉图跳到 AI 认知和观察者效应，概念密度高但缺少可核对关系。',
    learn: [], avoid: ['概念堆叠', '哲学升华']
  }),
  sample({
    id: 'tz-touch-essay', author: 'Tz_2022', statusId: '2037318907887808553', label: 'negative', ageAtCapture: 'indexed-snapshot',
    topic: '触觉与电子云', format: 'long_essay', sourceType: 'viral_explainer',
    metrics: { replies: 153, reposts: 81, likes: 628, views: 979000, bookmarks: 341 },
    summary: '从“从未接触物体”扩写到宇宙浪漫，播放很高，但大量权威口吻与文学升华。',
    learn: [], avoid: ['教科书口吻', '宏大升华', '用播放替代准确性']
  }),
  sample({
    id: 'tz-arc-agi-snapshot', author: 'Tz_2022', statusId: '2037338012321792456', label: 'positive', ageAtCapture: 'indexed-snapshot',
    topic: 'ARC-AGI-3', format: 'data_snapshot', sourceType: 'data_snapshot',
    metrics: { replies: 59, reposts: 118, likes: 1000, views: 256000, bookmarks: 441 },
    summary: '并列发布当日三个模型低于 0.4% 的成绩和 24 小时后 36.08% 的新结果。',
    learn: ['时间对比', '数字先行', '少解释'], avoid: []
  }),

  sample({
    id: 'ayi-hy3-promotion', author: 'AYi_AInotes', statusId: '2076194717977428413', label: 'negative', ageAtCapture: '1h',
    topic: '腾讯 Hy3', format: 'long_promotion', sourceType: 'promotion',
    metrics: { replies: 16, reposts: 1, likes: 16, views: 2000, bookmarks: 10 },
    summary: '实测信息被“王炸、拐点、兄弟们、真正能用”等放大词和品牌结论淹没。',
    learn: [], avoid: ['内容农场词', '品牌软广', '重复结论']
  }),
  sample({
    id: 'ayi-startup-window', author: 'AYi_AInotes', statusId: '2040669222838341969', label: 'negative', ageAtCapture: '3mo', publishedAt: '2026-04-05',
    topic: '创业黄金窗口', format: 'long_promotion', sourceType: 'promotion',
    metrics: { replies: 23, reposts: 232, likes: 912, views: 99000, bookmarks: 1036 },
    summary: '用“历史最佳创业时机、只剩 12 到 24 个月、搞钱改命”制造紧迫感。',
    learn: [], avoid: ['黄金窗口', '改命', '行动焦虑', '收益想象']
  })
]);

const CHINESE_POST_PATTERN_CARDS = Object.freeze([
  Object.freeze({
    id: 'field_test',
    instruction: '先写测试对象和你实际做的动作，再写最明显的结果与一个仍存在的短板。',
    stopCondition: '写清结果和短板就停止，不总结行业趋势。',
    evidenceAuthors: Object.freeze(['op7418', 'dotey', 'turingou', 'gefei55'])
  }),
  Object.freeze({
    id: 'product_feedback',
    instruction: '点名具体界面、按钮、流程或产品行为，说明它造成的摩擦或改善。',
    stopCondition: '具体问题已经可复现时停止，不升级成产品方法论。',
    evidenceAuthors: Object.freeze(['op7418', 'dotey', 'turingou'])
  }),
  Object.freeze({
    id: 'data_snapshot',
    instruction: '让数字与对象先出现，补充计算口径、时间范围或对照条件。',
    stopCondition: '解释数字能证明什么、不能证明什么后停止。',
    evidenceAuthors: Object.freeze(['gefei55', 'dotey', 'Tz_2022'])
  }),
  Object.freeze({
    id: 'sourced_update',
    instruction: '先说明谁发布了什么，再提炼一个真正新增的信息，并保留来源限制。',
    stopCondition: '没有额外证据时不预测后续影响。',
    evidenceAuthors: Object.freeze(['dotey', 'JamesAI', 'op7418'])
  }),
  Object.freeze({
    id: 'scene_note',
    instruction: '保留发生地点、动作或当下反应，让现场本身承担表达。',
    stopCondition: '读者已经能看到这个瞬间时停止，不追加人生感悟。',
    evidenceAuthors: Object.freeze(['gefei55', 'turingou', 'coder_left', 'JamesAI'])
  }),
  Object.freeze({
    id: 'short_judgment',
    instruction: '只保留一个判断，最多补一个来自素材的理由；素材越薄，正文越短。',
    stopCondition: '一个判断已经成立时停止，不编步骤、不造共识、不升华。',
    evidenceAuthors: Object.freeze(['op7418', 'dotey', 'gefei55', 'turingou'])
  })
]);

function getChinesePostPatternCard(id = '') {
  return CHINESE_POST_PATTERN_CARDS.find(card => card.id === id)
    || CHINESE_POST_PATTERN_CARDS.find(card => card.id === 'short_judgment');
}

function validateChinesePostCorpus() {
  const invalidIds = CHINESE_X_CORPUS.filter((item) => (
    !/^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/.test(item.url)
    || !item.summary
    || Array.from(item.summary).length > 80
    || !['positive', 'negative'].includes(item.label)
    || Object.values(item.metrics).some(value => !Number.isFinite(value))
  )).map(item => item.id);
  const authorCount = new Set(CHINESE_X_CORPUS.map(item => item.author)).size;
  const positiveCount = CHINESE_X_CORPUS.filter(item => item.label === 'positive').length;
  const negativeCount = CHINESE_X_CORPUS.filter(item => item.label === 'negative').length;
  return {
    valid: invalidIds.length === 0
      && CHINESE_X_CORPUS.length === 40
      && authorCount >= 8
      && positiveCount === 24
      && negativeCount === 16,
    sampleCount: CHINESE_X_CORPUS.length,
    authorCount,
    positiveCount,
    negativeCount,
    invalidIds
  };
}

export {
  CHINESE_POST_PATTERN_CARDS,
  CHINESE_X_CORPUS,
  getChinesePostPatternCard,
  validateChinesePostCorpus
};

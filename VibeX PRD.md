# VibeX Product Requirements Document (PRD)

## 1. Product Positioning
**VibeX** is an AI smart copilot extension tailored for X (Twitter) creators. Its core objective is to achieve fully automated traffic growth on the X platform while perfectly simulating real human behavior. It encompasses automated high-quality engagement, automated stylized posting, intelligent material collection, and one-click viral rewriting.

## 2. Core Feature Modules

### 2.1 Smart Creation Workspace
- **Input & Smart Parsing**: Supports directly dropping in any long text or external links (e.g., WeChat articles, YouTube, Bilibili, Zhihu). If a link is provided, the system automatically scrapes and extracts the core web content via DataHub/Jina API.
- **Viral Rewrite**: After extracting text or link content, the system seamlessly sends it into the "Viral Rewrite" pipeline. This is a rewrite engine specifically designed for "posting." No manual selection of styles is needed; the AI automatically determines the type of original content and rewrites it using the following three core prompt strategies:
  1. **Short/Emotional**: Preserves emotional tension, rewriting it into "highly inflammatory hot takes, piercing rhetorical questions, or humorous sarcasm," refusing to expand the text, aiming for a one-hit kill.
  2. **Medium/Experience & Insights**: Adopts a "Strong Hook + Minimalist Short Sentence Skeleton + Open Interaction" structure, heavily utilizing line breaks to create emotional cadence.
  3. **Professional/Hardcore Knowledge**: Forces a dimensional reduction expression framework of "one-sentence core value summary + clear bullet points + paradigm-shifting insights," pursuing high information density.
- **Smart Reply**: Embeds a button directly into the X official webpage. Generates highly human-like comments with one click under the current tweet, constrained by the "Reply Strategies" set in the backend.

### 2.2 Auto-Post Quality Control
Primarily targets the "Original Posting" phase in Auto-Post and Auto-Engage modes. The entire automated posting pipeline consists of three minimalist yet robust stages: **Multi-dimensional Generation**, **Scoring Control**, and **Local Sandbox Dispatch**.

**Stage 1: Multi-dimensional Structured Generation**
To ensure the account's tweets resemble authentic X native influencers, the underlying Prompts preset the following high-quality writing frameworks:
- **Short complaints**: One sentence exposing industry hidden rules.
- **Quote retweets**: "XXX" — Actually that's not true, because...
- **Counter-intuitive judgments**: Most people think A, but what really determines the outcome is B.
- **Replicable paths**: Who is it for -> How to do it -> How to verify -> Failure signals.
- **Case breakdowns**: What was observed -> Why it worked -> What ordinary people can learn.
- **Comment triggers**: Give a clear multiple-choice or true/false question, rather than overusing "What do you think?".

**Stage 2: AI Strict Self-Scoring (Scoring System)**
For every generated draft, the AI must conduct a harsh self-evaluation based on 6 core dimensions (10 points each) and write a `qualityRationale`. The scoring dimensions include: `hook`, `shareability`, `replyTrigger`, `identity`, `audienceFit`, and `nativeX`. Only tweets passing the high-score threshold enter the pending queue.

**Stage 3: Local Sandbox Dispatch**
VibeX uses a purely local, physically isolated dispatch mechanism. All high-scoring drafts are securely stored in the local extension's cache queue. When the system reaches the calculated "smart dispatch time," the background Service Worker wakes up the target X page and publishes the content by **authentically simulating mouse clicks and keyboard typing**. This method 100% eliminates the risk of being banned by X due to API abuse or illegal injection.

### 2.3 Reply Strategies
Targeted at the "Smart Reply" button in the workspace and the "Auto-Reply" mode in the sandbox. The system provides the following precise system Prompt settings (users can seamlessly switch in the backend):
- `Contrarian`: Finds the weakest logical point for a precision strike; throws out counter-intuitive views; uses rhetorical questions to spark debate. Requires a sarcastic tone without personal attacks (<40 words).
- `Expert`: Objectively analyzes the tweet; MUST supplement with extremely hardcore trivia or specific data as support (<80 words).
- `Minimal`: Summarizes the original tweet with a brilliant complaint, god-tier metaphor, or internet slang; no long essays, providing only emotional value (<15 words).
- `Custom`: Fully executes the system Prompt rules filled in by the user.

### 2.4 Library / Vault
- **Rewrite & Save**: When users encounter high-quality tweets while browsing X, the system first pushes them through the AI engine for a "Viral Rewrite," and then saves them into the vault. This means the library accumulates "high-quality semi-finished products" that have already undergone dimensional reduction and style cloning, ready for one-click publishing, rather than just copying someone else's original text.
- **Feedback Loop**: Supports direct secondary editing of AI-generated drafts within the library. The system automatically records the before-and-after comparison (error example vs. ideal state) and forces the LLM to correct itself in the next generation, completely eradicating "AI-speak" and "translation vibes."
- **Style Training**: Supports users uploading historically highly-liked tweets; the AI will 100% mimic its sentence-breaking rhythm, filler words, Emoji habits, and emotional saturation.

### 2.5 Sandbox / Automation Engine
The sandbox engine is VibeX's autopilot module, containing three core operating modes:
1. **Auto-Engage**: The ultimate growth mode. While naturally browsing the timeline, it executes both "scheduled posting" and "automatically identifying and replying to high-value tweets."
2. **Auto-Post**: Only automatically publishes tweets. Based on the high-scoring candidate queue generated by AI, the system wakes up the tab in the background at smart time intervals to click and send.
3. **Auto-Reply**: Silently browses the timeline, using AI scoring (avoiding non-target groups, finding high engagement potential) to automatically leave highly human-like comments under tweets.

*(Note: If the above engines are turned off, it is equivalent to switching to purely manual control, where users can directly call the AI once via interactive buttons in the Workspace toolbox.)*

### 2.6 Language Handling
VibeX has extremely strict and humanized control over language output:
- **Global Persona**: Whether it's active posting, rewriting, or passive replying, the system will **absolutely obey** the primary language (Engine Language) set by the user in the backend.
- **Native Language Understanding**: When replying to foreign language tweets, the system fetches the native language of the replied tweet in the background and feeds it to the AI as context to ensure accurate comprehension. However, in the final output, the AI is forcefully constrained to answer in the set primary language (e.g., all English). This design completely avoids the Algorithm Dilution problem caused by multi-language switching, effectively consolidating the account's verticality.

## 3. Security & Architecture

### 3.1 Account Safety
- Enforces a maximum 10-hour working anti-addiction lock; upon reaching the threshold, it automatically enters sleep power-off.
- Native simulation of human behavior: Perfectly evades X platform's bot behavior detection through scroll step randomization (400~800px), reading dwell time randomization, and mandatory reply/post Cooldown times.
- Completely removed the early "calling X native draft box" and complex DOM hijack actions, currently utilizing more robust Intent URL injections and input methods closer to human keyboard/mouse operations.

### 3.2 Chrome Web Store (CWS) Compliance
- **Total eradication of DOM-based XSS**: Completely removed the original risky `innerHTML` operations in the code. Whether it is the floating panel injected into the X native page or the extension's own settings page/popups, all adopt rigorous `document.createElement` secure rendering solutions.
- **Principle of Least Privilege**: The `manifest.json`'s `host_permissions` are strictly limited to `*://x.com/*` and `*://*.twitter.com/*`, and compliant cross-origin Fetch requests are used for various LLM APIs, preventing security risk interceptions caused by wild-card domains.

---

# VibeX 产品需求文档 (PRD)

## 1. 产品定位
**VibeX** 是一款专为 X (Twitter) 创作者打造的 AI 智能副驾插件。它的核心目标是：在完全模拟真实人类行为的前提下，实现 X 平台的流量全自动增长。它涵盖了自动化高质量互动、自动化风格化发文、以及智能素材收录与一键爆款改写功能。

## 2. 核心功能模块

### 2.1 智能创作工作区 (Workspace)
- **输入与智能解析**：支持直接丢入任意长文或外部链接（如微信公众号、YouTube、哔哩哔哩、知乎等）。如果输入的是链接，系统会自动通过 DataHub/Jina API 抓取并提取网页的核心正文内容。
- **一键爆款重构 (Viral Rewrite)**：提取完长文或链接内容后，系统会自动将其无缝送入“一键爆款重构”流程。这是专门针对“发文”的改写引擎。无需手动选择流派，AI 会自动判断原文的类型并使用以下三大底层 Prompt 策略进行重写：
  1. **短平快/情绪向**：要求保留情绪张力，改写为“极具煽动性的暴论、扎心反问或幽默讽刺”，拒绝扩写，一刀致命。
  2. **稍长内容/经验感悟**：采用“强力钩子(Hook) + 极简短句骨架 + 开放式互动”结构，多用换行留白制造情绪起伏。
  3. **专业/硬核干货**：强制使用“一句话总结核心价值 + 清晰的 Bullet points + 颠覆性认知”的降维表达框架，追求高信息密度。
- **智能原生回复 (Smart Reply)**：直接在 X 官网页面嵌入按钮。在当前推文下方一键生成极具人味的评论，内容受后台设置的“默认回复策略 (Reply Strategies)”约束。

### 2.2 自动发帖流派与质检机制 (Auto-Post Quality Control)
主要针对全自动发帖（Auto-Post）和全自动活跃（Auto-Engage）中的“原创发文”环节。整个自动发帖链路包含 **多维生成**、**评分把控**、**本地调度** 三个极简而坚固的阶段：

**阶段 1：多维结构化生成**
为了保证账号发出的推文像真实的 X 原生大V，底层 Prompt 预设了以下高质量写作框架：
- **短平快吐槽**：一句话揭露行业潜规则。
- **引用短评**：“XXX” —— 事实并非如此，因为...
- **反常识判断**：大多数人以为 A，真正决定结果的是 B。
- **可复制路径**：适合谁 -> 怎么做 -> 如何验证 -> 失败信号。
- **案例拆解**：观察到什么 -> 为什么有效 -> 普通人能学哪一步。
- **评论诱因**：给一个明确选择题或判断题，而不是滥用“你怎么看”。

**阶段 2：AI 严格自评把控 (Scoring System)**
每生成一条草稿，AI 必须基于 6 个核心维度（满分10分）进行严苛自评并写下 `qualityRationale`（质量合理性背书）。打分维度包括：`hook` (钩子)、`shareability` (转发率)、`replyTrigger` (评论诱因)、`identity` (身份标签)、`audienceFit` (受众匹配)、`nativeX` (X原生感)。只有通过高分阈值的推文才会进入待发队列。

**阶段 3：本地沙盒智能调度 (Local Sandbox Dispatch)**
VibeX 采用纯本地物理隔离的调度机制。高分草稿全部安全存放在本地插件的缓存队列中。当系统到达计算好的“智能调度时间点”时，后台 Service Worker 会唤醒目标 X 页面，并通过**真实模拟鼠标点击与键盘敲击输入**完成内容的发布。这种方式能 100% 杜绝因 API 滥用或非法注入被 X 平台封控的风险。

### 2.3 互动回复策略流派 (Reply Strategies)
针对工作区的“智能回复”按钮以及沙盒的“全自动回复 (Auto-Reply)”模式。系统提供了以下精确的系统 Prompt 设定（用户可在后台无缝切换）：
- `杠精流 (Contrarian)`：找出逻辑最薄弱点精准打击；抛出反直觉观点；多用反问句引发辩论。要求带嘲讽感但不做人身攻击（<40字）。
- `专业流 (Expert)`：客观分析推文；必须补充一条极其硬核的冷知识或具体数据作为支撑（<80字）。
- `极简流 (Minimal)`：用一句精辟吐槽、神级比喻或互联网黑话总结原推；不长篇大论，只提供情绪价值（<15字）。
- `自定义 (Custom)`：完全执行用户自行填写的系统 Prompt 规则。

### 2.4 私有素材储备库 (Library / Vault)
- **改写入库 (Rewrite & Save)**：用户在浏览 X 遇到优质推文时，系统会先通过 AI 引擎将其“一键爆款重构”，随后收藏入库。这意味着素材库中沉淀的直接是经过降维打击和风格克隆的“高质半成品”，可以直接一键发布，而不是原始搬运的他人的原文。
- **自我进化 (Feedback Loop)**：库内支持直接二次编辑 AI 生成的草稿。系统会自动记录修改前后的对比（错误示范 vs 理想状态），在下一次生成中强制大模型进行纠偏，彻底根除“AI 味”和“翻译腔”。
- **文风克隆 (Style Training)**：支持用户上传历史高赞推文，AI 会 100% 模仿其断句节奏、语气词、Emoji 习惯和情绪饱和度。

### 2.5 全自动沙盒引擎 (Sandbox / Automation Engine)
沙盒引擎是 VibeX 的自动驾驶模块，包含三种核心运作模式：
1. **全自动活跃 (Auto-Engage)**：终极增长模式。在自然浏览时间线的同时，既执行“定时发帖”又执行“自动识别并回复高价值推文”。
2. **全自动发帖 (Auto-Post)**：仅自动发布推文。系统根据 AI 生成的高分候选队列，按照智能时间间隔在后台唤醒标签页进行点击发送。
3. **全自动回复 (Auto-Reply)**：静默浏览时间线，根据 AI 打分（避开非目标群体、寻找高互动潜力），自动在推文下方留下极具人味的评论。

*(注：如果关闭以上引擎，则相当于切换到纯手动控制状态，用户可以直接在界面的 Workspace 工具箱中通过交互按钮单次调用 AI。)*

### 2.6 智能语言策略 (Language Handling)
VibeX 对语言输出具备极度严格且人性化的控制：
- **全局人设对齐 (Global Persona)**：无论是主动发帖 (Post)、仿写 (Rewrite) 还是被动回复 (Reply)，系统都会**绝对服从**用户在后台设置的主语言（Engine Language）。
- **原生语言理解**：在回复外文推文时，系统会在后台获取被回复推文的原生语言并作为背景信息（Context）喂给 AI 以保证准确理解，但在最终输出时，将强行约束 AI 用设定的主语言（如全英文）作答。这种设计彻底避免了多语言切换导致的 X 算法受众标签混杂（Algorithm Dilution）问题，有效巩固账号的垂直度。

## 3. 安全与架构规范 (Security & Architecture)

### 3.1 账号防封禁安全 (Account Safety)
- 强制最高 10 小时工作防沉迷锁，达到阈值自动进入休眠断电。
- 原生模拟人类行为：通过滚动步长随机化（400~800px）、阅读停留随机化、以及强制的评论发文 CD（Cooldown）时间，完美规避 X 平台的机器人行为特征检测。
- 完全剔除了早期的“调用 X 原生草稿箱”和复杂 DOM 劫持动作，目前使用更健壮的 Intent URL 注入以及更接近人类键鼠操作的输入法。

### 3.2 谷歌扩展商店审核规范 (CWS Compliance)
- **彻底根除 DOM 型 XSS**：完全移除了代码中原有的 `innerHTML` 风险操作。不论是注入到 X 原生页面的悬浮面板，还是插件自身的设置页/弹窗，全部采用严谨的 `document.createElement` 安全渲染方案。
- **权限最小化**：`manifest.json` 的 `host_permissions` 严格限制在 `*://x.com/*` 与 `*://*.twitter.com/*`，并对各类大模型 API 采用合规的跨域 Fetch 请求，杜绝泛域名导致的安全风控拦截。

# VibeX Product Requirements Document (PRD)

## 1. Product Positioning
**VibeX** is an AI smart copilot extension tailored for X (Twitter) creators. Its core objective is to achieve fully automated traffic growth on the X platform while perfectly simulating real human behavior. It encompasses automated high-quality engagement, automated stylized posting, intelligent material collection, one-click viral rewriting, and a closed-loop self-evolution engine.

## 2. Core Feature Modules

### 2.1 Smart Creation Workspace (Studio)
- **Input & Smart Parsing**: Supports directly dropping in any long text or external links. The system automatically scrapes and extracts the core web content.
- **Viral Rewrite**: Seamlessly sends extracted text into the "Viral Rewrite" pipeline. The AI automatically determines the original content type and rewrites it using three core prompt strategies (Short/Emotional, Medium/Insights, Professional/Hardcore).
- **Smart Reply**: Generates highly human-like comments with one click under the current tweet, constrained by backend "Reply Strategies."

### 2.2 Auto-Post Quality Control
The automated posting pipeline consists of three minimalist yet robust stages: **Multi-dimensional Generation**, **Scoring Control**, and **Local Sandbox Dispatch**.
- **Stage 1: Multi-dimensional Structured Generation**: Underlying Prompts preset high-quality writing frameworks (e.g., Short complaints, Quote retweets, Counter-intuitive judgments).
- **Stage 2: AI Strict Self-Scoring**: The AI conducts a harsh self-evaluation based on core dimensions (hook, shareability, replyTrigger, etc.). Only tweets passing the threshold enter the queue.
- **Stage 3: Local Sandbox Dispatch**: A purely local, physically isolated dispatch mechanism. Wakes up the target X page and publishes by authentically simulating mouse clicks and keyboard typing.

### 2.3 Reply Strategies
Targeted at the "Auto-Reply" mode. The system provides precise system Prompt settings (Contrarian, Expert, Minimal, Custom) for the AI to follow.

### 2.4 Library & Self-Evolution (Posts & Loop)
- **Rewrite & Save (Posts)**: High-quality tweets are rewritten and saved into the vault as "high-quality semi-finished products."
- **Prediction Feedback Loop (Loop)**: A core self-evolution engine. The system predicts the performance of a draft. Once published, the user inputs the actual views/engagement. The AI calculates the deviation (`getDeviation`), extracts a learning rule (`aiLearning`), and updates its global memory (`aiMemory`). Future generations will adapt to these learned rules, constantly optimizing the AI's intuition for viral content.
- **Style Training**: AI mimics historical highly-liked tweets (rhythm, filler words, Emoji habits).

### 2.5 Sandbox / Automation Engine (Auto)
The autopilot module containing three core operating modes:
1. **Auto-Engage**: Executes both "scheduled posting" and "automatically identifying and replying to high-value tweets."
2. **Auto-Post**: Automatically publishes high-scoring candidate tweets at smart time intervals.
3. **Auto-Reply**: Silently browses the timeline and automatically leaves highly human-like comments.

### 2.6 Cloud Sync & Data Security
- **GitHub Gist Sync**: Supports purely serverless cloud sync. All user settings, prompts, library drafts, and AI memory are automatically and silently synchronized via a private GitHub PAT. Users can switch devices seamlessly without relying on third-party backend servers.
- **Privacy First**: All data remains local or in the user's private Gist. 

### 2.7 Language Handling & UI Architecture
- **Global Persona**: Absolutely obeys the primary Engine Language.
- **Native Language Understanding**: Accurately comprehends foreign tweets but forces output in the primary language, avoiding Algorithm Dilution.
- **Minimalist Modern UI**: Follows modern SaaS sidebar patterns (e.g., top-level tabs for Studio/Posts/Loop/Auto, bottom-level utility icons for Settings/Profile).

## 3. Security & Architecture
- **Account Safety**: 10-hour working anti-addiction lock; native simulation of human behavior (scroll randomization, reading dwell time). Uses robust Intent URL injections.
- **CWS Compliance**: Total eradication of DOM-based XSS (uses `document.createElement`); strict `manifest.json` host permissions.

---

# VibeX 产品需求文档 (PRD)

## 1. 产品定位
**VibeX** 是一款专为 X (Twitter) 创作者打造的 AI 智能副驾插件。它的核心目标是：在完全模拟真实人类行为的前提下，实现 X 平台的流量全自动增长。它涵盖了自动化高质量互动、自动化风格化发文、智能素材收录、一键爆款重构功能，以及核心的 AI 自我进化闭环引擎。

## 2. 核心功能模块

### 2.1 智能创作工作区 (Studio)
- **输入与智能解析**：支持直接丢入任意长文或外部链接，自动提取网页核心正文。
- **一键爆款重构 (Viral Rewrite)**：系统自动判断原文类型并使用三大底层 Prompt 策略（短平快/情绪向、稍长内容/经验感悟、专业/硬核干货）进行重写。
- **智能原生回复 (Smart Reply)**：一键生成极具人味的评论，受后台“默认回复策略”约束。

### 2.2 自动发帖流派与质检机制
包含 **多维生成**、**评分把控**、**本地调度** 三个阶段：
- **多维结构化生成**：底层预设高质量写作框架（如反常识判断、可复制路径等）。
- **AI 严格自评把控**：基于 6 个核心维度进行严苛自评，只有高分推文才会进入待发队列。
- **本地沙盒智能调度**：高分草稿存放在本地缓存，通过真实模拟鼠标点击与键盘敲击输入完成发布，杜绝 API 滥用风险。

### 2.3 互动回复策略流派
提供精确的系统 Prompt 设定：杠精流 (Contrarian)、专业流 (Expert)、极简流 (Minimal)、自定义 (Custom)。

### 2.4 私有素材库与自我进化闭环 (Posts & Loop)
- **改写入库 (Posts)**：遇到优质推文自动一键爆款重构并收藏，沉淀高质半成品。
- **预测反馈闭环 (Loop)**：产品最核心的进化引擎。AI 在写完推文后会进行“流量预测”，帖子发布后用户填入“真实阅读量”，系统会自动计算偏差比率（Deviation），并让 AI 强行总结出一条“学习规则（aiLearning）”并写入全局记忆（aiMemory）。在此后的每一次创作中，大模型都会读取这些失败和成功的复盘经验，实现精准自纠偏。
- **文风克隆**：100% 模仿用户历史高赞推文的断句节奏与情绪饱和度。

### 2.5 全自动沙盒引擎 (Auto)
包含三种核心运作模式：
1. **全自动活跃 (Auto-Engage)**：“定时发帖”与“自动回复高价值推文”双管齐下。
2. **全自动发帖 (Auto-Post)**：按照智能时间间隔在后台唤醒标签页进行自动发帖。
3. **全自动回复 (Auto-Reply)**：静默浏览时间线，自动在推文下方留下极具人味的评论。

### 2.6 云端无感同步机制 (Cloud Sync)
- **Github Gist Serverless 同步**：支持通过个人的 Github PAT，将所有的全局设置、AI 记忆、库草稿等底层数据以加密 JSON 的形式静默同步到个人私密的 Gist 中。无需注册第三方账号，实现跨设备无缝办公。

### 2.7 语言策略与界面架构
- **全局人设对齐 (Global Persona)**：发帖与回复绝对服从后台设置的主语言（Engine Language）。
- **原生语言理解**：理解外文但强行使用主语言作答，避免 X 算法受众标签混杂（Algorithm Dilution）。
- **现代极简 UI 架构**：侧边导航栏采用 SaaS 经典布局（上侧为 Studio/Posts/Loop/Auto 等核心业务，底部沉淀 Profile/Settings 基础图标）。

## 3. 安全与架构规范
- **账号防封禁安全**：10 小时防沉迷锁；通过滚动步长、阅读停留随机化模拟人类，使用 Intent URL 注入。
- **扩展商店审核规范**：完全移除 `innerHTML` 风险操作；采用 `document.createElement` 安全渲染；严格限制 host permissions。

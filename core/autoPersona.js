import { normalizeEngineLanguage } from './i18n.js';
import { normalizeDetectedAccountLanguage } from './accountLanguage.js';

// These seed texts are inserted directly into the Auto-post generation prompt
// (see core/automation.js) as "账号定位" / "发推策略" whenever the real,
// LLM-derived persona (built from bio + high-quality samples, see
// background.js#analyzeAccountPersona) hasn't been produced yet - typically
// during the brief window right after connecting X, or if that analysis
// failed/was skipped.
//
// They must therefore read as usable operating instructions for the writer
// model itself (infer from the bio, act like a specific account), NOT as a
// note-to-self like "waiting for samples" - that kind of placeholder gets
// echoed straight into generation and produces empty, generic posts, which is
// exactly what this is trying to avoid. Once >=3 high-quality samples exist,
// updateProfileFromSamples() overwrites these with a real, sample-grounded
// persona.
const AUTO_PERSONA_TEXTS = {
  en: {
    characteristics: ({ handle, description }) => description
      ? `Not enough high-quality samples yet, so infer directly from the bio below instead of waiting: ${handle}'s bio says "${description}". From this alone, commit to a concrete target audience, content territory, and a repeated point of view - do not write a placeholder like "waiting for samples".`
      : `${handle} has no public bio and no high-quality tweet samples yet. Treat it as an early-stage indie builder / operator account: audience is people into AI tools, indie building, and content growth; territory is concrete product and workflow decisions, not generic industry takes.`,
    goals: () => 'Not enough high-quality samples yet, so run with this starting strategy: open with a concrete scene, number, or contrast; use comparison, variable-reversal, or observation-then-conclusion structures; keep content pillars close to whatever the bio/territory implies; end with a reusable judgment standard instead of "what do you think". This gets replaced by a sample-grounded strategy once enough high-quality posts are added.'
  },
  zh: {
    characteristics: ({ handle, description }) => description
      ? `样本还不足3条，先直接用下面这条 Bio 强推理，不要等待样本：${handle} 的 Bio 是"${description}"。仅凭这条信息，直接给出具体的目标读者、内容领域和反复出现的核心主张，不要写"等待样本沉淀"这种占位句。`
      : `${handle} 目前没有可读取的公开 Bio，也没有优质推文样本。请把它当作一个刚起步的独立开发者/内容操盘手账号来写：目标读者是关注 AI 工具、独立开发和内容增长的人，内容领域聚焦具体的产品和工作流判断，不要写泛泛的行业观察。`,
    goals: () => '样本还不足3条，暂时按这版策略执行：开头用具体场景、数字或反差；结构上用对比、变量反转，或"观察-推论-结论"；内容支柱先贴着账号 Bio/领域展开；结尾给一个可复用的判断标准，不要用"你怎么看"收尾。等优质样本积累够了，会替换成基于真实表现数据的策略。'
  },
  ja: {
    characteristics: ({ handle, description }) => description
      ? `高品質サンプルがまだ足りないため、サンプルを待たずに次の Bio から直接推論する：${handle} の Bio は「${description}」。この情報だけから、具体的な読者層・領域・繰り返し主張を決めること。「サンプル待ち」のようなプレースホルダーは書かないこと。`
      : `${handle} には公開 Bio も高品質ツイートサンプルもまだない。AI ツール・個人開発・コンテンツ成長に関心のある読者を想定し、具体的なプロダクトやワークフローの判断を領域とする、立ち上げ初期のアカウントとして扱うこと。`,
    goals: () => '高品質サンプルがまだ足りないため、暫定的に次の戦略で進める：具体的な場面・数字・コントラストで始める、比較・変数反転・観察からの結論という構造を使う、内容の柱は Bio や領域に沿わせる、締めは「どう思う？」ではなく再利用可能な判断基準にする。十分なサンプルが集まり次第、実データに基づく戦略に置き換わる。'
  },
  es: {
    characteristics: ({ handle, description }) => description
      ? `Todavía no hay suficientes muestras de calidad, así que infiere directamente de este Bio en vez de esperar: el Bio de ${handle} dice "${description}". Solo con esto, define una audiencia objetivo, un territorio de contenido y una tesis repetida concretos - no escribas un placeholder tipo "esperando muestras".`
      : `${handle} no tiene Bio público ni muestras de tweets de calidad todavía. Trátalo como una cuenta en etapa inicial de un builder/operador independiente: la audiencia son personas interesadas en herramientas de IA, construir en público y crecimiento de contenido; el territorio son decisiones concretas de producto y flujo de trabajo, no opiniones genéricas de la industria.`,
    goals: () => 'Todavía no hay suficientes muestras de calidad, así que arranca con esta estrategia: abre con una escena, número o contraste concreto; usa estructuras de comparación, inversión de variable u observación-luego-conclusión; mantén los pilares de contenido cerca de lo que sugiere el Bio/territorio; cierra con un criterio de juicio reutilizable en vez de "¿qué opinas?". Esto se reemplaza por una estrategia basada en muestras reales en cuanto haya suficientes posts de calidad.'
  },
  id: {
    characteristics: ({ handle, description }) => description
      ? `Contoh berkualitas belum cukup, jadi langsung simpulkan dari Bio berikut alih-alih menunggu: Bio ${handle} berbunyi "${description}". Dari info ini saja, tentukan audiens target, wilayah konten, dan tesis berulang yang konkret - jangan tulis placeholder seperti "menunggu contoh".`
      : `${handle} belum punya Bio publik maupun contoh tweet berkualitas. Perlakukan sebagai akun builder/operator independen tahap awal: audiensnya orang yang tertarik pada alat AI, membangun secara independen, dan pertumbuhan konten; wilayahnya keputusan produk dan alur kerja yang konkret, bukan opini industri yang umum.`,
    goals: () => 'Contoh berkualitas belum cukup, jadi jalankan strategi awal ini: buka dengan skenario, angka, atau kontras yang konkret; gunakan struktur perbandingan, pembalikan variabel, atau observasi-lalu-kesimpulan; jaga pilar konten tetap dekat dengan Bio/wilayah akun; tutup dengan standar penilaian yang bisa dipakai ulang, bukan "menurutmu gimana?". Ini akan diganti dengan strategi berbasis contoh nyata setelah cukup post berkualitas ditambahkan.'
  }
};

const AUTO_CHARACTERISTIC_MARKERS = [
  'infer directly from the bio below instead of waiting',
  'has no public bio and no high-quality tweet samples yet',
  '先直接用下面这条 Bio 强推理，不要等待样本',
  '目前没有可读取的公开 Bio，也没有优质推文样本',
  'サンプルを待たずに次の Bio から直接推論する',
  '公開 Bio も高品質ツイートサンプルもまだない',
  'infiere directamente de este Bio en vez de esperar',
  'no tiene Bio público ni muestras de tweets de calidad todavía',
  'langsung simpulkan dari Bio berikut alih-alih menunggu',
  'belum punya Bio publik maupun contoh tweet berkualitas',
  // legacy markers kept so old, already-stored placeholder personas from
  // before this change still get recognized and upgraded/relocalized
  'Use recent posts, manual edits, and Loop feedback to refine',
  'account positioning starts from this public profile context',
  'Clarify the audience, content territory, core thesis',
  'positioning seed from public bio',
  'Complete account positioning from public bio plus high-quality tweet samples',
  '后续请结合最近 posts、人工修改和 Loop 表现反馈',
  '账号定位从公开主页开始',
  '请先明确目标读者、内容领域、核心主张',
  '定位种子来自公开 Bio',
  '请结合公开 Bio 和优质推文样本',
  '最近の投稿、手動編集、Loop の実績フィードバック',
  'ポジショニングの種は公開 Bio',
  '公開 Bio と高品質ツイートサンプル',
  'Usa posts recientes, ediciones manuales y feedback del Loop',
  'empieza su posicionamiento desde este Bio público',
  'Completa el posicionamiento con el Bio público',
  'Gunakan post terbaru, edit manual, dan feedback Loop',
  'memulai posisi akun dari Bio publik',
  'Lengkapi posisi akun dari Bio publik',
  'Just vibing with the CYCLE'
];

const AUTO_GOAL_MARKERS = [
  'Not enough high-quality samples yet, so run with this starting strategy',
  '样本还不足3条，暂时按这版策略执行',
  '高品質サンプルがまだ足りないため、暫定的に次の戦略で進める',
  'Todavía no hay suficientes muestras de calidad, así que arranca con esta estrategia',
  'Contoh berkualitas belum cukup, jadi jalankan strategi awal ini',
  // legacy markers kept so old, already-stored placeholder personas from
  // before this change still get recognized and upgraded/relocalized
  'Goal: build a consistent X presence that grows trust',
  'Strategy is pending high-quality tweet samples',
  '目标：建立稳定、可识别的 X 发声',
  '发推策略等待优质推文样本沉淀',
  'Goal: X 上で一貫した発信軸を作り',
  '投稿戦略は高品質ツイートサンプル待ち',
  'Goal: construir una presencia consistente en X',
  'La estrategia de publicación espera muestras de tweets de calidad',
  'Goal: membangun kehadiran X yang konsisten',
  'Strategi posting menunggu contoh tweet berkualitas'
];

function resolveAutoPersonaLanguage(value = 'auto', navigatorLanguage = '', accountLanguage = '') {
  const raw = String(value || 'auto').trim();
  if (!raw || raw === 'auto') {
    return normalizeDetectedAccountLanguage(accountLanguage) || 'en';
  }
  return normalizeEngineLanguage(raw, navigatorLanguage);
}

function getXUserSeedVariables(user = {}) {
  const handle = user.username ? `@${user.username}` : 'this X account';
  return {
    handle,
    description: String(user.description || '').trim()
  };
}

function getAutoPersonaSeedText(engineLanguage = 'auto', key, variables = {}, navigatorLanguage = '', accountLanguage = '') {
  const lang = resolveAutoPersonaLanguage(engineLanguage, navigatorLanguage, accountLanguage);
  const textSet = AUTO_PERSONA_TEXTS[lang] || AUTO_PERSONA_TEXTS.en;
  const builder = textSet[key] || AUTO_PERSONA_TEXTS.en[key];
  if (!builder) return '';
  return builder({
    handle: variables.handle || 'this X account',
    description: variables.description || ''
  });
}

function buildInitialAutoPersona(user = {}, currentPersona = {}, engineLanguage = 'auto', options = {}, navigatorLanguage = '', accountLanguage = '') {
  const variables = getXUserSeedVariables(user);
  const replaceExisting = Boolean(options.replaceExisting);
  return {
    ...currentPersona,
    characteristics: replaceExisting || !currentPersona.characteristics
      ? getAutoPersonaSeedText(engineLanguage, 'characteristics', variables, navigatorLanguage, accountLanguage)
      : currentPersona.characteristics,
    goals: replaceExisting || !currentPersona.goals
      ? getAutoPersonaSeedText(engineLanguage, 'goals', variables, navigatorLanguage, accountLanguage)
      : currentPersona.goals
  };
}

function isKnownAutoPersonaField(value = '', field = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  const markers = field === 'goals' ? AUTO_GOAL_MARKERS : AUTO_CHARACTERISTIC_MARKERS;
  return markers.some(marker => text.includes(marker));
}

function localizeAutoPersona(persona = {}, user = {}, engineLanguage = 'auto', navigatorLanguage = '', accountLanguage = '') {
  const variables = getXUserSeedVariables(user);
  const current = persona || {};
  const next = { ...current };
  let changed = false;

  if (isKnownAutoPersonaField(current.characteristics, 'characteristics')) {
    const localized = getAutoPersonaSeedText(engineLanguage, 'characteristics', variables, navigatorLanguage, accountLanguage);
    if (localized && localized !== current.characteristics) {
      next.characteristics = localized;
      changed = true;
    }
  }

  if (isKnownAutoPersonaField(current.goals, 'goals')) {
    const localized = getAutoPersonaSeedText(engineLanguage, 'goals', variables, navigatorLanguage, accountLanguage);
    if (localized && localized !== current.goals) {
      next.goals = localized;
      changed = true;
    }
  }

  return { persona: next, changed };
}

export {
  resolveAutoPersonaLanguage,
  getAutoPersonaSeedText,
  buildInitialAutoPersona,
  isKnownAutoPersonaField,
  localizeAutoPersona
};

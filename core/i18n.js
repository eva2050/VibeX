const SUPPORTED_UI_LANGS = ['zh', 'en', 'ja', 'es', 'id'];

const BROWSER_LANG_MAP = {
  zh: 'zh',
  'zh-CN': 'zh',
  'zh-SG': 'zh',
  'zh-Hans': 'zh',
  'zh-TW': 'zh',
  'zh-HK': 'zh',
  'zh-Hant': 'zh',
  en: 'en',
  ja: 'ja',
  jp: 'ja',
  es: 'es',
  id: 'id',
  in: 'id'
};

const STRATEGY_LANG_MAP = {
  zh: 'zh-CN',
  en: 'en',
  ja: 'ja',
  es: 'en',
  id: 'en'
};

function detectBrowserLanguage(navigatorLanguage = '') {
  const value = String(navigatorLanguage || '').trim();
  if (!value) return 'en';
  if (BROWSER_LANG_MAP[value]) return BROWSER_LANG_MAP[value];
  const base = value.split('-')[0];
  return BROWSER_LANG_MAP[base] || 'en';
}

function normalizeEngineLanguage(value = 'auto', navigatorLanguage = '') {
  const lang = String(value || 'auto').trim();
  if (lang === 'auto') return detectBrowserLanguage(navigatorLanguage);
  if (lang === 'zh-CN' || lang === 'zh-TW') return 'zh';
  if (lang === 'ko') return 'en';
  return SUPPORTED_UI_LANGS.includes(lang) ? lang : 'en';
}

function toHtmlLang(value = 'auto', navigatorLanguage = '') {
  const lang = normalizeEngineLanguage(value, navigatorLanguage);
  if (lang === 'zh') return 'zh-CN';
  if (lang === 'ja') return 'ja';
  if (lang === 'es') return 'es';
  if (lang === 'id') return 'id';
  return 'en';
}

function toPreferredLanguage(value = 'auto', navigatorLanguage = '') {
  const lang = normalizeEngineLanguage(value, navigatorLanguage);
  return STRATEGY_LANG_MAP[lang] || 'en';
}

function getLanguageLabel(value = 'auto', navigatorLanguage = '') {
  const lang = normalizeEngineLanguage(value, navigatorLanguage);
  const labels = {
    zh: '简体中文',
    en: 'English',
    ja: '日本語',
    es: 'Español',
    id: 'Bahasa Indonesia'
  };
  return labels[lang] || labels.en;
}

function getLanguageInstruction(value = 'auto', mode = 'output', navigatorLanguage = '') {
  const lang = normalizeEngineLanguage(value, navigatorLanguage);
  const verb = mode === 'rewrite' ? {
    zh: '重写',
    en: 'rewrite in',
    ja: 'rewrite in',
    es: 'rewrite in',
    id: 'rewrite in'
  } : {
    zh: '输出',
    en: 'output in',
    ja: 'output in',
    es: 'output in',
    id: 'output in'
  };

  if (lang === 'zh') return mode === 'rewrite' ? '\n【语言约束】：必须使用中文重写。' : '\n【语言约束】：必须使用中文输出。';
  if (lang === 'ja') return `\n【语言约束】：You MUST ${verb[lang]} Japanese (日本語).`;
  if (lang === 'es') return `\n【语言约束】：You MUST ${verb[lang]} Spanish (Español).`;
  if (lang === 'id') return `\n【语言约束】：You MUST ${verb[lang]} Indonesian (Bahasa Indonesia).`;
  return `\n【语言约束】：You MUST ${verb.en} English.`;
}

function getLanguageName(value = 'auto', navigatorLanguage = '') {
  const lang = normalizeEngineLanguage(value, navigatorLanguage);
  const names = {
    zh: 'CHINESE (zh)',
    en: 'ENGLISH (en)',
    ja: 'JAPANESE (ja)',
    es: 'SPANISH (es)',
    id: 'INDONESIAN (id)'
  };
  return names[lang] || names.en;
}

const PROMPT_TEXT = {
  performanceMemoryIntro: {
    zh: '以下规则来自对应内容类型的预测偏差与用户回填表现。它们优先级高于通用爆款模板，但不要因为单条样本过度重复同一种写法：',
    en: 'The following rules come from prediction gaps and reviewed performance for this content mode. They outrank generic viral templates, but do not overfit to one sample:',
    ja: '以下のルールは、このコンテンツ種別における予測差分とレビュー済み実績から得たものです。汎用テンプレートより優先しますが、単一サンプルに過度適合しないでください：',
    es: 'Las siguientes reglas vienen de brechas de predicción y rendimiento revisado para este modo de contenido. Tienen prioridad sobre plantillas genéricas, pero no sobreajustes a una sola muestra:',
    id: 'Aturan berikut berasal dari selisih prediksi dan performa yang ditinjau untuk mode konten ini. Prioritaskan dibanding template viral umum, tetapi jangan overfit pada satu sampel:'
  },
  performanceMemoryEmpty: {
    zh: '暂无该内容类型的表现记忆。生成后需要进入 Posts 回填实际表现，Loop 才能持续校准。',
    en: 'No performance memory for this content mode yet. Review posts in Posts after publishing so the Loop can calibrate.',
    ja: 'このコンテンツ種別の実績記憶はまだありません。公開後に Posts で実績を入力すると Loop が校正できます。',
    es: 'Aún no hay memoria de rendimiento para este modo. Revisa posts en Posts después de publicar para calibrar el Loop.',
    id: 'Belum ada memori performa untuk mode konten ini. Tinjau post di Posts setelah terbit agar Loop bisa terkalibrasi.'
  },
  translatedContext: {
    zh: '注意，下面的推文内容已经被 X 平台翻译过，原始语言是「${origLang}」。请基于此背景进行理解。',
    en: 'Note: X may have translated the tweet below. The original language was "${origLang}". Interpret it with that context.',
    ja: '注意：以下のツイートは X によって翻訳されている可能性があります。元の言語は「${origLang}」です。この前提で理解してください。',
    es: 'Nota: X puede haber traducido el tweet siguiente. El idioma original era "${origLang}". Interprétalo con ese contexto.',
    id: 'Catatan: X mungkin telah menerjemahkan tweet di bawah. Bahasa aslinya "${origLang}". Pahami dengan konteks tersebut.'
  },
  rewritePerformanceMemoryHeader: {
    zh: '【发布表现记忆】：以下规则来自用户过往 X post 的预测浏览量与实际表现偏差，请在这次重写时优先遵守，用它们修正选题、hook 和表达方式：',
    en: '[Performance Memory]: These rules come from past X post prediction gaps and reviewed results. Use them to adjust topic choice, hooks, and expression in this rewrite:',
    ja: '【実績記憶】：以下のルールは過去の X 投稿の予測差分とレビュー済み結果から得たものです。今回の書き換えでは、テーマ選定・フック・表現の修正に優先して使ってください：',
    es: '[Memoria de rendimiento]: Estas reglas vienen de brechas entre predicción y resultados revisados en posts de X. Úsalas para ajustar tema, hook y expresión en esta reescritura:',
    id: '[Memori Performa]: Aturan ini berasal dari selisih prediksi dan hasil yang ditinjau pada post X sebelumnya. Gunakan untuk menyesuaikan topik, hook, dan ekspresi dalam penulisan ulang ini:'
  },
  uniqueReplyOnly: {
    zh: '【输出铁律】：绝对禁止输出多个备选方案或分析打分等废话前缀。绝对禁止使用任何 Markdown 格式符号。只能输出唯一的一条真实回复文本。',
    en: '[Output Rule]: Output exactly one real reply. No alternatives, analysis, scoring, preface, or Markdown symbols.',
    ja: '【出力ルール】：実際の返信を1つだけ出力してください。代案、分析、採点、前置き、Markdown 記号は禁止です。',
    es: '[Regla de salida]: Devuelve exactamente una respuesta real. Sin alternativas, análisis, puntuaciones, prefacios ni Markdown.',
    id: '[Aturan Output]: Keluarkan tepat satu balasan nyata. Tanpa alternatif, analisis, skor, pembuka, atau simbol Markdown.'
  },
  rewriteStrictRules: {
    zh: `【改写输出铁律】：
1. 绝对禁止使用任何典型的AI套话（如：“最反直觉的一点”、“底层逻辑”、“大多数人以为”、“值得注意的是”）。
2. 开头必须直接切入判断、对照或信息落差，禁止空泛的哲理总结或俗套营销号开头。
3. 句子必须短促、口语化、接地气，像真实网友在手机上敲出来。
4. 中文字符与英文字母/数字之间必须加一个半角空格。
5. 【绝对禁止过度分行】分段必须服务逻辑。默认只分 1~2 段。坚决反对“一句话一空行”的长文排版。
6. 【绝对禁止编造】必须保留原文核心对象。绝对不要编造原文没有的数据、年份、公司名、机构报告或商业结论。如果输入是短素材，绝对不要硬扩写成长文或 thread。
7. 绝对禁止生成任何 hashtag。
8. 绝对禁止在正文中包含外部 URL 链接。
9. 绝对禁止 Markdown 格式符号。
10. 只输出最终正文，禁止多个备选方案、分析、打分或前缀。`,
    en: `[Rewrite output rules]:
1. Never use generic AI cliches (e.g. "Most founders/creators...", "That's the edge", "In today's fast-paced world").
2. The first line must create judgment, contrast, or an information gap. Avoid cliché marketing openings.
3. Keep the writing conversational, short, and punchy, like a real person typing on their phone.
4. [NO OVER-SEGMENTATION] Use line breaks only when they serve the logic. Do NOT use the "one sentence, one empty line" format. Keep it to 1-2 paragraphs max unless original is very long.
5. [NO HALLUCINATION] Preserve the original subjects. Never hallucinate facts, data, years, companies, or reports not in the original text. Do not over-expand short inputs into long essays.
6. Never generate hashtags.
7. Never include external URLs in the final body.
8. Do not use Markdown formatting symbols.
9. Output only the final text. No alternatives, analysis, scoring, or preface.`,
    ja: `[書き換え出力ルール]:
1. 典型的なAI定型句を使わない。
2. 1行目は判断、対比、情報ギャップを作る。陳腐なマーケ調の始まりは禁止。
3. スマホで自然に書いたような会話調にする。
4. 改行は論理に必要な場合だけ使う。余白だけを目的にしない。
5. 原文の対象、関係、結論を保ち、事実を追加したり話題を変えたりしない。
6. ハッシュタグは禁止。
7. 最終本文に外部URLを含めない。
8. Markdown 記号は禁止。
9. 最終本文のみを出力し、代案・分析・採点・前置きは禁止。`,
    es: `[Reglas de salida para reescritura]:
1. No uses clichés genéricos de IA.
2. La primera línea debe crear juicio, contraste o brecha de información. Evita aperturas de marketing.
3. Escribe de forma conversacional, como alguien real desde el móvil.
4. Usa saltos de línea solo si ayudan a la lógica. No agregues espacio vacío por sí mismo.
5. Conserva sujetos, relaciones y conclusión del original. No añadas hechos ni cambies el tema.
6. No generes hashtags.
7. No incluyas URLs externas en el cuerpo final.
8. No uses símbolos Markdown.
9. Devuelve solo el texto final. Sin alternativas, análisis, puntuaciones ni prefacio.`,
    id: `[Aturan output penulisan ulang]:
1. Jangan gunakan klise AI generik.
2. Baris pertama harus memberi penilaian, kontras, atau gap informasi. Hindari pembuka marketing klise.
3. Tulis secara natural seperti orang sungguhan mengetik di ponsel.
4. Gunakan jeda baris hanya jika membantu logika. Jangan menambah ruang kosong tanpa alasan.
5. Pertahankan subjek, relasi, dan kesimpulan asli. Jangan menambah fakta atau mengganti topik.
6. Jangan buat hashtag.
7. Jangan sertakan URL eksternal di body final.
8. Jangan gunakan simbol Markdown.
9. Hanya keluarkan teks final. Tanpa alternatif, analisis, skor, atau pembuka.`
  }
};

function interpolate(template = '', variables = {}) {
  return String(template).replace(/\$\{(\w+)\}/g, (_, key) => variables[key] ?? '');
}

function getPromptText(value = 'auto', key, variables = {}, navigatorLanguage = '') {
  const lang = normalizeEngineLanguage(value, navigatorLanguage);
  const template = PROMPT_TEXT[key]?.[lang] || PROMPT_TEXT[key]?.en || PROMPT_TEXT[key]?.zh || '';
  return interpolate(template, variables);
}

export {
  SUPPORTED_UI_LANGS,
  detectBrowserLanguage,
  normalizeEngineLanguage,
  toHtmlLang,
  toPreferredLanguage,
  getLanguageLabel,
  getLanguageInstruction,
  getLanguageName,
  getPromptText
};

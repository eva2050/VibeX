const SUPPORTED_ACCOUNT_LANGS = ['zh', 'en', 'ja', 'es', 'id'];

const X_LANG_MAP = {
  zh: 'zh',
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'zh-hans': 'zh',
  'zh-hant': 'zh',
  en: 'en',
  ja: 'ja',
  jp: 'ja',
  es: 'es',
  id: 'id',
  in: 'id'
};

function normalizeDetectedAccountLanguage(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'und') return '';
  if (X_LANG_MAP[raw]) return X_LANG_MAP[raw];
  const base = raw.split('-')[0];
  return X_LANG_MAP[base] || '';
}

function getWordHits(text = '', words = []) {
  const value = ` ${String(text || '').toLowerCase()} `;
  return words.reduce((count, word) => {
    const pattern = new RegExp(`\\b${word}\\b`, 'i');
    return count + (pattern.test(value) ? 1 : 0);
  }, 0);
}

function detectLanguageFromText(text = '') {
  const value = String(text || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[@#][\w_]+/g, ' ')
    .trim();
  if (!value) return '';

  const han = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const kana = (value.match(/[\u3040-\u30ff]/g) || []).length;
  const latin = (value.match(/[a-z]/gi) || []).length;
  const totalSignal = han + kana + latin;
  if (totalSignal < 6) return '';

  if (kana >= 2 || kana / totalSignal >= 0.05) return 'ja';
  if (han >= 4 && han / totalSignal >= 0.18) return 'zh';

  const spanishHits = getWordHits(value, [
    'que', 'para', 'como', 'pero', 'porque', 'esta', 'este', 'estos', 'estas',
    'los', 'las', 'del', 'por', 'sin', 'sobre', 'cuando', 'donde', 'muy'
  ]);
  if (/[áéíóúñ¿¡]/i.test(value) || spanishHits >= 3) return 'es';

  const indonesianHits = getWordHits(value, [
    'yang', 'dan', 'untuk', 'dengan', 'dari', 'ini', 'itu', 'bisa', 'akan',
    'lebih', 'tidak', 'karena', 'saya', 'kamu', 'mereka', 'sebagai'
  ]);
  if (indonesianHits >= 3) return 'id';

  if (latin / totalSignal >= 0.55) return 'en';
  return '';
}

function inferDominantAccountLanguage(posts = [], options = {}) {
  const counts = {};
  const samples = Array.isArray(posts) ? posts : [];
  samples.forEach((post) => {
    const language = normalizeDetectedAccountLanguage(post?.language || post?.lang)
      || detectLanguageFromText(post?.text || '');
    if (!SUPPORTED_ACCOUNT_LANGS.includes(language)) return;
    counts[language] = (counts[language] || 0) + 1;
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const sampleCount = entries.reduce((sum, [, count]) => sum + count, 0);
  if (sampleCount < (options.minSamples || 2) || entries.length === 0) {
    return { language: '', confidence: 0, sampleCount, counts };
  }

  const [language, count] = entries[0];
  const confidence = count / sampleCount;
  const requiredConfidence = sampleCount >= 4 ? 0.6 : 1;
  if (count < 2 || confidence < requiredConfidence) {
    return { language: '', confidence, sampleCount, counts };
  }

  return {
    language,
    confidence,
    sampleCount,
    counts
  };
}

export {
  SUPPORTED_ACCOUNT_LANGS,
  normalizeDetectedAccountLanguage,
  detectLanguageFromText,
  inferDominantAccountLanguage
};

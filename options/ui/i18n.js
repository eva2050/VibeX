import { renderVault, renderAiMemory } from './logs.js';

// Fragment dictionary: short Chinese terms → target language
// These are applied as global string replacements, no regex magic needed.
// To add new terms, just add a new entry here.
const _fragDict = {
  // --- Scoring labels ---
  '疑似项目方/官方号': { en: 'Possible project/official', ja: 'プロジェクト/公式の可能性', es: 'Posible proyecto/oficial', id: 'Kemungkinan proyek/resmi' },
  '非目标账号的二级回复': { en: '2nd-level reply to non-target', ja: '非ターゲットへの二次返信', es: 'Respuesta nivel 2 a no objetivo', id: 'Balasan level 2 ke non-target' },
  '非优先互动账号，且主题与账号策略不相关': { en: 'Non-priority account, topic unrelated to strategy', ja: '非優先アカウントで、トピックが戦略に無関係', es: 'Cuenta no prioritaria, tema irrelevante', id: 'Akun non-prioritas, topik tidak relevan' },
  '主题与账号策略不相关': { en: 'Topic unrelated to strategy', ja: 'トピックが戦略に無関係', es: 'Tema irrelevante a la estrategia', id: 'Topik tidak relevan dengan strategi' },
  '涉及政治/战争等敏感话题': { en: 'Involves sensitive topics like politics/war', ja: '政治/戦争などのデリケートな話題', es: 'Involucra temas sensibles (política/guerra)', id: 'Melibatkan topik sensitif (politik/perang)' },
  '24小时内已互动过该账号': { en: 'Already interacted with this account in last 24h', ja: 'このアカウントとは過去24時間以内にやり取りしました', es: 'Ya interactuó con esta cuenta en las últimas 24h', id: 'Sudah berinteraksi dengan akun ini dlm 24j terakhir' },
  '优先互动账号': { en: 'Priority account', ja: '優先アカウント', es: 'Cuenta prioritaria', id: 'Akun prioritas' },
  '自己的推文': { en: 'Own tweet', ja: '自分のツイート', es: 'Tweet propio', id: 'Tweet sendiri' },
  '未读取到推文 status id，无法走官方 intent 回复。': { en: 'Tweet status id not found, cannot use official intent reply.', ja: 'ツイートのstatus idが見つかりません。公式intent返信を使用できません。', es: 'No se encontró el ID de estado del tweet, no se puede usar respuesta intent.', id: 'ID status tweet tidak ditemukan, tidak dapat menggunakan balasan intent resmi.' },
  '非目标账号': { en: 'Non-target', ja: '非ターゲット', es: 'No objetivo', id: 'Bukan target' },
  '主题相关': { en: 'Topic match', ja: 'トピック一致', es: 'Tema relevante', id: 'Topik cocok' },
  '极度热门爆款': { en: 'Viral hit', ja: 'バイラルヒット', es: 'Éxito viral', id: 'Hit viral' },
  '未知发布时间': { en: 'Unknown post time', ja: '不明な投稿時間', es: 'Hora desconocida', id: 'Waktu tidak diketahui' },
  '30分钟内': { en: '≤30min', ja: '30分以内', es: '≤30min', id: '≤30mnt' },
  '2小时内': { en: '≤2h', ja: '2時間以内', es: '≤2h', id: '≤2jam' },
  '6小时内': { en: '≤6h', ja: '6時間以内', es: '≤6h', id: '≤6jam' },
  '24小时内': { en: '≤24h', ja: '24時間以内', es: '≤24h', id: '≤24jam' },
  '24小时以上': { en: '>24h', ja: '24時間以上', es: '>24h', id: '>24jam' },
  '48小时以上': { en: '>48h', ja: '48時間以上', es: '>48h', id: '>48jam' },
  '高互动': { en: 'High engage', ja: '高エンゲージ', es: 'Alta interac.', id: 'Engage tinggi' },
  '互动不足': { en: 'Low engage', ja: '低エンゲージ', es: 'Baja interac.', id: 'Engage rendah' },
  '原推过长': { en: 'Tweet too long', ja: 'ツイート長すぎ', es: 'Tweet muy largo', id: 'Tweet terlalu panjang' },
  '适合补充观点': { en: 'Good for perspective', ja: '視点追加に適す', es: 'Para añadir perspectiva', id: 'Bagus untuk perspektif' },
  '可回答问题': { en: 'Question to answer', ja: '回答可能な質問', es: 'Pregunta para responder', id: 'Pertanyaan untuk dijawab' },
  '适合补充经验/判断': { en: 'Good for experience/judgment', ja: '経験/判断追加に適す', es: 'Para experiencia/juicio', id: 'Untuk pengalaman/penilaian' },
  '搜索结果互动量过低': { en: 'Search result engagement too low', ja: '検索結果のエンゲージメントが低すぎます', es: 'Interacción de resultados de búsqueda demasiado baja', id: 'Keterlibatan hasil pencarian terlalu rendah' },
  '无可读互动指标': { en: 'No readable metrics', ja: '読み取り可能な指標なし', es: 'Sin métricas legibles', id: 'Tidak ada metrik yang terbaca' },
  // --- Metrics labels ---
  '浏览': { en: 'Views', ja: '表示', es: 'Vistas', id: 'Tayangan' },
  '转发': { en: 'RTs', ja: 'RT', es: 'RTs', id: 'RT' },
  '回复': { en: 'Replies', ja: '返信', es: 'Respuestas', id: 'Balasan' },
  '赞': { en: 'Likes', ja: 'いいね', es: 'Me gusta', id: 'Suka' },
  // --- Misc common terms ---
  '广告/推广内容': { en: 'Ad/Promo', ja: '広告/プロモ', es: 'Anuncio/Promo', id: 'Iklan/Promo' },
  'AI 回复为空': { en: 'AI reply is empty', ja: 'AIの返信が空です', es: 'Respuesta de IA vacía', id: 'Balasan AI kosong' },
  '机会分': { en: 'Score:', ja: 'スコア:', es: 'Puntuación:', id: 'Skor:' },
  '互动机会分': { en: 'Opportunity score', ja: '機会スコア', es: 'Puntuación de oportunidad', id: 'Skor peluang' },
  '同步到云端失败:': { en: 'Failed to sync to cloud:', ja: 'クラウドへの同期に失敗しました:', es: 'Error al sincronizar en la nube:', id: 'Gagal menyinkronkan ke cloud:' },
  '从云端拉取配置失败:': { en: 'Failed to pull from cloud:', ja: 'クラウドからの取得に失敗しました:', es: 'Error al extraer de la nube:', id: 'Gagal menarik dari cloud:' },
  '已成功从云端 (Github Gist) 拉取最新配置。': { en: 'Successfully pulled latest config from cloud (Github Gist).', ja: 'クラウド (Github Gist) から最新設定を取得しました。', es: 'Configuración más reciente extraída con éxito (Github Gist).', id: 'Berhasil menarik konfigurasi terbaru dari cloud (Github Gist).' },
  '随时': { en: 'anytime', ja: 'いつでも', es: 'en cualquier momento', id: 'kapan saja' },
  '未知': { en: 'unknown', ja: '不明', es: 'desconocido', id: 'tidak diketahui' },
  '无': { en: 'none', ja: 'なし', es: 'ninguno', id: 'tidak ada' },
  '约': { en: '~', ja: '約', es: '~', id: '~' },
  '分钟后': { en: 'min later', ja: '分後', es: 'min después', id: 'mnt lagi' },
  '准备中/即将发送': { en: 'Preparing/Sending soon', ja: '準備中/まもなく送信', es: 'Preparando/Enviando pronto', id: 'Mempersiapkan/Segera mengirim' },
  '低于': { en: 'below', ja: '未満', es: 'por debajo de', id: 'di bawah' },
};

// Sort fragment keys longest-first so "非目标账号的二级回复" is tried before "非目标账号"
const _fragKeys = Object.keys(_fragDict).sort((a, b) => b.length - a.length);

export function getCurrentLang() {
  const langInput = document.getElementById('engine-language');
  let lang = langInput ? langInput.value : 'zh';
  if (lang === 'auto') lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
  return lang;
}

export function t(key, fallback) {
  const lang = getCurrentLang();
  const dict = window.i18nDict[lang] || window.i18nDict.zh;
  return dict[key] || fallback || key;
}

export function translateBackendLog(msg, lang, depth = 0) {
  if (lang === 'auto') {
    lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
  }
  if (lang === 'zh' || !lang || depth > 5) return msg;
  let translated = msg;

  // --- Pass 1: Regex dictionary (structured sentence patterns) ---
  for (const item of window.backendLogDict || []) {
    if (!(item.p instanceof RegExp)) continue;
    item.p.lastIndex = 0;
    if (!item.p.test(translated)) continue;
    item.p.lastIndex = 0;
    translated = translated.replace(item.p, (...args) => {
      let template = item[lang] || item.en || args[0];
      // Recursively translate captured groups
      if (args.length > 3) {
        for (let i = 1; i < args.length - 2; i++) {
          if (args[i]) {
            const translatedParam = translateBackendLog(args[i], lang, depth + 1);
            template = template.replace(new RegExp(`\\$${i}`, 'g'), translatedParam);
          }
        }
      }
      return template;
    });
  }

  // --- Pass 2: Fragment dictionary (short Chinese tags/labels) ---
  for (const zh of _fragKeys) {
    if (translated.includes(zh)) {
      const replacement = _fragDict[zh][lang] || _fragDict[zh].en || zh;
      translated = translated.split(zh).join(replacement);
    }
  }

  // --- Pass 3: Full-width punctuation normalization ---
  translated = translated.replace(/（/g, '(').replace(/）/g, ')');
  translated = translated.replace(/：/g, ': ').replace(/，/g, ', ');
  // Clean up double spaces from colon replacement
  translated = translated.replace(/: {2,}/g, ': ');
  // Translate Chinese enumeration comma
  translated = translated.replace(/、/g, ', ');

  return translated;
}

export function applyLanguage(lang) {
  if (lang === 'auto') {
    lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
  }
  const dict = window.i18nDict[lang] || window.i18nDict.en;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key]) {
      el.placeholder = dict[key];
    }
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (dict[key]) {
      el.title = dict[key];
    }
  });
  document.querySelectorAll('[data-i18n-attr]').forEach(el => {
    const rules = el.getAttribute('data-i18n-attr').split(',');
    rules.forEach(rule => {
      const parts = rule.split(':');
      if (parts.length === 2 && dict[parts[1]]) {
        el.setAttribute(parts[0], dict[parts[1]]);
      }
    });
  });
  
  // Custom dropdown translation updates
  document.querySelectorAll('.custom-select-option').forEach(el => {
     const i18nKey = el.getAttribute('data-i18n');
     if (i18nKey && dict[i18nKey]) el.textContent = dict[i18nKey];
  });
  // Update trigger texts if needed based on selected option
  document.querySelectorAll('.custom-select-container').forEach(container => {
     const selected = container.querySelector('.custom-select-option.selected');
     const triggerSpan = container.querySelector('.custom-select-trigger span');
     if (selected && triggerSpan) {
        triggerSpan.textContent = selected.textContent;
     }
  });
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  // Re-render vault with translated buttons/dates
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ draftVault: [], aiMemory: { learnedRules: [] } }, (items) => {
      renderVault(items.draftVault);
      renderAiMemory(items.aiMemory, items.draftVault);
    });
  }
  
  // Update style training textarea placeholders
  document.querySelectorAll('#style-training-list textarea').forEach(ta => {
    ta.placeholder = dict.placeholder_style || '粘贴一条过往的高赞推文...';
  });
}

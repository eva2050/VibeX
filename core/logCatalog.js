import { normalizeEngineLanguage } from './i18n.js';

const LOG_MESSAGES = {
  reply_strategy_unrecognized: {
    zh: '回复策略设置值"{0}"无法匹配已知策略枚举，已回退为通用策略模板',
    en: 'Reply strategy value "{0}" did not match any known strategy enum; falling back to the generic strategy template.',
    ja: '返信戦略の設定値「{0}」が既知の戦略と一致しないため、汎用テンプレートにフォールバックしました',
    es: 'El valor de estrategia de respuesta "{0}" no coincide con ninguna estrategia conocida; se usa la plantilla genérica.',
    id: 'Nilai strategi balasan "{0}" tidak cocok dengan strategi yang dikenal; menggunakan template generik.'
  },
  storage_migrated: {
    zh: '本地数据结构已升级到 v{0}',
    en: 'Local data schema upgraded to v{0}',
    ja: 'ローカルデータ構造を v{0} に更新しました',
    es: 'Estructura de datos local actualizada a v{0}',
    id: 'Skema data lokal diperbarui ke v{0}'
  },
  extension_updated: {
    zh: '扩展已更新，已强制清空发帖队列以应用新规则',
    en: 'Extension updated. Post queue cleared to apply new rules.',
    ja: '拡張機能を更新しました。新しいルール適用のため投稿キューをクリアしました。',
    es: 'Extensión actualizada. Cola de posts limpiada para aplicar nuevas reglas.',
    id: 'Ekstensi diperbarui. Antrean post dibersihkan untuk menerapkan aturan baru.'
  },
  extension_installed: {
    zh: '扩展程序已安装',
    en: 'Extension installed',
    ja: '拡張機能をインストールしました',
    es: 'Extensión instalada',
    id: 'Ekstensi terpasang'
  },
  x_login_detected: {
    zh: '检测到 X 已登录，侧边栏可继续配置账号策略',
    en: 'X login detected. Continue account setup from the side panel.',
    ja: 'X ログインを検出しました。サイドパネルでアカウント設定を続けられます。',
    es: 'Inicio de sesión en X detectado. Continúa la configuración desde el panel lateral.',
    id: 'Login X terdeteksi. Lanjutkan pengaturan akun dari side panel.'
  },
  config_updated: {
    zh: '系统配置已更新',
    en: 'Settings saved',
    ja: '設定を保存しました',
    es: 'Ajustes guardados',
    id: 'Pengaturan disimpan'
  },
  language_switched: {
    zh: '输出语言已切换',
    en: 'Output language switched',
    ja: '出力言語を切り替えました',
    es: 'Idioma de salida cambiado',
    id: 'Bahasa keluaran diganti'
  },
  automation_started: {
    zh: '机器人已启动',
    en: 'Automation started',
    ja: 'Agent を開始しました',
    es: 'Agent iniciado',
    id: 'Agent dimulai'
  },
  automation_stopped: {
    zh: '机器人已停止',
    en: 'Automation stopped',
    ja: 'Agent を停止しました',
    es: 'Agent detenido',
    id: 'Agent berhenti'
  },
  automation_paused: {
    zh: '自动操作已暂停，跳过本次执行',
    en: 'Automation paused. Skipping this run.',
    ja: '自動操作は一時停止中です。この実行をスキップします。',
    es: 'Automatización pausada. Se omite esta ejecución.',
    id: 'Otomatisasi dijeda. Melewati eksekusi ini.'
  },
  post_schedule_fixed: {
    zh: '固定间隔模式：计划 {0} 发推',
    en: 'Fixed interval mode: post scheduled for {0}',
    ja: '固定間隔モード：{0} に投稿予定',
    es: 'Modo intervalo fijo: post programado para {0}',
    id: 'Mode interval tetap: post dijadwalkan pada {0}'
  },
  post_schedule_smart: {
    zh: '智能分布模式：计划 {0} 发推（今日 {1}/{2}）',
    en: 'Smart distribution mode: post scheduled for {0} ({1}/{2} today)',
    ja: 'スマート分散モード：{0} に投稿予定（本日 {1}/{2}）',
    es: 'Modo distribución inteligente: post programado para {0} ({1}/{2} hoy)',
    id: 'Mode distribusi pintar: post dijadwalkan pada {0} ({1}/{2} hari ini)'
  },
  post_generation_started: {
    zh: '正在即时生成推文...',
    en: 'Generating post now...',
    ja: '投稿を生成中...',
    es: 'Generando post...',
    id: 'Sedang membuat post...'
  },
  post_generation_success: {
    zh: '推文生成成功，正在执行发推...',
    en: 'Post generated. Publishing...',
    ja: '投稿生成完了。公開中...',
    es: 'Post generado. Publicando...',
    id: 'Post berhasil dibuat. Menerbitkan...'
  },
  post_published: {
    zh: '推文发布成功，今日已发 {0} 条',
    en: 'Post published. {0} posts sent today.',
    ja: '投稿成功。本日 {0} 件投稿済み。',
    es: 'Post publicado. {0} posts enviados hoy.',
    id: 'Post terbit. {0} post terkirim hari ini.'
  },
  post_saved_to_posts: {
    zh: '自动发布内容已写入 Posts，并会自动追踪表现',
    en: 'Auto-published content saved to Posts and queued for performance review.',
    ja: '自動公開コンテンツを Posts に保存し、実績レビューに登録しました。',
    es: 'Contenido autopublicado guardado en Posts y puesto en revisión de rendimiento.',
    id: 'Konten otomatis tersimpan ke Posts dan masuk antrean review performa.'
  },
  auto_review_started: {
    zh: '开始自动复盘待追踪 post',
    en: 'Reviewing tracked post performance...',
    ja: '追跡中の投稿実績を確認中...',
    es: 'Revisando rendimiento del post rastreado...',
    id: 'Meninjau performa post terlacak...'
  },
  auto_review_saved: {
    zh: '已自动回填表现并更新 Loop',
    en: 'Performance auto-filled and Loop updated.',
    ja: '実績を自動入力し、Loop を更新しました。',
    es: 'Rendimiento autocompletado y Loop actualizado.',
    id: 'Performa diisi otomatis dan Loop diperbarui.'
  },
  x_posts_synced: {
    zh: '已同步 X posts：新增 {0} 条，更新 {1} 条，学习 {2} 条表现',
    en: 'Synced X posts: {0} added, {1} updated, {2} learned from performance.',
    ja: 'X posts を同期しました：追加 {0} 件、更新 {1} 件、実績学習 {2} 件。',
    es: 'Posts de X sincronizados: {0} añadidos, {1} actualizados, {2} aprendidos desde rendimiento.',
    id: 'Post X disinkronkan: {0} ditambahkan, {1} diperbarui, {2} dipelajari dari performa.'
  },
  x_posts_sync_failed: {
    zh: 'X posts 同步失败，但账号仍已连接：{0}',
    en: 'X posts sync failed, but the account is still connected: {0}',
    ja: 'X posts の同期に失敗しましたが、アカウント接続は有効です: {0}',
    es: 'Falló la sincronización de posts de X, pero la cuenta sigue conectada: {0}',
    id: 'Sinkronisasi post X gagal, tetapi akun tetap terhubung: {0}'
  },
  baseline_scan_saved: {
    zh: '已扫描 {0} 条高信号 posts/replies，建立账号初始基准',
    en: 'Scanned {0} high-signal posts/replies to establish the account baseline.',
    ja: '高シグナルの posts/replies を {0} 件スキャンし、アカウント基準を作成しました。',
    es: 'Se escanearon {0} posts/replies de alta señal para establecer la base de la cuenta.',
    id: 'Memindai {0} posts/replies sinyal tinggi untuk membuat baseline akun.'
  },
  baseline_scan_started: {
    zh: '开始扫描 X Profile，用于读取账号资料和表现样本',
    en: 'Scanning X Profile to read account context and performance samples.',
    ja: 'アカウント基準を作成するため、X の posts/replies を読み込んでいます。',
    es: 'Leyendo posts/replies de X para establecer la base de la cuenta.',
    id: 'Membaca posts/replies X untuk membuat baseline akun.'
  },
  baseline_scan_api_failed: {
    zh: 'X API 基准扫描失败，改用页面扫描：{0}',
    en: 'X API baseline scan failed. Falling back to page scan: {0}',
    ja: 'X API の基準スキャンに失敗しました。ページスキャンに切り替えます: {0}',
    es: 'Falló el escaneo base con X API. Usando escaneo de página: {0}',
    id: 'Pemindaian baseline X API gagal. Beralih ke pemindaian halaman: {0}'
  },
  baseline_scan_save_failed: {
    zh: '扫描结果保存失败，将稍后重试：{0}',
    en: 'Failed to save scanned samples. Will retry later: {0}',
    ja: 'スキャン結果の保存に失敗しました。後で再試行します: {0}',
    es: 'No se pudieron guardar las muestras escaneadas. Se reintentará más tarde: {0}',
    id: 'Gagal menyimpan sampel hasil pemindaian. Akan dicoba lagi nanti: {0}'
  },
  x_scan_posts_learned: {
    zh: '已将 {0} 条历史高表现 posts/replies 写入 Loop 学习',
    en: 'Added {0} high-performing historical posts/replies to Loop learning.',
    ja: '高実績の過去 posts/replies {0} 件を Loop 学習に追加しました。',
    es: 'Se añadieron {0} posts/replies históricos de alto rendimiento al aprendizaje de Loop.',
    id: '{0} post/reply historis berperforma tinggi ditambahkan ke pembelajaran Loop.'
  },
  x_profile_seeded: {
    zh: '已用 X Profile 页面资料填充 Profile @{0}',
    en: 'Profile seeded from X Profile page @{0}',
    ja: 'X アカウント @{0} から Profile を入力しました',
    es: 'Perfil completado desde la cuenta de X @{0}',
    id: 'Profile diisi dari akun X @{0}'
  },
  persona_language_synced: {
    zh: '已根据语言设置同步自动账号画像',
    en: 'Auto account profile synced to the selected language.',
    ja: '自動アカウントプロフィールを選択言語に同期しました。',
    es: 'Perfil automático sincronizado con el idioma seleccionado.',
    id: 'Profil akun otomatis disinkronkan ke bahasa yang dipilih.'
  },
  persona_language_sync_failed: {
    zh: '自动账号画像语言同步失败：{0}',
    en: 'Auto account profile language sync failed: {0}',
    ja: '自動アカウントプロフィールの言語同期に失敗しました: {0}',
    es: 'Error al sincronizar el idioma del perfil automático: {0}',
    id: 'Sinkronisasi bahasa profil akun otomatis gagal: {0}'
  },
  account_language_detected: {
    zh: '已根据 X 内容识别账号主语言：{0}（置信度 {1}%）',
    en: 'Account language detected from X content: {0} ({1}% confidence).',
    ja: 'X コンテンツからアカウント主言語を検出しました: {0}（信頼度 {1}%）',
    es: 'Idioma principal detectado desde X: {0} ({1}% de confianza).',
    id: 'Bahasa utama akun terdeteksi dari X: {0} (keyakinan {1}%).'
  },
  creator_center_opened: {
    zh: '已尝试打开 Creator Center',
    en: 'Creator Center opened when available.',
    ja: 'Creator Center を開きました。',
    es: 'Creator Center abierto si está disponible.',
    id: 'Creator Center dibuka jika tersedia.'
  },
  creator_center_synced: {
    zh: '已读取 Creator Center 可见数据',
    en: 'Creator Center visible data captured.',
    ja: 'Creator Center の表示データを読み取りました。',
    es: 'Datos visibles de Creator Center capturados.',
    id: 'Data terlihat Creator Center berhasil dibaca.'
  },
  profile_context_synced: {
    zh: '已同步 X Profile 上下文。优质推文样本请手动添加',
    en: 'X Profile context synced. Add high-quality tweet samples manually.',
    ja: 'X Profile の文脈を同期しました。高品質ツイートサンプルは手動で追加してください。',
    es: 'Contexto de X Profile sincronizado. Añade muestras de tweets de calidad manualmente.',
    id: 'Konteks X Profile tersinkron. Tambahkan contoh tweet berkualitas secara manual.'
  },
  x_connected: {
    zh: 'X 已连接',
    en: 'X connected',
    ja: 'X に接続しました',
    es: 'X conectado',
    id: 'X terhubung'
  },
  x_connected_with_handle: {
    zh: 'X 已连接 @{0}',
    en: 'X connected @{0}',
    ja: 'X に接続しました @{0}',
    es: 'X conectado @{0}',
    id: 'X terhubung @{0}'
  },
  x_disconnected: {
    zh: 'X 已断开连接',
    en: 'X disconnected',
    ja: 'X 接続を解除しました',
    es: 'X desconectado',
    id: 'X terputus'
  },
  x_connect_failed: {
    zh: 'X 连接失败：{0}',
    en: 'X connect failed: {0}',
    ja: 'X 接続に失敗しました: {0}',
    es: 'Error al conectar X: {0}',
    id: 'Gagal menghubungkan X: {0}'
  },
  x_oauth_request: {
    zh: 'X OAuth 请求：client_id={0}, redirect_uri={1}, scope={2}, flow={3}, pkce={4}, fallback_redirect_uri={5}',
    en: 'X OAuth request: client_id={0}, redirect_uri={1}, scope={2}, flow={3}, pkce={4}, fallback_redirect_uri={5}',
    ja: 'X OAuth リクエスト: client_id={0}, redirect_uri={1}, scope={2}, flow={3}, pkce={4}, fallback_redirect_uri={5}',
    es: 'Solicitud OAuth de X: client_id={0}, redirect_uri={1}, scope={2}, flow={3}, pkce={4}, fallback_redirect_uri={5}',
    id: 'Permintaan OAuth X: client_id={0}, redirect_uri={1}, scope={2}, flow={3}, pkce={4}, fallback_redirect_uri={5}'
  },
  manual_test_post_request: {
    zh: '收到手动测试发帖请求',
    en: 'Manual test post request received',
    ja: '手動テスト投稿リクエストを受信しました',
    es: 'Solicitud de post de prueba manual recibida',
    id: 'Permintaan post uji manual diterima'
  },
  post_failed: {
    zh: '发帖失败: {0}',
    en: 'Post failed: {0}',
    ja: '投稿失敗: {0}',
    es: 'Error al publicar: {0}',
    id: 'Post gagal: {0}'
  },
  reply_confirmed: {
    zh: '确认已回复 @{0}，进入 {1} 分钟互动冷却',
    en: 'Reply to @{0} confirmed. Entering {1} min cooldown.',
    ja: '@{0} への返信を確認。{1} 分のクールダウンに入ります。',
    es: 'Respuesta a @{0} confirmada. Enfriamiento de {1} min.',
    id: 'Balasan ke @{0} dikonfirmasi. Cooldown {1} menit.'
  },
  reply_failed: {
    zh: '回复未完成: {0}',
    en: 'Reply not completed: {0}',
    ja: '返信未完了: {0}',
    es: 'Respuesta no completada: {0}',
    id: 'Balasan belum selesai: {0}'
  },
  reply_request_received: {
    zh: '收到回复生成请求，调用 AI 接口...',
    en: 'Reply generation request received. Calling AI...',
    ja: '返信生成リクエストを受信しました。AI を呼び出しています...',
    es: 'Solicitud de respuesta recibida. Llamando a IA...',
    id: 'Permintaan balasan diterima. Memanggil AI...'
  },
  reply_generation_complete: {
    zh: 'AI 回复生成完成',
    en: 'AI reply generated',
    ja: 'AI 返信生成完了',
    es: 'Respuesta de IA generada',
    id: 'Balasan AI selesai dibuat'
  },
  ai_api_failed: {
    zh: 'AI 接口调用失败: {0}',
    en: 'AI API call failed: {0}',
    ja: 'AI API 呼び出し失敗: {0}',
    es: 'Error en API de IA: {0}',
    id: 'Panggilan API AI gagal: {0}'
  },
  extract_link_request: {
    zh: '收到链接提取请求: {0}',
    en: 'Link extraction request received: {0}',
    ja: 'リンク抽出リクエストを受信: {0}',
    es: 'Solicitud de extracción de enlace: {0}',
    id: 'Permintaan ekstraksi tautan: {0}'
  },
  magic_prompt_request: {
    zh: '收到魔法指令请求: {0}',
    en: 'Magic prompt request received: {0}',
    ja: 'Magic prompt リクエストを受信: {0}',
    es: 'Solicitud de magic prompt: {0}',
    id: 'Permintaan magic prompt diterima: {0}'
  },
  link_extract_success: {
    zh: '成功提取链接内容 ({0} 字符)，进入重写流程...',
    en: 'Extracted link content ({0} chars). Starting rewrite...',
    ja: 'リンク内容を抽出しました（{0} 文字）。書き換え開始...',
    es: 'Contenido extraído ({0} caracteres). Iniciando reescritura...',
    id: 'Konten tautan diekstrak ({0} karakter). Memulai tulis ulang...'
  },
  link_extract_failed: {
    zh: '链接提取失败: {0}',
    en: 'Link extraction failed: {0}',
    ja: 'リンク抽出失敗: {0}',
    es: 'Error al extraer enlace: {0}',
    id: 'Ekstraksi tautan gagal: {0}'
  },
  task_completed_length: {
    zh: '任务完成。生成长度: {0}',
    en: 'Task completed. Generated length: {0}',
    ja: 'タスク完了。生成文字数: {0}',
    es: 'Tarea completada. Longitud generada: {0}',
    id: 'Tugas selesai. Panjang hasil: {0}'
  },
  task_failed: {
    zh: '任务失败',
    en: 'Task failed',
    ja: 'タスク失敗',
    es: 'Tarea fallida',
    id: 'Tugas gagal'
  },
  no_api_key: {
    zh: '缺少 API Key，任务终止',
    en: 'Missing API Key. Task stopped.',
    ja: 'API Key がありません。タスクを停止しました。',
    es: 'Falta API Key. Tarea detenida.',
    id: 'API Key hilang. Tugas dihentikan.'
  },
  no_content: {
    zh: '请先捕获内容后再执行操作',
    en: 'Capture content before running this action.',
    ja: '先にコンテンツを取得してください。',
    es: 'Captura contenido antes de ejecutar esta acción.',
    id: 'Ambil konten terlebih dahulu sebelum menjalankan aksi.'
  },
  performance_saved: {
    zh: '表现反馈已保存，AI 记忆已更新',
    en: 'Performance feedback saved. AI memory updated.',
    ja: '実績フィードバックを保存し、AI 記憶を更新しました。',
    es: 'Feedback de rendimiento guardado. Memoria de IA actualizada.',
    id: 'Feedback performa disimpan. Memori AI diperbarui.'
  },
  performance_no_rule: {
    zh: '表现处于预测范围内，未新增偏差规则',
    en: 'Performance was within prediction range. No deviation rule added.',
    ja: '実績は予測範囲内です。偏差ルールは追加しません。',
    es: 'El rendimiento estuvo dentro de la predicción. No se añadió regla.',
    id: 'Performa dalam rentang prediksi. Tidak ada aturan deviasi baru.'
  },
  post_deleted: {
    zh: '已从 Posts 删除',
    en: 'Removed from Posts',
    ja: 'Posts から削除しました',
    es: 'Eliminado de Posts',
    id: 'Dihapus dari Posts'
  },
  post_hidden_from_learning: {
    zh: '已隐藏，并从 Loop 学习中排除',
    en: 'Hidden and excluded from Loop learning',
    ja: '非表示にし、Loop 学習から除外しました',
    es: 'Oculto y excluido del aprendizaje de Loop',
    id: 'Disembunyikan dan dikecualikan dari pembelajaran Loop'
  },
  copy_failed: {
    zh: '复制失败: {0}',
    en: 'Copy failed: {0}',
    ja: 'コピー失敗: {0}',
    es: 'Error al copiar: {0}',
    id: 'Gagal menyalin: {0}'
  },
  feedback_saved: {
    zh: '反馈已保存，后续生成会参考这次修改',
    en: 'Feedback saved. Future generations will reference this edit.'
  },
  preference_like_saved: {
    zh: '已收录为正面案例，后续将倾向此风格',
    en: 'Saved as a positive example. Future generations will lean toward this style.'
  },
  preference_dislike_saved: {
    zh: '已收录为反面案例，后续将避免此风格',
    en: 'Saved as a negative example. Future generations will avoid this style.'
  },
  context_account_locked: {
    zh: '已锁定账号上下文: {0}',
    en: 'Account context locked: {0}'
  },
  url_detected: {
    zh: '检测到 URL，正在提取内容',
    en: 'URL detected. Extracting content.'
  },
  executing_action: {
    zh: '正在执行: {0}',
    en: 'Running: {0}'
  },
  api_timeout_kept_chars: {
    zh: 'API 响应极慢，触发超时保护，已保留当前生成的 {0} 个字符',
    en: 'API response is slow. Timeout protection triggered; kept {0} generated chars.'
  },
  sim_done: {
    zh: '模拟生成完成',
    en: 'Simulation completed'
  },
  auto_saved: {
    zh: '自动存入储备库',
    en: 'Auto-saved to library'
  },
  no_context: {
    zh: '没有可用上下文',
    en: 'No available context'
  },
  enter_material: {
    zh: '请先输入素材',
    en: 'Enter material first'
  },
  profile_reanalysis_started: {
    zh: '使用已读取的主页简介重新分析账号画像',
    en: 'Reanalyzing account persona using the saved profile bio.'
  },
  x_tab_missing_open_home: {
    zh: '未找到 X 标签页，打开 X 首页等待登录/读取',
    en: 'No X tab found. Opening X home to wait for login/profile read.'
  },
  automation_x_home_opened: {
    zh: '未找到可用 X 标签页，已打开 X 首页启动 AutoReply/Auto 流程',
    en: 'No available X tab found. Opened X home to start AutoReply/Auto.'
  },
  automation_x_tab_awakened: {
    zh: '已唤醒 X 标签页，开始 AutoReply/Auto 浏览扫描',
    en: 'X tab awakened. Starting AutoReply/Auto browsing scan.'
  },
  automation_x_tab_wake_failed: {
    zh: 'X 标签页未响应 AutoReply 唤醒，已刷新到首页：{0}',
    en: 'X tab did not respond to AutoReply wake-up. Refreshing home: {0}'
  },
  x_tab_read_unresponsive: {
    zh: 'X 标签页未响应读取指令，刷新到 X 首页: {0}',
    en: 'X tab did not respond to profile read command. Refreshing home: {0}'
  },
  strategy_setup_completed: {
    zh: '策略配置完成，Agent 已自动启动',
    en: 'Strategy setup completed. Agent started automatically.'
  },
  automation_paused_skip_schedule: {
    zh: '自动操作已暂停，跳过发推调度',
    en: 'Automation paused. Skipping post scheduling.'
  },
  smart_slots_empty: {
    zh: '智能时段配置为空，使用默认时段',
    en: 'Smart time slots are empty. Using default slots.'
  },
  next_post_scheduled: {
    zh: '{0}: {1}',
    en: '{0}: {1}'
  },
  next_post_scheduled_default: {
    zh: '已安排下一次发推: {0}',
    en: 'Next post scheduled: {0}'
  },
  auto_post_scheduled: {
    zh: '全自动发帖: 计划 {0} 发推',
    en: 'Auto post scheduled for {0}'
  },
  post_timer_triggered: {
    zh: '定时器触发，准备执行发推',
    en: 'Post timer fired. Preparing to publish.'
  },
  max_work_time_reached: {
    zh: '已达到单次最大连续工作时长，机器人已自动停止',
    en: 'Maximum continuous work time reached. Agent stopped automatically.'
  },
  automation_paused_skip_post: {
    zh: '自动操作已暂停，跳过本次发推执行',
    en: 'Automation paused. Skipping this post run.'
  },
  post_generation_busy: {
    zh: '当前已有推文正在生成中，请耐心等待...',
    en: 'A post is already being generated. Please wait...'
  },
  post_publish_busy: {
    zh: '当前已有发帖流程正在执行，跳过重复触发',
    en: 'A post publish flow is already running. Skipping duplicate trigger.'
  },
  post_skipped_reply_flow_busy: {
    zh: '检测到自动回复正在进行中，本轮发帖已跳过，稍后自动重试',
    en: 'An auto-reply is currently in progress. Skipping this post run; it will retry shortly.'
  },
  persona_self_heal_triggered: {
    zh: '检测到账号定位仍是占位内容，已在后台重新触发定位分析',
    en: 'Account positioning was still a placeholder; re-triggered persona analysis in the background.'
  },
  post_trigger_cooling_down: {
    zh: '发帖触发冷却中，跳过重复触发',
    en: 'Post trigger is cooling down. Skipping duplicate trigger.'
  },
  daily_post_limit_reached: {
    zh: '今日已达发推上限 {0}/{1}，跳过本次执行',
    en: 'Daily post limit reached ({0}/{1}). Skipping this run.'
  },
  empty_generated_post: {
    zh: '生成的推文为空，已跳过本次发推',
    en: 'Generated post was empty. Skipping this run.'
  },
  send_post_command_to_tab: {
    zh: '向标签页 {0} 发送发推指令',
    en: 'Sending post command to tab {0}'
  },
  content_script_unresponsive_open_intent: {
    zh: '标签页未响应内容脚本，改开干净 intent/post 标签页: {0}',
    en: 'Content script did not respond. Opening a clean intent/post tab: {0}'
  },
  no_x_tab_open_intent: {
    zh: '未找到 X.com 标签页，新建 intent/post 标签页',
    en: 'No X.com tab found. Opening an intent/post tab.'
  },
  test_post_success: {
    zh: '测试推文发送成功',
    en: 'Test post sent successfully'
  },
  config_incomplete_content: {
    zh: '配置不完整，无法生成内容: {0}',
    en: 'Configuration incomplete. Cannot generate content: {0}'
  },
  config_incomplete_reply: {
    zh: '配置不完整，无法生成回复: {0}',
    en: 'Configuration incomplete. Cannot generate reply: {0}'
  },
  config_incomplete_persona: {
    zh: '配置不完整，无法分析账号画像: {0}',
    en: 'Configuration incomplete. Cannot analyze persona: {0}'
  },
  config_incomplete_competitor: {
    zh: '配置不完整，无法分析竞品: {0}',
    en: 'Configuration incomplete. Cannot analyze competitors: {0}'
  },
  reply_skipped_by_ai: {
    zh: 'AI 判定不适合回复，已跳过: {0}...',
    en: 'AI decided this is not worth replying to. Skipped: {0}...'
  },
  reply_rejected: {
    zh: '{0}，已跳过: {1}...',
    en: '{0}. Skipped: {1}...'
  },
  reply_rejected_low_confidence: {
    zh: '模型自评分过低（均分 {0}），判断该回复质量不可靠，已跳过: {1}...',
    en: 'The model\'s own self-assigned score was too low (avg {0}), indicating an unreliable reply; skipped: {1}...',
    ja: 'モデル自身の自己採点が低すぎたため（平均 {0}）、信頼できない返信と判断してスキップしました: {1}...',
    es: 'La autoevaluación del propio modelo fue demasiado baja (promedio {0}), lo que indica una respuesta poco fiable; omitida: {1}...',
    id: 'Skor penilaian mandiri model terlalu rendah (rata-rata {0}), menandakan balasan tidak dapat diandalkan; dilewati: {1}...'
  },
  reply_generation_failed: {
    zh: '生成回复失败: {0}',
    en: 'Reply generation failed: {0}'
  },
  agent_memory_local_saved: {
    zh: 'Agent 对话已本地记录到长期记忆',
    en: 'Agent chat saved locally to long-term memory.'
  },
  agent_memory_updated: {
    zh: 'Agent 对话已更新长期记忆',
    en: 'Agent chat updated long-term memory.'
  },
  persona_analysis_started: {
    zh: '开始 AI 账号画像分析...',
    en: 'Starting AI persona analysis...'
  },
  persona_analysis_completed: {
    zh: '账号画像分析完成',
    en: 'Persona analysis completed'
  },
  persona_analysis_failed: {
    zh: '账号画像分析失败: {0}',
    en: 'Persona analysis failed: {0}'
  },
  onboarding_analysis_started: {
    zh: '开始启动向导来源分析',
    en: 'Starting onboarding source analysis'
  },
  onboarding_analysis_completed: {
    zh: '启动向导来源分析完成',
    en: 'Onboarding source analysis completed'
  },
  onboarding_analysis_failed: {
    zh: '启动向导分析失败: {0}',
    en: 'Onboarding analysis failed: {0}'
  },
  competitor_analysis_started: {
    zh: '开始竞品对标与爆款策略分析...',
    en: 'Starting competitor and viral strategy analysis...'
  },
  competitor_analysis_completed: {
    zh: '竞品分析报告生成完成',
    en: 'Competitor analysis report generated'
  },
  competitor_analysis_failed: {
    zh: '竞品分析失败: {0}',
    en: 'Competitor analysis failed: {0}'
  },
  profile_bio_updated: {
    zh: '检测到主页简介更新，触发画像分析',
    en: 'Profile bio updated. Triggering persona analysis.'
  },
  engine_start_failed: {
    zh: '启动失败: {0}，请先到配置中心完善设置',
    en: 'Start failed: {0}. Complete settings first.'
  },
  automation_resumed_pending_post: {
    zh: '检测到自动操作恢复，继续处理待发送推文',
    en: 'Automation resumed. Continuing pending post.'
  },
  post_generation_failed_retry_exhausted: {
    zh: '推文生成彻底失败，多次重试仍无可用内容。最后反馈: {0}',
    en: 'Post generation failed after retries. Last feedback: {0}'
  },
  post_quality_review_call_failed: {
    zh: '独立质量复核调用失败或返回格式异常，已默认放行本条候选，不阻塞正常发布。错误: {0}',
    en: 'The independent quality-review call failed or returned an unexpected format; the candidate was allowed through by default so it does not block publishing. Error: {0}',
    ja: '独立品質レビューの呼び出しが失敗したか、応答形式が不正だったため、投稿をブロックしないようこの候補はデフォルトで通過扱いにしました。エラー: {0}',
    es: 'La llamada de revisión de calidad independiente falló o devolvió un formato inesperado; el candidato se aprobó por defecto para no bloquear la publicación. Error: {0}',
    id: 'Panggilan tinjauan kualitas independen gagal atau mengembalikan format yang tidak terduga; kandidat diloloskan secara default agar tidak menghalangi publikasi. Error: {0}'
  },
  post_generation_skipped_quality_gate: {
    zh: '本轮生成的候选内容未通过质量把关，已跳过发布（不会发布不合格草稿），将在下次调度周期重新生成。原因: {0}',
    en: 'This round\'s best candidate did not pass the quality gate; skipped publishing (never publishes a substandard draft). Will retry on the next scheduled cycle. Reason: {0}',
    ja: '今回生成した候補が品質チェックを通過しなかったため、投稿をスキップしました（基準未達の下書きは投稿しません）。次回のスケジュールで再生成します。理由: {0}',
    es: 'El mejor candidato de esta ronda no superó el control de calidad; se omitió la publicación (nunca se publica un borrador deficiente). Se reintentará en el próximo ciclo programado. Motivo: {0}',
    id: 'Kandidat terbaik pada putaran ini tidak lolos pemeriksaan kualitas; publikasi dilewati (tidak pernah mempublikasikan draf di bawah standar). Akan dicoba lagi pada siklus terjadwal berikutnya. Alasan: {0}'
  },
  studio_quality_guard_warning: {
    zh: 'Studio 质量检查发现这版可能有问题: {0}',
    en: 'Studio quality guard flagged possible issues: {0}',
    ja: 'Studio 品質チェックが問題の可能性を検出しました: {0}',
    es: 'La revisión de calidad de Studio detectó posibles problemas: {0}',
    id: 'Pemeriksaan kualitas Studio mendeteksi potensi masalah: {0}'
  },
  datahub_complex_route: {
    zh: '检测到复杂/音视频链接，提交 DataHub 异步提取任务...',
    en: 'Complex/media link detected. Submitting async DataHub extraction task...'
  },
  datahub_task_submitted: {
    zh: 'DataHub 任务提交成功，等待解析完成...',
    en: 'DataHub task submitted. Waiting for extraction to complete...'
  },
  datahub_key_missing_fallback: {
    zh: '未配置 DataHub API Key，复杂链接改用 Jina 提取',
    en: 'DataHub API key is not configured. Falling back to Jina extraction.'
  },
  datahub_fallback_jina: {
    zh: 'DataHub 提取失败，改用 Jina: {0}',
    en: 'DataHub extraction failed. Falling back to Jina: {0}'
  },
  jina_route: {
    zh: '走常规图文提取 Jina API...',
    en: 'Using standard Jina API text extraction...'
  },
  extract_trial_success: {
    zh: '提取成功 ({0} 字符)。未配置 API，已跳过大模型。',
    en: 'Extraction succeeded ({0} chars). No API configured, skipped model rewrite.'
  },
  rewrite_request_received: {
    zh: '收到推文改写请求，文风人设: {0}，句式流派: {1}',
    en: 'Rewrite request received. Archetype: {0}; style: {1}'
  },
  rewrite_generation_complete: {
    zh: '推文 AI 改写生成完成',
    en: 'AI rewrite generated'
  },
  rewrite_generation_failed: {
    zh: '推文 AI 改写失败: {0}',
    en: 'AI rewrite failed: {0}'
  },
  agent_chat_failed: {
    zh: 'Agent 对话失败: {0}',
    en: 'Agent chat failed: {0}'
  },
  trusted_click_failed: {
    zh: '真实点击失败，回退 DOM 点击: {0}',
    en: 'Trusted click failed. Falling back to DOM click: {0}'
  },
  automation_tab_opened: {
    zh: '当前 X 页面无法安全跳转，已新开干净自动化标签页 {0}',
    en: 'Current X page cannot navigate safely. Opened clean automation tab {0}'
  },
  profile_tab_opened: {
    zh: '后台打开 Profile 页面: {0}',
    en: 'Opened Profile page in background: {0}'
  },
  profile_read_complete: {
    zh: 'Profile 页面读取完成，关闭后台标签页',
    en: 'Profile page read completed. Closing background tab.'
  },
  profile_read_timeout: {
    zh: 'Profile 页面读取超时，已关闭后台标签页',
    en: 'Profile page read timed out. Closing background tab.'
  },
  tweet_collected: {
    zh: '成功收录推文 (作者: @{0}) 到灵感库',
    en: 'Tweet by @{0} saved to inspiration library.'
  },
  collected_tweet_deleted: {
    zh: '从灵感库中删除了一条推文',
    en: 'Removed a tweet from inspiration library.'
  }
};

const LEGACY_PATTERNS = [
  [/^本地数据结构已升级到 v(.+)$/, 'storage_migrated'],
  [/^任务完成。生成长度:?\s*(.+)$/, 'task_completed_length'],
  [/^AI 接口调用失败: (.+)$/, 'ai_api_failed'],
  [/^链接提取失败: (.+)$/, 'link_extract_failed'],
  [/^成功提取链接内容 \((.+?) 字符\)，进入重写流程\.\.\.$/, 'link_extract_success'],
  [/^收到链接提取请求: (.+)$/, 'extract_link_request'],
  [/^收到魔法指令请求: (.+)$/, 'magic_prompt_request'],
  [/^推文发布成功，今日已发 (.+) 条$/, 'post_published'],
  [/^固定间隔模式：计划 (.+) 发推$/, 'post_schedule_fixed'],
  [/^复制失败: (.+)$/, 'copy_failed'],
  [/^已锁定账号上下文: (.+)$/, 'context_account_locked'],
  [/^正在执行: (.+)$/, 'executing_action'],
  [/^API 响应极慢，触发了超时保护，但已保留当前生成的 (.+) 个字符。$/, 'api_timeout_kept_chars'],
  [/^X 标签页未响应读取指令，刷新到 X 首页: (.+)$/, 'x_tab_read_unresponsive'],
  [/^已安排下一次发推: (.+)$/, 'next_post_scheduled_default'],
  [/^全自动发帖: 计划 (.+) 发推: .+$/, 'auto_post_scheduled'],
  [/^今日已达发推上限 (.+)\/(.+)，跳过本次执行$/, 'daily_post_limit_reached'],
  [/^向标签页 (.+) 发送发推指令$/, 'send_post_command_to_tab'],
  [/^标签页未响应内容脚本，改开干净 intent\/post 标签页: (.+)$/, 'content_script_unresponsive_open_intent'],
  [/^配置不完整，无法生成内容：(.+)$/, 'config_incomplete_content'],
  [/^配置不完整，无法生成回复：(.+)$/, 'config_incomplete_reply'],
  [/^配置不完整，无法分析账号画像：(.+)$/, 'config_incomplete_persona'],
  [/^配置不完整，无法分析竞品：(.+)$/, 'config_incomplete_competitor'],
  [/^AI 判定不适合回复，已跳过: (.+)\.\.\.$/, 'reply_skipped_by_ai'],
  [/^(.+)，已跳过: (.+)\.\.\.$/, 'reply_rejected'],
  [/^生成回复失败: (.+)$/, 'reply_generation_failed'],
  [/^账号画像分析失败: (.+)$/, 'persona_analysis_failed'],
  [/^竞品分析失败: (.+)$/, 'competitor_analysis_failed'],
  [/^启动失败：(.+)，请先到配置中心完善设置$/, 'engine_start_failed'],
  [/^推文生成彻底失败，经历多次重试仍无可用内容。最后反馈：(.+)$/, 'post_generation_failed_retry_exhausted'],
  [/^\[提取体验模式\] 提取成功 \((.+?) 字符\)。未配置 API，已跳过大模型。$/, 'extract_trial_success'],
  [/^收到推文改写请求，文风人设: (.+)，句式流派: (.+)$/, 'rewrite_request_received'],
  [/^推文 AI 改写失败: (.+)$/, 'rewrite_generation_failed'],
  [/^Agent 对话失败: (.+)$/, 'agent_chat_failed'],
  [/^真实点击失败，回退 DOM 点击: (.+)$/, 'trusted_click_failed'],
  [/^当前 X 页面无法安全跳转，已新开干净自动化标签页 (.+)$/, 'automation_tab_opened'],
  [/^后台打开 Profile 页面: (.+)$/, 'profile_tab_opened'],
  [/^成功收录推文 \(作者: @(.+)\) 到灵感库$/, 'tweet_collected']
];

const LEGACY_EXACT = new Map([
  ['扩展已更新，已强制清空发帖队列以应用新规则', ['extension_updated', []]],
  ['扩展程序已安装', ['extension_installed', []]],
  ['检测到 X 已登录，自动打开策略中心', ['x_login_detected', []]],
  ['系统配置已更新。', ['config_updated', []]],
  ['系统配置已更新', ['config_updated', []]],
  ['反馈已保存，后续生成会参考这次修改', ['feedback_saved', []]],
  ['已收录为正面案例，后续将倾向此风格', ['preference_like_saved', []]],
  ['已收录为反面案例，后续将避免此风格', ['preference_dislike_saved', []]],
  ['检测到 URL，正在提取内容', ['url_detected', []]],
  ['模拟生成完成', ['sim_done', []]],
  ['自动存入储备库', ['auto_saved', []]],
  ['没有可用上下文', ['no_context', []]],
  ['请先输入素材', ['enter_material', []]],
  ['输出语言已切换', ['language_switched', []]],
  ['机器人已启动', ['automation_started', []]],
  ['机器人已停止', ['automation_stopped', []]],
  ['使用已读取的主页简介重新分析账号画像', ['profile_reanalysis_started', []]],
  ['未找到 X 标签页，打开 X 首页等待登录/读取', ['x_tab_missing_open_home', []]],
  ['策略配置完成，Agent 已自动启动', ['strategy_setup_completed', []]],
  ['自动操作已暂停，跳过发推调度', ['automation_paused_skip_schedule', []]],
  ['智能时段配置为空，使用默认时段', ['smart_slots_empty', []]],
  ['已安排下一次发推', ['next_post_scheduled_default', []]],
  ['定时器触发，准备执行发推', ['post_timer_triggered', []]],
  ['已达到单次最大连续工作时长 (10小时)，为保护账号安全，机器人已自动停止', ['max_work_time_reached', []]],
  ['自动操作已暂停，跳过本次发推执行', ['automation_paused_skip_post', []]],
  ['当前已有推文正在生成中，请耐心等待...', ['post_generation_busy', []]],
  ['生成的推文为空，已跳过本次发推', ['empty_generated_post', []]],
  ['未找到 X.com 标签页，新建 intent/post 标签页', ['no_x_tab_open_intent', []]],
  ['测试推文发送成功', ['test_post_success', []]],
  ['正在即时生成推文...', ['post_generation_started', []]],
  ['推文生成成功，正在执行发推...', ['post_generation_success', []]],
  ['收到手动测试发帖请求', ['manual_test_post_request', []]],
  ['自动发布内容已写入 Posts，可回填表现用于 Loop 学习', ['post_saved_to_posts', []]],
  ['收到回复生成请求，调用 AI 接口...', ['reply_request_received', []]],
  ['AI 回复生成完成', ['reply_generation_complete', []]],
  ['Agent 对话已本地记录到长期记忆', ['agent_memory_local_saved', []]],
  ['Agent 对话已更新长期记忆', ['agent_memory_updated', []]],
  ['开始 AI 账号画像分析...', ['persona_analysis_started', []]],
  ['账号画像分析完成', ['persona_analysis_completed', []]],
  ['开始启动向导来源分析', ['onboarding_analysis_started', []]],
  ['启动向导来源分析完成', ['onboarding_analysis_completed', []]],
  ['开始竞品对标与爆款策略分析...', ['competitor_analysis_started', []]],
  ['竞品分析报告生成完成', ['competitor_analysis_completed', []]],
  ['检测到主页简介更新，触发画像分析', ['profile_bio_updated', []]],
  ['检测到自动操作恢复，继续处理待发送推文', ['automation_resumed_pending_post', []]],
  ['[分流路由] 检测到复杂/音视频链接，提交 DataHub 异步提取任务...', ['datahub_complex_route', []]],
  ['[分流路由] 任务提交成功，正在等待 DataHub 解析完成...', ['datahub_task_submitted', []]],
  ['[分流路由] 走常规图文提取 Jina API...', ['jina_route', []]],
  ['推文 AI 改写生成完成', ['rewrite_generation_complete', []]],
  ['Profile 页面读取完成，关闭后台标签页', ['profile_read_complete', []]],
  ['从灵感库中删除了一条推文', ['collected_tweet_deleted', []]],
  ['任务失败。', ['task_failed', []]],
  ['任务失败', ['task_failed', []]],
  ['缺少 API Key，任务终止', ['no_api_key', []]],
  ['请先捕获内容后再执行操作', ['no_content', []]],
  ['Performance feedback saved. AI memory updated.', ['performance_saved', []]],
  ['Performance was within prediction range; no new deviation rule added.', ['performance_no_rule', []]],
  ['已从 Posts 删除。', ['post_deleted', []]],
  ['已从 Posts 删除', ['post_deleted', []]]
]);

function formatTemplate(template = '', args = []) {
  return String(template).replace(/\{(\d+)\}/g, (_, index) => args[index] ?? '');
}

function normalizeLogKey(key = '') {
  return LOG_MESSAGES[key] ? key : '';
}

function legacyMessageToEvent(message = '') {
  const raw = String(message || '').replace(/^✨\s*/, '').trim();
  if (LEGACY_EXACT.has(raw)) {
    const [key, args] = LEGACY_EXACT.get(raw);
    return { key, args };
  }
  for (const [pattern, key] of LEGACY_PATTERNS) {
    const match = raw.match(pattern);
    if (match) return { key, args: match.slice(1) };
  }
  return null;
}

function createLogEntry(level, messageOrKey, args = [], extra = {}) {
  const key = normalizeLogKey(messageOrKey);
  return {
    time: Date.now(),
    level,
    key: key || undefined,
    args: key ? args : undefined,
    message: key ? undefined : String(messageOrKey || ''),
    ...extra
  };
}

function renderLogEntry(entry = {}, lang = 'en', fallbackTranslator = null) {
  const normalizedLang = normalizeEngineLanguage(lang);
  const key = normalizeLogKey(entry.key);
  const event = key ? { key, args: entry.args || [] } : legacyMessageToEvent(entry.message || '');
  if (event?.key && LOG_MESSAGES[event.key]) {
    const template = LOG_MESSAGES[event.key][normalizedLang] || LOG_MESSAGES[event.key].en || LOG_MESSAGES[event.key].zh;
    return formatTemplate(template, event.args || []);
  }
  const message = String(entry.message || '');
  return typeof fallbackTranslator === 'function'
    ? fallbackTranslator(message, normalizedLang)
    : message;
}

export { LOG_MESSAGES, createLogEntry, legacyMessageToEvent, renderLogEntry };

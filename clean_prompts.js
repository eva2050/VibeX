const fs = require('fs');
let code = fs.readFileSync('prompts_i18n.js', 'utf8');

// 1. AUTO_DRAFT_BATCH arguments
code = code.replace(/\(bio, persona, memory, playbook, leadAsset, reportContext, langConstraint, uniquenessConstraint, randomSeed, outputLang, draftNeeded\) =>/g, '(langConstraint, uniquenessConstraint, randomSeed, outputLang, draftNeeded) =>');

// AUTO_DRAFT_BATCH body removals (English)
code = code.replace(/Account Bio:[\s\S]*?\$\{bio \|\| 'None'\}[\s\S]*?Persona Targeting:[\s\S]*?- Target Users: \$\{persona\.targetUsers\}[\s\S]*?- Tone & Voice: \$\{persona\.characteristics\}[\s\S]*?- Core Goals: \$\{persona\.goals\}[\s\S]*?Long-term Memory \(Must prioritize\):[\s\S]*?\$\{memory\}[\s\S]*?\$\{playbook\}[\s\S]*?\$\{leadAsset\}[\s\S]*?\$\{reportContext\}/g, '');

// AUTO_DRAFT_BATCH body removals (Chinese)
code = code.replace(/账号简介：[\s\S]*?\$\{bio \|\| '暂无'\}[\s\S]*?账号画像定位：[\s\S]*?- 目标用户：\$\{persona\.targetUsers\}[\s\S]*?- 发文特征与语气：\$\{persona\.characteristics\}[\s\S]*?- 核心发文目标：\$\{persona\.goals\}[\s\S]*?长期记忆，必须优先遵守：[\s\S]*?\$\{memory\}[\s\S]*?\$\{playbook\}[\s\S]*?\$\{leadAsset\}[\s\S]*?\$\{reportContext\}/g, '');

// AUTO_DRAFT_BATCH body removals (Japanese)
code = code.replace(/アカウントの経歴：[\s\S]*?\$\{bio \|\| 'なし'\}[\s\S]*?ペルソナターゲティング：[\s\S]*?- ターゲットユーザー：\$\{persona\.targetUsers\}[\s\S]*?- トーンと声：\$\{persona\.characteristics\}[\s\S]*?- コアの目標：\$\{persona\.goals\}[\s\S]*?長期記憶（最優先事項）：[\s\S]*?\$\{memory\}[\s\S]*?\$\{playbook\}[\s\S]*?\$\{leadAsset\}[\s\S]*?\$\{reportContext\}/g, '');

// AUTO_DRAFT_BATCH body removals (Spanish)
code = code.replace(/Biografía:[\s\S]*?\$\{bio \|\| 'Ninguna'\}[\s\S]*?Público Objetivo:[\s\S]*?- Usuarios: \$\{persona\.targetUsers\}[\s\S]*?- Tono: \$\{persona\.characteristics\}[\s\S]*?- Metas: \$\{persona\.goals\}[\s\S]*?Memoria a largo plazo \(Prioridad absoluta\):[\s\S]*?\$\{memory\}[\s\S]*?\$\{playbook\}[\s\S]*?\$\{leadAsset\}[\s\S]*?\$\{reportContext\}/g, '');

// AUTO_DRAFT_BATCH body removals (Indonesian)
code = code.replace(/Bio Akun:[\s\S]*?\$\{bio \|\| 'Tidak ada'\}[\s\S]*?Penargetan Persona:[\s\S]*?- Pengguna Target: \$\{persona\.targetUsers\}[\s\S]*?- Nada & Suara: \$\{persona\.characteristics\}[\s\S]*?- Tujuan Inti: \$\{persona\.goals\}[\s\S]*?Memori Jangka Panjang \(Harus diprioritaskan\):[\s\S]*?\$\{memory\}[\s\S]*?\$\{playbook\}[\s\S]*?\$\{leadAsset\}[\s\S]*?\$\{reportContext\}/g, '');


// 2. AGENT_CREATOR arguments
code = code.replace(/\(bio, persona, memory, playbook, leadAsset, reportContext, langConstraint, uniquenessConstraint, randomSeed, draftNeeded\) =>/g, '(langConstraint, uniquenessConstraint, randomSeed, draftNeeded) =>');

// AGENT_CREATOR body removals (English)
code = code.replace(/Account Bio: \$\{bio \|\| 'None'\}[\s\S]*?Persona: \$\{persona\.targetUsers\} \| Tone: \$\{persona\.characteristics\} \| Goals: \$\{persona\.goals\}[\s\S]*?Context: \$\{memory\}\\n\$\{playbook\}\\n\$\{reportContext\}\n/g, '');

// AGENT_CREATOR body removals (Chinese)
code = code.replace(/账号简介：\$\{bio \|\| '暂无'\}[\s\S]*?人设定位：目标用户：\$\{persona\.targetUsers\} \| 语气：\$\{persona\.characteristics\} \| 核心目标：\$\{persona\.goals\}[\s\S]*?上下文知识库：\\n\$\{memory\}\\n\$\{playbook\}\\n\$\{reportContext\}\n/g, '');

// AGENT_CREATOR body removals (Japanese)
code = code.replace(/アカウント経歴：\$\{bio \|\| 'なし'\}[\s\S]*?ペルソナ: ターゲット: \$\{persona\.targetUsers\} \| トーン: \$\{persona\.characteristics\} \| 目標: \$\{persona\.goals\}[\s\S]*?コンテキスト: \\n\$\{memory\}\\n\$\{playbook\}\\n\$\{reportContext\}\n/g, '');

// AGENT_CREATOR body removals (Spanish)
code = code.replace(/Biografía: \$\{bio \|\| 'Ninguna'\}[\s\S]*?Persona: Público: \$\{persona\.targetUsers\} \| Tono: \$\{persona\.characteristics\} \| Metas: \$\{persona\.goals\}[\s\S]*?Contexto: \\n\$\{memory\}\\n\$\{playbook\}\\n\$\{reportContext\}\n/g, '');

// AGENT_CREATOR body removals (Indonesian)
code = code.replace(/Bio: \$\{bio \|\| 'Tidak ada'\}[\s\S]*?Persona: Target: \$\{persona\.targetUsers\} \| Nada: \$\{persona\.characteristics\} \| Tujuan: \$\{persona\.goals\}[\s\S]*?Konteks: \\n\$\{memory\}\\n\$\{playbook\}\\n\$\{reportContext\}\n/g, '');

// Also clean up formatAgentMemory and formatLeadAsset usages in background.js
// Wait, I did that already in background.js. Now I need to update the caller `PromptTemplates.AUTO_DRAFT_BATCH[...](...)`
code = code.replace(/args\.bio, args\.persona, args\.memory, args\.playbook, args\.leadAsset, args\.reportContext, args\.langConstraint, args\.uniquenessConstraint, args\.randomSeed/g, 'args.langConstraint, args.uniquenessConstraint, args.randomSeed');

fs.writeFileSync('prompts_i18n.js', code);

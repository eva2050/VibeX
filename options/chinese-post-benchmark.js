const $ = id => document.getElementById(id);
const send = message => chrome.runtime.sendMessage(message);
let running = false;

function render(state) {
  if (!state) { $('benchmark-progress').textContent = '尚未开始'; return; }
  const completed = Object.values(state.fixtures || {}).filter(item => (item.judgments || []).length === 2).length;
  $('benchmark-progress').textContent = `状态：${state.status}｜已完成 ${completed}/24｜Skill ${state.skillId}@${state.skillVersion}`;
  const reviewReady = state.status === 'review_ready';
  $('benchmark-review').classList.toggle('hidden', !reviewReady);
  if (reviewReady) {
    $('benchmark-review-list').replaceChildren(...state.reviewFixtureIds.map((id, index) => {
      const div = document.createElement('div'); div.className = 'item';
      div.textContent = `${index + 1}. ${state.fixtures[id]?.skill?.text || ''}`; return div;
    }));
  }
  if (state.report) {
    $('benchmark-report').classList.remove('hidden');
    $('benchmark-report').innerHTML = `<h2>结果</h2><dl><dt>Skill 胜率</dt><dd>${Math.round(state.report.winRate * 1000) / 10}%</dd><dt>非平局</dt><dd>${state.report.decisiveCount}/24</dd><dt>用户评分</dt><dd>${state.report.userScore ?? '未评分'}</dd><dt>发布决定</dt><dd>${state.report.releaseDecision.status === 'release' ? '通过，仅开启 Studio' : '暂缓，继续优化'}</dd></dl>`;
  }
}

async function refresh() { const result = await send({ action: 'getChinesePostBenchmark' }); render(result.state); return result.state; }
async function run() {
  if (running) return; running = true;
  try { let state = await refresh(); while (state?.status === 'running') { const result = await send({ action: 'runNextChinesePostBenchmarkStep' }); if (!result.success) throw new Error(result.error); state = result.state; render(state); } }
  catch (error) { $('benchmark-progress').textContent += `｜已暂停：${error.message}`; }
  finally { running = false; }
}

$('benchmark-start').onclick = async () => { const result = await send({ action: 'startChinesePostBenchmark' }); if (!result.success) return render({ status: result.error, fixtures: {} }); render(result.state); run(); };
$('benchmark-continue').onclick = run;
$('benchmark-reset').onclick = async () => { await send({ action: 'resetChinesePostBenchmark' }); render(null); };
$('benchmark-submit-review').onclick = async () => { const result = await send({ action: 'submitChinesePostBenchmarkReview', feedback: $('benchmark-feedback').value }); if (result.success) render(result.state); };
refresh();

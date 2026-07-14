const DATAHUB_API_KEY = process.env.DATAHUB_API_KEY || '';
const url = "https://www.zhihu.com/question/2041447752677200286";

async function run() {
  if (!DATAHUB_API_KEY) {
    console.error('Set DATAHUB_API_KEY before running this script.');
    return;
  }
  const res = await fetch('https://datahub.codes/api/datahub/execute/v0', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': DATAHUB_API_KEY },
    body: JSON.stringify({ query: `提取内容：${url}`, channel: 'ChipStar' })
  });
  const data = await res.json();
  const processId = data.processId || data.id || (data.data && data.data.processId);
  
  for(let i=0; i<30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollRes = await fetch(`https://datahub.codes/api/processes/${encodeURIComponent(processId)}.md`, {
      headers: { 'X-API-Key': DATAHUB_API_KEY }
    });
    const text = await pollRes.text();
    if (text.includes('此过程文件为最终版本') || text.includes('执行完成') || text.includes('提取的内容')) {
      console.log('--- CONTENT START ---');
      console.log(text.substring(0, 1500));
      console.log('--- CONTENT END ---');
      break;
    }
  }
}
run();

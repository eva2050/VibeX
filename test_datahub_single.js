const DATAHUB_API_KEY = process.env.DATAHUB_API_KEY || '';
const url = "https://www.zhihu.com/question/2041447752677200286";

async function testUrl(url) {
  if (!DATAHUB_API_KEY) {
    console.error('Set DATAHUB_API_KEY before running this script.');
    return;
  }
  try {
    const res = await fetch('https://datahub.codes/api/datahub/execute/v0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': DATAHUB_API_KEY },
      body: JSON.stringify({ query: `提取内容：${url}`, channel: 'ChipStar' })
    });
    const data = await res.json();
    console.log(`[POST] execute/v0 -> Status: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));

    const processId = data.processId || data.id || (data.data && data.data.processId);
    if (!processId) {
      console.log("No processId found!");
      return;
    }

    console.log(`[POLL] Starting poll for processId: ${processId}...`);
    let attempts = 0;
    while(attempts < 10) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
      const pollRes = await fetch(`https://datahub.codes/api/processes/${encodeURIComponent(processId)}.md`, {
        headers: { 'X-API-Key': DATAHUB_API_KEY }
      });
      console.log(`[POLL ${attempts}] Status: ${pollRes.status}`);
      if (pollRes.status === 200) {
         console.log(await pollRes.text());
         return;
      }
    }
  } catch (e) {
    console.error(`[TEST] ${url} Error:`, e.message);
  }
}

testUrl(url);

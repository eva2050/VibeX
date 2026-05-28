const DATAHUB_API_KEY = "zUBzC9YgT9f8VLrh";
const urls = [
  "https://zhuanlan.zhihu.com/p/698889953",
  "https://mp.weixin.qq.com/s/9nQO0yU9J_W3m1sF4V0Gqg",
  "https://www.bilibili.com/video/BV1GJ411x7h7",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.xiaohongshu.com/explore/648b26120000000013010b93"
];

async function testUrl(url) {
  try {
    const res = await fetch('https://datahub.codes/api/datahub/execute/v0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': DATAHUB_API_KEY },
      body: JSON.stringify({ query: `提取内容：${url}`, channel: 'ChipStar' })
    });
    const data = await res.json();
    console.log(`[TEST] ${url}: ${res.status} - success: ${data.success}`);
  } catch (e) {
    console.error(`[TEST] ${url} Error:`, e.message);
  }
}

async function run() {
  for (const url of urls) {
    await testUrl(url);
  }
}
run();

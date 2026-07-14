import assert from 'node:assert/strict';
import fs from 'node:fs';

const xApiSource = fs.readFileSync(new URL('./services/xApi.js', import.meta.url), 'utf8');
const uiHandlerSource = fs.readFileSync(new URL('./handlers/uiHandler.js', import.meta.url), 'utf8');
const scraperSource = fs.readFileSync(new URL('./content/x_scraper.js', import.meta.url), 'utf8');

assert.match(
  xApiSource,
  /const user = await getXMe\(auth\);[\s\S]*return \{[\s\S]*\.\.\.auth,[\s\S]*user[\s\S]*\};/,
  'OAuth connection must validate the token and return the connected X user'
);

assert.doesNotMatch(
  uiHandlerSource.slice(
    uiHandlerSource.indexOf('if (request.action === "extractBio"'),
    uiHandlerSource.indexOf('} else if (request.action === "collectTweet"')
  ),
  /storage\.onChanged/,
  'profile reads must not complete from an unrelated global storage update'
);

assert.match(uiHandlerSource, /action: 'readProfileSnapshot'/);
assert.match(scraperSource, /request\.action === 'readProfileSnapshot'/);

console.log('review fix regression checks passed');

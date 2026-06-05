import { JSDOM } from 'jsdom';
import fs from 'fs';
const html = fs.readFileSync('./options/options.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously" });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.chrome = {
  storage: {
    local: {
      get: (keys, cb) => cb({}),
      set: (obj, cb) => { if(cb) cb(); },
      onChanged: { addListener: () => {} }
    }
  },
  runtime: {
    connect: () => ({ onMessage: { addListener: () => {} } }),
    onMessage: { addListener: () => {} }
  }
};
global.lucide = { createIcons: () => {} };

import('./options/options.js').then(m => {
  console.log("Loaded without top-level errors");
  // trigger DOMContentLoaded
  const event = document.createEvent('Event');
  event.initEvent('DOMContentLoaded', true, true);
  document.dispatchEvent(event);
  setTimeout(() => console.log("Done testing init"), 1000);
}).catch(e => {
  console.error("Error loading options.js:", e);
});

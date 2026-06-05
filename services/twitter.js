async function performTrustedClick(tabId, x, y) {
  if (!tabId) throw new Error('缺少目标标签页');

  const clickX = Math.round(Number(x));
  const clickY = Math.round(Number(y));
  if (!Number.isFinite(clickX) || !Number.isFinite(clickY)) {
    throw new Error('点击坐标无效');
  }

  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: (clientX, clientY) => {
      let el = document.elementFromPoint(clientX, clientY);
      if (el) {
        const btn = el.closest('button, [role="button"]');
        if (btn) el = btn;
        
        // 1. Bypass React isTrusted checks by invoking onClick directly (Holy Grail for Twitter bots)
        try {
          const key = Object.keys(el).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
          if (key && el[key] && typeof el[key].onClick === 'function') {
            el[key].onClick({
              isTrusted: true,
              type: 'click',
              preventDefault: () => {},
              stopPropagation: () => {},
              currentTarget: el,
              target: el,
              nativeEvent: new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY })
            });
            console.log("X Auto Bot: Injected React onClick successfully!");
            // return; // We still do the fallback just in case the React handler expects DOM events to bubble
          }
        } catch(e) {}
        
        // 2. Standard DOM Fallback
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX, clientY }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX, clientY }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX, clientY }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX, clientY }));
        if (typeof el.click === 'function') {
          el.click();
        }
      }
    },
    args: [clickX, clickY]
  });
}
export { performTrustedClick };

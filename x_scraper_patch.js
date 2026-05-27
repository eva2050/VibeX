function handleDirectReply(tweetData, article) {
  const nativeReply = article.querySelector('[data-testid="reply"]');
  if (nativeReply) {
    nativeReply.click();
  }

  let editorFound = false;
  const showLoader = setInterval(() => {
    const editor = document.querySelector('div[data-testid="tweetTextarea_0"]');
    if (editor) {
      clearInterval(showLoader);
      editorFound = true;
      editor.focus();
      document.execCommand('insertText', false, '✨ 正在生成高赞回复...');
    }
  }, 100);
  setTimeout(() => clearInterval(showLoader), 2000);

  chrome.runtime.sendMessage({
    action: 'magicPrompt',
    promptType: 'autoReply',
    contextData: tweetData
  }, (res) => {
    if (chrome.runtime.lastError || !res || res.error) {
      showToast('❌ 生成失败: ' + (chrome.runtime.lastError?.message || res?.error), 'error');
      return;
    }
    
    // Wait slightly to ensure editor is ready if API was too fast
    setTimeout(() => {
      const editor = document.querySelector('div[data-testid="tweetTextarea_0"]');
      if (editor) {
        editor.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, res.result);
      }
    }, 300);
  });
}

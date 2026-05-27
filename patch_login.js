const fs = require('fs');

let html = fs.readFileSync('options/options.html', 'utf8');

const loginHTML = `
  <!-- Login Overlay -->
  <div id="view-login" class="login-overlay active">
    <div class="login-card">
      <div class="login-logo">
        <i data-lucide="sparkles" width="48" height="48" style="color: var(--primary-color);"></i>
      </div>
      <h2>欢迎使用 Vibe-X</h2>
      <p>你的智能内容引擎</p>
      
      <button id="btn-google-login" class="magic-btn primary" style="width: 100%; margin-top: 32px; justify-content: center; height: 48px; border-radius: 12px; font-size: 16px;">
        <i data-lucide="chrome" width="20" height="20" style="margin-right: 8px;"></i> 使用 Google 账号登录
      </button>
      
      <button id="btn-x-login" class="magic-btn outline" style="width: 100%; margin-top: 16px; justify-content: center; height: 48px; border-radius: 12px; font-size: 16px;">
        <i data-lucide="twitter" width="20" height="20" style="margin-right: 8px;"></i> 使用 X 账号登录
      </button>
    </div>
  </div>
`;

if (!html.includes('id="view-login"')) {
  html = html.replace('<body>', '<body>\n' + loginHTML);
  fs.writeFileSync('options/options.html', html);
}

let css = fs.readFileSync('options/options.css', 'utf8');
const loginCSS = `
/* Login Overlay */
.login-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-color);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.login-overlay.active {
  opacity: 1;
  pointer-events: auto;
}
.login-card {
  background: #FFFFFF;
  border-radius: 24px;
  padding: 48px 40px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.08);
  text-align: center;
  border: 1px solid var(--border-color);
}
.login-logo {
  width: 80px;
  height: 80px;
  background: rgba(0, 122, 255, 0.1);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px auto;
}
.login-card h2 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text-main);
}
.login-card p {
  color: var(--text-sub);
  font-size: 15px;
}
`;

if (!css.includes('.login-overlay')) {
  fs.writeFileSync('options/options.css', css + '\n' + loginCSS);
}

let js = fs.readFileSync('options/options.js', 'utf8');

const loginJS = `
// ==========================================
// LOGIN LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const loginOverlay = document.getElementById('view-login');
  const btnGoogle = document.getElementById('btn-google-login');
  const btnX = document.getElementById('btn-x-login');

  // Check login state
  chrome.storage.local.get(['isLoggedIn'], (res) => {
    if (res.isLoggedIn) {
      loginOverlay.classList.remove('active');
    }
  });

  const handleLogin = (provider) => {
    const btn = provider === 'google' ? btnGoogle : btnX;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 登录中...';
    lucide.createIcons();
    
    // Mock login flow
    setTimeout(() => {
      chrome.storage.local.set({ isLoggedIn: true }, () => {
        loginOverlay.classList.remove('active');
        btn.innerHTML = originalText;
        lucide.createIcons();
      });
    }, 1500);
  };

  if (btnGoogle) btnGoogle.addEventListener('click', () => handleLogin('google'));
  if (btnX) btnX.addEventListener('click', () => handleLogin('x'));
});
`;

if (!js.includes('LOGIN LOGIC')) {
  fs.writeFileSync('options/options.js', js + '\n' + loginJS);
}

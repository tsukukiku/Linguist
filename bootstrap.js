(async () => {
  const api = window.LINGUIST_API_ORIGIN;
  const notice = document.createElement('div');
  notice.id = 'loginNotice';
  notice.className = 'login-notice';
  notice.innerHTML = '<strong>教材を読み込み中です</strong><p>しばらくお待ちください。</p><a id="loginLink" href="#">ログインして学習する →</a>';
  notice.classList.add('visible');
  document.body.append(notice);
  document.getElementById('loginLink').href = `${api}/auth?return=${encodeURIComponent(location.href)}`;

  try {
    const response = await fetch(`${api}/api/lessons`, {credentials: 'include', cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const lessons = await response.json();
    if (!lessons?.['1']?.lines || !lessons?.['16']?.lines) throw new Error('教材データを確認できません');
    window.LESSONS = lessons;
    const script = document.createElement('script');
    script.src = 'app.js';
    script.onload = () => notice.remove();
    script.onerror = () => {notice.querySelector('strong').textContent = '画面の読み込みに失敗しました';};
    document.body.append(script);
  } catch {
    notice.querySelector('strong').textContent = '学習するにはログインしてください';
    notice.querySelector('p').textContent = '許可されたメールアドレスで認証すると、教材と音声を読み込みます。';
  }
})();


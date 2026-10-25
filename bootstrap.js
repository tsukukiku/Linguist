(async () => {
  const api = window.LINGUIST_API_ORIGIN;
  const notice = document.createElement('div');
  notice.id = 'loginNotice';
  notice.className = 'login-notice visible';
  notice.setAttribute('role', 'dialog');
  notice.innerHTML = '<strong>教材を読み込み中です</strong><p>しばらくお待ちください。</p>';
  document.body.append(notice);

  window.promptLessonLogin = number => {
    const target = new URL(location.href);
    target.searchParams.set('lesson', String(number));
    const login = `${api}/auth?return=${encodeURIComponent(target.href)}`;
    notice.innerHTML = `<strong>第${number}課からログインが必要です</strong><p>許可されたメールアドレスで認証すると、本文と音声を利用できます。</p><a href="${login}">メールでログイン →</a><button type="button" id="continueSample">第1課に戻る</button>`;
    notice.dataset.locked = '1';
    notice.classList.add('visible');
    document.getElementById('continueSample').addEventListener('click', () => {
      delete notice.dataset.locked;
      notice.classList.remove('visible');
    });
  };

  try {
    let response;
    try {
      response = await fetch(`${api}/api/lessons`, {credentials: 'include', cache: 'no-store', redirect: 'manual'});
    } catch { /* Access redirects anonymous browsers; show the public sample. */ }
    if (response?.ok) {
      const all = await response.json();
      if (all?.['1']?.lines?.length && all?.['16']?.lines?.length) {
        window.LESSONS = all;
        window.HAS_PRIVATE_LESSONS = true;
      }
    }
    if (!window.HAS_PRIVATE_LESSONS) {
      const sample = await fetch('sample/lesson1.json', {cache: 'no-store'});
      if (!sample.ok) throw new Error(`Sample HTTP ${sample.status}`);
      window.LESSONS = await sample.json();
      if (!window.LESSONS?.['1']?.lines?.length || window.LESSONS?.['2']?.lines?.length) throw new Error('Invalid sample');
    }
    const script = document.createElement('script');
    script.src = 'app.js';
    script.onload = () => {if (!notice.dataset.locked) notice.classList.remove('visible');};
    script.onerror = () => {notice.querySelector('strong').textContent = '画面の読み込みに失敗しました';};
    document.body.append(script);
  } catch {
    notice.innerHTML = '<strong>教材を読み込めませんでした</strong><p>ページを更新して、もう一度お試しください。</p>';
  }
})();


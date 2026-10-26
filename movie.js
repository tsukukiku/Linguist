(async () => {
  const api = window.LINGUIST_API_ORIGIN;
  const $ = id => document.getElementById(id);
  const grid = $('lessonGrid');
  const panel = $('lessonPanel');
  const status = $('status');
  const title = $('lessonTitle');
  const meta = $('lessonMeta');
  const notice = $('lessonNotice');
  const loginActions = $('loginActions');
  const body = $('lessonBody');
  const scenarioText = $('scenarioText');
  const draftNotice = $('draftNotice');
  const bookImage = $('bookImage');
  const openBook = $('openBook');
  const bookHint = $('bookHint');
  const pageNumber = $('pageNumber');
  const sectionTitle = $('sectionTitle');
  const sectionDescription = $('sectionDescription');
  const scenarioAudio = $('scenarioAudio');
  const lessonAudio = $('lessonAudio');
  const tabs = [...document.querySelectorAll('[data-section]')];
  const getJson = async url => {
    const response = await fetch(url, {credentials: 'include', cache: 'no-store'});
    if (!response.ok) throw Error(String(response.status));
    return response.json();
  };

  let index, sample, privateLessons = null, currentLesson = 1, currentSection = 'scenario';
  let pageObjectUrl = null, pageRequest = 0, currentPage = 1;
  try {
    [index, sample] = await Promise.all([getJson('sample/movie-index.json'), getJson('sample/movie-lesson1.json')]);
  } catch {
    status.textContent = '课程目录载入失败，请刷新页面。';
    return;
  }
  try { privateLessons = await getJson(`${api}/api/movie/lessons`); } catch { /* Login is offered below. */ }
  status.textContent = privateLessons ? '已登录 · 32 课可选' : '第 1 课可直接试学 · 第 2–32 课需邮箱登录';

  const sections = {
    scenario: {title: '1 · シナリオ', description: '先播放日语シナリオ录音，再跟着日文对白阅读。右侧是原书扫描；LRC 时间尚未精修。', page: 1},
    dialogue: {title: '2 · 对话', description: '原书的日文师生对话在右侧扫描页中。请放大阅读，边听教材附加录音边核对；这一部分尚未逐字数字化。', page: 3},
    notes: {title: '3 · 解说', description: '原书对词语与表达的解说在右侧扫描页中；请向下滚动查阅。OCR 未经校对，因此先以扫描版为准。', page: 7},
    translation: {title: '4 · 翻译', description: '原书的中文翻译在右侧扫描页中。先试着自己理解日文，再用译文核对。', page: 10}
  };

  function revokePage() {
    bookImage.removeAttribute('src');
    if (pageObjectUrl) URL.revokeObjectURL(pageObjectUrl);
    pageObjectUrl = null;
  }

  async function loadPage(n, page) {
    const request = ++pageRequest;
    revokePage();
    const stem = `第${String(n).padStart(2, '0')}课`;
    const imageName = `page-${String(page).padStart(2, '0')}.jpg`;
    const source = n === 1 ? `sample/movie-pages/${stem}/${imageName}` : `${api}/api/movie/page/${n}/${page}`;
    currentPage = page;
    const lesson = index[n - 1];
    const pageCount = lesson.printedEnd - lesson.printedStart + 1;
    pageNumber.textContent = `${page} / ${pageCount}`;
    $('previousPage').disabled = page <= 1;
    $('nextPage').disabled = page >= pageCount;
    bookHint.textContent = '正在载入本课扫描页…';
    try {
      const response = await fetch(source, {credentials: 'include', cache: 'no-store'});
      if (!response.ok || !response.headers.get('content-type')?.includes('image/jpeg')) throw Error('Page unavailable');
      const blob = await response.blob();
      if (request !== pageRequest) return;
      pageObjectUrl = URL.createObjectURL(blob);
      bookImage.src = pageObjectUrl;
      bookImage.alt = `第 ${n} 课原书第 ${lesson.printedStart + page - 1} 页`;
      bookHint.textContent = `原书第 ${lesson.printedStart + page - 1} 页。可用上／下一页翻阅本课扫描件。`;
    } catch {
      if (request === pageRequest) bookHint.textContent = '扫描页暂时无法载入；可点击“打开本课 PDF”查看。';
    }
  }

  function showBookPage() {
    const lesson = index[currentLesson - 1];
    const pageCount = lesson.printedEnd - lesson.printedStart + 1;
    const page = Math.min(sections[currentSection].page, pageCount);
    loadPage(currentLesson, page);
  }

  function selectSection(section) {
    currentSection = section;
    tabs.forEach(tab => {
      const active = tab.dataset.section === section;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    sectionTitle.textContent = sections[section].title;
    sectionDescription.textContent = sections[section].description;
    scenarioText.hidden = section !== 'scenario';
    draftNotice.hidden = section !== 'scenario';
    showBookPage();
  }

  function openLesson(n, shouldScroll = true) {
    const lesson = index[n - 1];
    if (!lesson) return;
    currentLesson = n;
    panel.hidden = false;
    title.textContent = `第 ${n} 课 · ${lesson.title}／${lesson.titleZh}`;
    meta.textContent = `原书第 ${lesson.printedStart}–${lesson.printedEnd} 页`;
    $('previousLesson').disabled = n === 1;
    $('nextLesson').disabled = n === 32;
    grid.querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-current', i + 1 === n ? 'true' : 'false'));
    loginActions.replaceChildren();
    scenarioAudio.pause(); lessonAudio.pause();
    scenarioAudio.removeAttribute('src'); lessonAudio.removeAttribute('src');
    const data = n === 1 ? sample : privateLessons?.[String(n)];
    const allowed = Boolean(data?.scene);
    body.hidden = !allowed;
    notice.hidden = allowed;
    if (!allowed) {
      ++pageRequest; revokePage();
      notice.textContent = '第 2 课以后需要使用邮箱登录，才能查看课文、原书扫描页并播放录音。';
      const login = document.createElement('a');
      const back = new URL(location.href); back.searchParams.set('lesson', String(n));
      login.href = `${api}/auth?return=${encodeURIComponent(back.href)}`;
      login.className = 'button'; login.textContent = '使用邮箱登录';
      loginActions.append(login);
    } else {
      scenarioText.textContent = data.scene;
      draftNotice.textContent = n === 1 ? '第 1 课シナリオ已初步对照扫描页；时间码尚未精修。' : '第 2–32 课是 OCR 草稿，可能有错字和碎句；请以右侧扫描页为准。';
      $('scenarioTrack').textContent = `原始音轨 ${String(n * 2 - 1).padStart(2, '0')}.mp3`;
      $('lessonTrack').textContent = `原始音轨 ${String(n * 2).padStart(2, '0')}.mp3`;
      scenarioAudio.src = n === 1 ? 'sample/movie-scenario1.mp3' : `${api}/api/movie/audio/${n}/scenario`;
      lessonAudio.src = n === 1 ? 'sample/movie-lesson-audio1.mp3' : `${api}/api/movie/audio/${n}/lesson`;
      openBook.href = n === 1 ? 'sample/movie-book1.pdf' : `${api}/api/movie/book/${n}`;
      selectSection(currentSection);
    }
    history.replaceState(null, '', `?lesson=${n}`);
    if (shouldScroll) panel.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  index.forEach((lesson, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    const name = document.createElement('strong');
    const subtitle = document.createElement('span');
    name.textContent = `第 ${lesson.number} 课`;
    subtitle.textContent = `${lesson.title}／${lesson.titleZh}`;
    button.append(name, subtitle);
    button.addEventListener('click', () => openLesson(i + 1));
    grid.append(button);
  });
  tabs.forEach(tab => tab.addEventListener('click', () => selectSection(tab.dataset.section)));
  $('previousPage').addEventListener('click', () => loadPage(currentLesson, currentPage - 1));
  $('nextPage').addEventListener('click', () => loadPage(currentLesson, currentPage + 1));
  $('previousLesson').addEventListener('click', () => openLesson(currentLesson - 1));
  $('nextLesson').addEventListener('click', () => openLesson(currentLesson + 1));
  const requested = Number(new URLSearchParams(location.search).get('lesson'));
  openLesson(Number.isInteger(requested) && requested >= 1 && requested <= 32 ? requested : 1, false);
})();

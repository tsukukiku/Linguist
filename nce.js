const NCE_BOOK = document.body.dataset.book || "III";
    const NCE_API = window.LINGUIST_API_ORIGIN || "https://linguist-api.star-style-studio.net";
    const nceLogin = document.getElementById("nceLogin");
    nceLogin.href = `${NCE_API}/auth?return=${encodeURIComponent(location.href)}`;
    const state = {
      lesson: 1,
      courseKey: `${NCE_BOOK}-01`,
      rawText: "",
      sourceText: "",
      lessonMeta: { lessonLine: "", englishTitle: "", chineseTitle: "", wordsText: "", translationText: "" },
      paragraphs: [],
      lrc: [],
      lrcRepeat: {
        active: false,
        index: 0,
        count: 0,
        max: 3
      },
      gameAudioLoop: {
        active: false,
        index: 0,
        startTime: 0,
        endTime: 0
      },
      suppressLrcScrollOnce: false,
      currentParagraph: 0,
      currentSentence: 0,
      mode: "full",
      passed: new Set(),
      game: {
        active: false,
        pass: 1,
        wordIndex: 0,
        words: [],
        revealed: []
      }
    };

    const sampleText = `The sun is rising over the quiet town. Birds are singing in the trees. Tom opens his window and takes a deep breath.

Today is his first day at a new school. He feels nervous, but he also feels excited. His mother smiles and says, "Be brave and be kind."

At the school gate, Tom meets a boy named Jack. Jack says hello and shows him the classroom. Soon Tom knows that a new place can become familiar step by step.`;

    const sampleLrc = `[00:00.00]The sun is rising over the quiet town.
[00:04.00]Birds are singing in the trees.
[00:08.00]Tom opens his window and takes a deep breath.
[00:13.00]Today is his first day at a new school.
[00:18.00]He feels nervous, but he also feels excited.
[00:23.00]His mother smiles and says, "Be brave and be kind."
[00:29.00]At the school gate, Tom meets a boy named Jack.
[00:35.00]Jack says hello and shows him the classroom.
[00:40.00]Soon Tom knows that a new place can become familiar step by step.`;

    const $ = (id) => document.getElementById(id);
    const progressStorageKey = NCE_BOOK === "III" ? "reciteStudyProgressV1" : `reciteStudyProgressV1-${NCE_BOOK}`;

    function showToast(message) {
      const toast = $("toast");
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
    }

    function readStudyProgress() {
      try {
        return JSON.parse(localStorage.getItem(progressStorageKey) || "null");
      } catch (error) {
        return null;
      }
    }

    function getActiveSpeed() {
      const activeSpeed = document.querySelector(".speed-btn.active[data-speed]");
      const rate = activeSpeed ? Number(activeSpeed.dataset.speed) : $("audio").playbackRate || 1;
      return Number.isFinite(rate) ? rate : 1;
    }

    function saveStudyProgress() {
      if (!state.courseKey || !state.paragraphs.length) return;
      const progress = {
        courseKey: state.courseKey,
        lesson: state.lesson,
        currentParagraph: state.currentParagraph,
        currentSentence: state.currentSentence,
        mode: state.mode,
        speed: getActiveSpeed(),
        passed: [...state.passed],
        updatedAt: Date.now()
      };
      try {
        localStorage.setItem(progressStorageKey, JSON.stringify(progress));
      } catch (error) {}
    }

    function applyModeButtonState() {
      document.querySelectorAll(".mode-btn[data-mode]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === state.mode);
      });
      const gameBtn = $("gameModeBtn");
      if (gameBtn) gameBtn.classList.remove("active");
    }

    function applySpeed(rate) {
      const speed = Number(rate);
      if (!Number.isFinite(speed)) return;
      $("audio").playbackRate = speed;
      document.querySelectorAll(".speed-btn[data-speed]").forEach(btn => {
        btn.classList.toggle("active", Number(btn.dataset.speed) === speed);
      });
    }

    function applyStudyProgress(progress) {
      if (!progress || progress.courseKey !== state.courseKey || !state.paragraphs.length) return false;
      const paragraphIndex = Math.min(
        Math.max(0, Number(progress.currentParagraph) || 0),
        state.paragraphs.length - 1
      );
      const sentenceMax = Math.max(0, state.paragraphs[paragraphIndex].sentences.length - 1);
      state.currentParagraph = paragraphIndex;
      state.currentSentence = Math.min(Math.max(0, Number(progress.currentSentence) || 0), sentenceMax);
      if (["full", "half", "initial"].includes(progress.mode)) state.mode = progress.mode;
      state.passed.clear();
      if (Array.isArray(progress.passed)) {
        progress.passed.forEach(key => {
          if (/^\d+-\d+$/.test(String(key))) state.passed.add(String(key));
        });
      }
      applyModeButtonState();
      applySpeed(progress.speed);
      return true;
    }

    function uniqueList(items) {
      return [...new Set(items.filter(Boolean))];
    }

    function parseCourseInput(value) {
      const raw = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
      const prefixed = raw.match(/^([IVX]+)[-_]?(\d{1,3})$/);
      const numeric = raw.match(/^(\d{1,3})$/);
      const book = NCE_BOOK;
      const lessonToken = prefixed ? prefixed[2] : numeric ? numeric[1] : String(state.lesson || 1);
      const lessonNumber = Math.max(1, Math.min(999, Number(lessonToken) || 45));
      const plainKey = `${book}-${lessonNumber}`;
      const paddedKey = `${book}-${String(lessonNumber).padStart(2, "0")}`;
      const typedKey = `${book}-${lessonToken}`;
      return {
        book,
        lessonNumber,
        inputValue: typedKey,
        fileKeys: uniqueList([typedKey, plainKey, paddedKey])
      };
    }

    async function selectLesson(value, options = {}) {
      const course = parseCourseInput(value);
      state.lesson = course.lessonNumber;
      state.courseKey = course.inputValue;
      $("lessonNumber").value = course.inputValue;
      $("lessonTitle").textContent = `Lesson ${course.lessonNumber}`;
      $("lessonSub").textContent = "正在调取课文、音频和LRC";
      await tryLoadLessonFiles(course, options);
    }

    async function tryLoadLessonFiles(course, options = {}) {
      let loaded = false;
      state.lrc = [];
      renderLrc();
      try {
        const textResult = await fetchFirstTextEncoded([`${NCE_API}/api/nce/${course.book}/txt/${course.lessonNumber}`]);
        const text = textResult.text;
        if (text.trim()) {
          const parsed = parseNce3Text(text);
          $("textInput").value = parsed.body;
          const restoreProgress = options.restoreProgress && options.restoreProgress.courseKey === course.inputValue
            ? options.restoreProgress
            : null;
          loadText(parsed.body, parsed, { restoreProgress, skipSave: Boolean(restoreProgress) });
          loaded = true;
        }
      } catch (error) {}

      try {
        const lrcResult = await fetchFirstTextEncoded([`${NCE_API}/api/nce/${course.book}/lrc/${course.lessonNumber}`]);
        const lrc = lrcResult.text;
        state.lrc = parseLrc(lrc);
        renderLrc();
        loaded = true;
      } catch (error) {}

      const audio = $("audio");
      audio.crossOrigin = "use-credentials";
      audio.src = `${NCE_API}/api/nce/${course.book}/audio/${course.lessonNumber}`;
      audio.load();
      $("lessonSub").textContent = loaded
        ? `已载入 Lesson ${course.lessonNumber} 的课文、音频或LRC`
        : NCE_BOOK === "III" ? "请登录后读取 NAS 教材；若已登录，请确认教材已上传。" : "本册教材尚未上传 NAS，可从设置导入本地文件。";
      document.getElementById("nceAccess").hidden = loaded || NCE_BOOK !== "III";
      if (!loaded) {
        $("textInput").value = "";
        state.paragraphs = [];
        $("reader").textContent = "此课程尚无可显示的课文。";
      }
    }

    async function fetchFirstTextEncoded(paths) {
      let lastError = null;
      for (const path of paths) {
        try {
          return { text: await fetchTextEncoded(path), path };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("not found");
    }

    async function fetchTextEncoded(path) {
      const response = await fetch(path, { cache: "no-store", credentials: "include", redirect: "manual" });
      if (!response.ok) throw new Error("not found");
      const buffer = await response.arrayBuffer();
      try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
      catch { return new TextDecoder("gb18030").decode(buffer); }
    }

    function parseNce3Text(text) {
      const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const lines = normalized.split("\n");
      const meaningful = lines.map(line => line.trim()).filter(Boolean);
      const newWordsIndex = lines.findIndex(line => /New\s+words\s+and\s+expressions/i.test(line));
      const translationIndex = lines.findIndex(line => /参考译文|譯文|译文|蜿り/.test(line));
      const beforeWordsRaw = newWordsIndex >= 0 ? lines.slice(0, newWordsIndex) : lines;
      const wordsLines = newWordsIndex >= 0
        ? lines.slice(newWordsIndex, translationIndex > newWordsIndex ? translationIndex : lines.length)
        : [];
      const translationLines = translationIndex >= 0 ? lines.slice(translationIndex + 1) : [];
      const beforeWords = beforeWordsRaw.map(line => line.trim());
      const headerLines = beforeWords.filter(Boolean).slice(0, 3);
      const headerEnd = beforeWords.findIndex(line => line === headerLines[2]);
      const bodyLines = beforeWordsRaw
        .slice(headerEnd >= 0 ? headerEnd + 1 : 3)
        .map(line => line.trim())
        .filter(Boolean);
      const body = bodyLines.join("\n").trim();
      return {
        fullText: normalized,
        lessonLine: headerLines[0] || meaningful[0] || "",
        englishTitle: headerLines[1] || "",
        chineseTitle: headerLines[2] || "",
        wordsText: wordsLines.map(line => line.trim()).filter(Boolean).join("\n"),
        translationText: translationLines.map(line => line.trim()).filter(Boolean).join("\n"),
        body: body || beforeWords.filter(Boolean).slice(3).join("\n").trim()
      };
    }

    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }

    function readFileEncoded(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const buffer = reader.result;
          try { resolve(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); }
          catch { resolve(new TextDecoder("gb18030").decode(buffer)); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    }

    function splitParagraphs(text) {
      let paragraphs = text
        .replace(/\r\n/g, "\n")
        .split(/\n\s*\n+/)
        .map(p => p.trim())
        .filter(Boolean);
      if (paragraphs.length <= 1 && /\n/.test(text)) {
        paragraphs = text
          .replace(/\r\n/g, "\n")
          .split(/\n+/)
          .map(p => p.trim())
          .filter(Boolean);
      }
      return paragraphs.map((paragraph, pIndex) => ({
          index: pIndex,
          text: paragraph,
          sentences: splitSentences(paragraph)
        }))
        .filter(p => p.sentences.length);
    }

    function splitSentences(paragraph) {
      const parts = paragraph
        .replace(/\s+/g, " ")
        .match(/[^.!?。！？]+[.!?。！？"']*|[^.!?。！？]+$/g);
      return (parts || [paragraph]).map(s => s.trim()).filter(Boolean);
    }

    function loadText(text, meta = null, options = {}) {
      state.rawText = text.trim();
      state.sourceText = meta?.fullText || text;
      if (meta) {
        state.lessonMeta = {
          lessonLine: meta.lessonLine || "",
          englishTitle: meta.englishTitle || "",
          chineseTitle: meta.chineseTitle || "",
          wordsText: meta.wordsText || "",
          translationText: meta.translationText || ""
        };
      } else {
        state.lessonMeta = { lessonLine: "", englishTitle: "", chineseTitle: "", wordsText: "", translationText: "" };
      }
      state.paragraphs = splitParagraphs(state.rawText);
      state.currentParagraph = 0;
      state.currentSentence = 0;
      state.passed.clear();
      state.game.active = false;
      state.lrcRepeat.active = false;
      if (!state.paragraphs.length) {
        showToast("没有识别到有效课文");
        return;
      }
      if (state.lessonMeta.englishTitle) {
        $("lessonTitle").textContent = `${state.lessonMeta.lessonLine || `Lesson ${state.lesson}`} · ${state.lessonMeta.englishTitle}`;
        $("lessonSub").textContent = state.lessonMeta.chineseTitle || "已提取英文正文用于背诵";
      }
      applyStudyProgress(options.restoreProgress);
      renderAll();
      if (!options.skipSave) saveStudyProgress();
      showToast("课文已载入");
    }

    function parseLrc(text) {
      const lines = text.split(/\r?\n/);
      const result = [];
      const timeReg = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
      lines.forEach(line => {
        const content = line.replace(timeReg, "").trim();
        let match;
        while ((match = timeReg.exec(line)) !== null) {
          const min = Number(match[1]);
          const sec = Number(match[2]);
          const ms = Number((match[3] || "0").padEnd(3, "0"));
          result.push({ time: min * 60 + sec + ms / 1000, text: content });
        }
      });
      return result.sort((a, b) => a.time - b.time);
    }

    function renderAll() {
      renderStats();
      renderParagraphTabs();
      renderSentenceTabs();
      renderReader();
      renderLrc();
      updateCurrentInfo();
      renderReferencePanels();
      renderGameIdle();
    }

    function renderReferencePanels() {
      $("wordsPanel").textContent = state.lessonMeta.wordsText || "本课没有识别到生词和短语。";
      $("translationPanel").textContent = state.lessonMeta.translationText || "本课没有识别到参考译文。";
    }

    function renderStats() {
      const totalSentences = state.paragraphs.reduce((sum, p) => sum + p.sentences.length, 0);
      $("sentenceCount").textContent = totalSentences;
      $("passCount").textContent = state.passed.size;
    }

    function renderParagraphTabs() {
      const box = $("paragraphTabs");
      box.innerHTML = "";
      state.paragraphs.forEach((paragraph, index) => {
        const btn = document.createElement("button");
        btn.className = "pill";
        btn.textContent = `第${index + 1}段`;
        btn.classList.toggle("active", index === state.currentParagraph);
        btn.addEventListener("click", () => {
          state.currentParagraph = index;
          state.currentSentence = 0;
          state.game.active = false;
          renderAll();
          syncAudioToCurrentSentence();
          saveStudyProgress();
        });
        box.appendChild(btn);
      });
    }

    function renderSentenceTabs() {
      const box = $("sentenceTabs");
      box.innerHTML = "";
      const paragraph = currentParagraph();
      if (!paragraph) return;
      paragraph.sentences.forEach((sentence, index) => {
        const btn = document.createElement("button");
        btn.className = "pill";
        btn.textContent = `句${index + 1}`;
        btn.classList.toggle("active", index === state.currentSentence);
        btn.addEventListener("click", () => {
          state.currentSentence = index;
          state.game.active = false;
          renderAll();
          syncAudioToCurrentSentence();
          saveStudyProgress();
        });
        box.appendChild(btn);
      });
    }

    function renderReader() {
      const reader = $("reader");
      const paragraph = currentParagraph();
      if (!paragraph) {
        reader.classList.add("empty-tip");
        reader.textContent = "请从左侧载入课文。";
        return;
      }
      reader.classList.remove("empty-tip");
      reader.innerHTML = paragraph.sentences.map((sentence, sIndex) => {
        const sentenceHtml = renderSentenceWords(sentence, state.mode, sIndex === state.currentSentence);
        return `<span class="sentence ${sIndex === state.currentSentence ? "current" : ""}" data-sentence="${sIndex}">${sentenceHtml}</span> `;
      }).join("");

      reader.querySelectorAll(".sentence").forEach(el => {
        el.addEventListener("click", (event) => {
          state.currentSentence = Number(el.dataset.sentence);
          if (event.target.classList.contains("word")) {
            event.target.classList.remove("hidden", "initial");
            event.target.classList.add("revealed");
            event.target.textContent = event.target.dataset.word;
          }
          updateCurrentInfo();
          renderSentenceTabs();
          syncAudioToCurrentSentence();
          saveStudyProgress();
        });
      });
    }

    function renderSentenceWords(sentence, mode, isCurrent) {
      return tokenize(sentence).map(token => {
        if (!token.isWord) return escapeHtml(token.text);
        let display = token.text;
        let cls = "word";
        if (mode === "half" && Math.random() < 0.5) {
          cls += " hidden";
        } else if (mode === "initial") {
          cls += " initial";
          display = token.text[0] + "_".repeat(Math.max(0, token.text.length - 1));
        }
        if (mode === "full") cls += " revealed";
        const title = isCurrent ? "当前句" : "";
        return `<span class="${cls}" data-word="${escapeAttr(token.text)}" title="${title}">${escapeHtml(display)}</span>`;
      }).join("");
    }

    function tokenize(sentence) {
      const tokens = [];
      const reg = /[A-Za-z]+(?:'[A-Za-z]+)?|[^A-Za-z]+/g;
      let match;
      while ((match = reg.exec(sentence)) !== null) {
        const text = match[0];
        tokens.push({ text, isWord: /^[A-Za-z]/.test(text) });
      }
      return tokens;
    }

    const uncoveredGameWords = new Set([
      "a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "from", "with",
      "as", "and", "or", "but"
    ]);

    function shouldKeepGameWordVisible(word) {
      return uncoveredGameWords.has(String(word || "").toLowerCase());
    }

    function maskGameWord(word) {
      const text = String(word || "");
      if (text.length <= 1 || shouldKeepGameWordVisible(text)) return text;
      return `${"_".repeat(Math.max(1, text.length - 1))}${text.slice(-1)}`;
    }

    function currentParagraph() {
      return state.paragraphs[state.currentParagraph];
    }

    function currentSentence() {
      const paragraph = currentParagraph();
      return paragraph ? paragraph.sentences[state.currentSentence] : "";
    }

    function updateCurrentInfo() {
      const paragraph = currentParagraph();
      const sentence = currentSentence();
      $("currentMeta").textContent = paragraph
        ? `第${state.currentParagraph + 1}段 / 第${state.currentSentence + 1}句`
        : "先载入课文";
      $("currentSentenceText").textContent = sentence || "暂无";
      $("focusCurrentSentence").textContent = sentence || "暂无";
    }

    function renderLrc() {
      const box = $("lrcBox");
      box.innerHTML = "";
      if (!state.lrc.length) {
        const div = document.createElement("div");
        div.className = "lrc-line active";
        div.textContent = "LRC会在这里按句显示";
        box.appendChild(div);
        return;
      }
      state.lrc.forEach((line, index) => {
        const div = document.createElement("div");
        div.className = "lrc-line";
        div.dataset.index = index;
        div.textContent = line.text || formatTime(line.time);
        div.addEventListener("click", () => {
          startLrcRepeat(index);
        });
        box.appendChild(div);
      });
      highlightLrc(getNearestLrcIndex($("audio").currentTime || 0));
    }


    function updateLrcWindow(activeIndex, shouldScroll = true) {
      if (!state.lrc.length) return;
      highlightLrc(activeIndex, shouldScroll);
    }

    function highlightLrc(index, shouldScroll = true) {
      document.querySelectorAll(".lrc-line").forEach(line => {
        line.classList.toggle("active", Number(line.dataset.index) === index);
      });
      const active = document.querySelector(`.lrc-line[data-index="${index}"]`);
      if (active && shouldScroll) active.scrollIntoView({ block: "nearest" });
    }

    function getNearestLrcIndex(time) {
      let active = 0;
      state.lrc.forEach((line, index) => {
        if (line.time <= time) active = index;
      });
      return active;
    }

    function startLrcRepeat(index) {
      if (!state.lrc[index]) return;
      state.lrcRepeat = {
        active: true,
        index,
        count: 0,
        max: 3
      };
      playLrcLine(index);
    }

    function playLrcLine(index) {
      const line = state.lrc[index];
      if (!line || !Number.isFinite(line.time)) {
        stopLrcRepeat();
        return;
      }
      $("audio").currentTime = line.time;
      highlightLrc(index);
      setCurrentByFlatIndex(index);
      $("audio").play().catch(() => showToast("请先点击播放器允许播放"));
    }

    function stopLrcRepeat() {
      state.lrcRepeat.active = false;
      $("audio").pause();
    }

    function handleLrcRepeatProgress() {
      if (!state.lrcRepeat.active || !state.lrc.length) return;
      const audio = $("audio");
      const index = state.lrcRepeat.index;
      const current = state.lrc[index];
      const next = state.lrc[index + 1];
      const endTime = next && Number.isFinite(next.time)
        ? next.time
        : Math.min(audio.duration || current.time + 6, current.time + 6);
      if (audio.currentTime < endTime - 0.08) return;
      state.lrcRepeat.count += 1;
      if (state.lrcRepeat.count < state.lrcRepeat.max) {
        playLrcLine(index);
        return;
      }
      const nextIndex = index + 1;
      if (!state.lrc[nextIndex]) {
        stopLrcRepeat();
        showToast("文章朗读结束");
        return;
      }
      state.lrcRepeat.index = nextIndex;
      state.lrcRepeat.count = 0;
      playLrcLine(nextIndex);
    }

    function syncAudioToCurrentSentence(shouldScroll = true) {
      if (!state.lrc.length) return;
      const flatIndex = flatSentenceIndex();
      const line = state.lrc[Math.min(flatIndex, state.lrc.length - 1)];
      if (line && Number.isFinite(line.time)) {
        if (!shouldScroll) state.suppressLrcScrollOnce = true;
        $("audio").currentTime = line.time;
        updateLrcWindow(Math.min(flatIndex, state.lrc.length - 1), shouldScroll);
      }
    }

    function flatSentenceIndex() {
      let index = 0;
      for (let p = 0; p < state.currentParagraph; p += 1) {
        index += state.paragraphs[p].sentences.length;
      }
      return index + state.currentSentence;
    }

    function setCurrentByFlatIndex(flatIndex) {
      let cursor = 0;
      for (let p = 0; p < state.paragraphs.length; p += 1) {
        const sentenceCount = state.paragraphs[p].sentences.length;
        if (flatIndex < cursor + sentenceCount) {
          state.currentParagraph = p;
          state.currentSentence = flatIndex - cursor;
          renderParagraphTabs();
          renderSentenceTabs();
          renderReader();
          updateCurrentInfo();
          saveStudyProgress();
          return;
        }
        cursor += sentenceCount;
      }
    }

    function renderGameIdle() {
      const sentence = currentSentence();
      $("gameSentence").textContent = sentence || "选择一句后开始。";
      $("choices").innerHTML = "";
      $("gameProgress").style.width = "0%";
      $("gameStage").textContent = "第一遍：看全句，点击每个词的正确首字母";
    }

    function startGame(pass = 1) {
      const sentence = currentSentence();
      const words = tokenize(sentence).filter(t => t.isWord).map(t => t.text);
      if (!words.length) {
        showToast("当前句没有可练习的英文单词");
        return;
      }
      state.game = {
        active: true,
        pass,
        wordIndex: 0,
        words,
        revealed: new Array(words.length).fill(false)
      };
      syncAudioToCurrentSentence();
      renderGame();
    }

    function renderGame() {
      const game = state.game;
      const sentence = currentSentence();
      if (!game.active) {
        renderGameIdle();
        return;
      }
      $("gameStage").textContent = game.pass === 1
        ? "第一遍：看全句，逐词点正确首字母"
        : "第二遍：全文覆盖，逐词回忆首字母";
      const tokens = tokenize(sentence);
      let wordCounter = -1;
      $("gameSentence").innerHTML = tokens.map(token => {
        if (!token.isWord) return escapeHtml(token.text);
        wordCounter += 1;
        const isRevealed = game.revealed[wordCounter] || (game.pass === 1 && wordCounter > game.wordIndex);
        const isCurrent = wordCounter === game.wordIndex;
        if (game.pass === 1) {
          return `<span class="game-word ${isCurrent ? "current" : ""}">${escapeHtml(token.text)}</span>`;
        }
        const keepVisible = shouldKeepGameWordVisible(token.text);
        const isMasked = !isRevealed && !keepVisible;
        const display = isMasked ? maskGameWord(token.text) : token.text;
        return `<span class="game-word ${isMasked ? "pending" : ""} ${isCurrent ? "current" : ""}">${escapeHtml(display)}</span>`;
      }).join("");
      $("gameProgress").style.width = `${Math.round((game.wordIndex / game.words.length) * 100)}%`;
      renderChoices();
    }

    function renderChoices() {
      const game = state.game;
      const word = game.words[game.wordIndex];
      const choices = getLetterChoices(word);
      const box = $("choices");
      box.innerHTML = "";
      choices.forEach(letter => {
        const btn = document.createElement("button");
        btn.className = "choice";
        btn.textContent = letter;
        btn.addEventListener("click", () => chooseLetter(btn, letter));
        box.appendChild(btn);
      });
    }

    function getLetterChoices(word) {
      const correct = word[0].toLowerCase();
      const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
      const pool = alphabet.filter(l => l !== correct);
      shuffle(pool);
      const choices = [correct, pool[0], pool[1]];
      return shuffle(choices).map(l => preserveCase(l, word[0]));
    }

    function chooseLetter(button, letter) {
      const game = state.game;
      const word = game.words[game.wordIndex];
      if (!word) return;
      if (letter.toLowerCase() !== word[0].toLowerCase()) {
        button.classList.add("wrong");
        setTimeout(() => button.classList.remove("wrong"), 280);
        return;
      }
      game.revealed[game.wordIndex] = true;
      game.wordIndex += 1;
      if (game.wordIndex >= game.words.length) {
        $("gameProgress").style.width = "100%";
        if (game.pass === 1) {
          showToast("第一遍完成，进入覆盖回忆");
          startGame(2);
        } else {
          markSentencePassed();
          showToast("本句过关，进入下一句");
          moveSentence(1, true);
        }
        return;
      }
      renderGame();
    }

    function markSentencePassed() {
      state.passed.add(`${state.currentParagraph}-${state.currentSentence}`);
      renderStats();
      saveStudyProgress();
    }

    function moveSentence(delta, autoStartGame = false) {
      if (state.gameAudioLoop.active) stopGameAudioLoop();
      const paragraph = currentParagraph();
      if (!paragraph) return;
      let p = state.currentParagraph;
      let s = state.currentSentence + delta;
      if (s >= paragraph.sentences.length) {
        p += 1;
        s = 0;
      }
      if (s < 0) {
        p -= 1;
        if (p >= 0) s = state.paragraphs[p].sentences.length - 1;
      }
      if (p < 0 || p >= state.paragraphs.length) {
        showToast("已经到课文边界");
        state.game.active = false;
        renderAll();
        return;
      }
      state.currentParagraph = p;
      state.currentSentence = s;
      state.game.active = false;
      renderAll();
      syncAudioToCurrentSentence(false);
      saveStudyProgress();
      if (autoStartGame) setTimeout(() => startGame(1), 250);
    }

    function repeatCurrentAudio() {
      const audio = $("audio");
      if (state.gameAudioLoop.active) {
        stopGameAudioLoop();
        return;
      }
      const index = Math.min(flatSentenceIndex(), state.lrc.length - 1);
      const line = state.lrc[index];
      if (!line || !Number.isFinite(line.time)) {
        showToast("当前句没有LRC时间点");
        return;
      }
      const next = state.lrc[index + 1];
      const endTime = next && Number.isFinite(next.time)
        ? next.time
        : Math.min(audio.duration || line.time + 8, line.time + 8);
      state.lrcRepeat.active = false;
      state.gameAudioLoop = {
        active: true,
        index,
        startTime: line.time,
        endTime
      };
      setRepeatAudioButton(true);
      syncSelectedPlaybackRate();
      audio.currentTime = line.time;
      highlightLrc(index);
      audio.play().catch(() => {
        stopGameAudioLoop();
        showToast("请先手动允许音频播放");
      });
    }

    function syncSelectedPlaybackRate() {
      const activeSpeed = document.querySelector(".speed-btn.active[data-speed]");
      const rate = activeSpeed ? Number(activeSpeed.dataset.speed) : $("audio").playbackRate || 1;
      $("audio").playbackRate = Number.isFinite(rate) ? rate : 1;
    }

    function setRepeatAudioButton(active) {
      const btn = $("repeatAudioBtn");
      if (!btn) return;
      btn.classList.toggle("listening", active);
    }

    function stopGameAudioLoop() {
      state.gameAudioLoop.active = false;
      $("audio").pause();
      setRepeatAudioButton(false);
    }

    function handleGameAudioLoop() {
      if (!state.gameAudioLoop.active) return;
      const audio = $("audio");
      if (audio.currentTime < state.gameAudioLoop.endTime - 0.06) return;
      syncSelectedPlaybackRate();
      audio.currentTime = state.gameAudioLoop.startTime;
      audio.play().catch(() => stopGameAudioLoop());
    }

    function setTheme(mode) {
      const isLight = mode === "light";
      document.body.classList.toggle("light-mode", isLight);
      const btn = $("themeToggle");
      if (btn) {
        const icon = $("themeIcon");
        if (icon) icon.src = isLight ? "night.png" : "day.png";
        btn.setAttribute("aria-label", isLight ? "切换到黑夜模式" : "切换到白天模式");
        btn.title = isLight ? "黑夜模式" : "白天模式";
        btn.setAttribute("aria-pressed", String(isLight));
      }
      try {
        localStorage.setItem("reciteTheme", isLight ? "light" : "dark");
      } catch (error) {}
    }

    function setFocusGameMode(active) {
      document.body.classList.toggle("focus-game", active);
      const btn = $("focusGameBtn");
      if (btn) btn.textContent = active ? "返回主页面" : "专注模式";
      if (!active && state.gameAudioLoop.active) stopGameAudioLoop();
      if (active && document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      if (!active && document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }

    function formatTime(time) {
      const min = Math.floor(time / 60);
      const sec = Math.floor(time % 60);
      return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }

    function escapeHtml(text) {
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function escapeAttr(text) {
      return escapeHtml(text).replace(/'/g, "&#39;");
    }

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    function preserveCase(letter, original) {
      return original === original.toUpperCase() ? letter.toUpperCase() : letter;
    }

    function bindEvents() {
      $("applyTextBtn").addEventListener("click", () => {
        loadText($("textInput").value);
        const panel = document.querySelector(".utility-panel");
        if (panel) panel.classList.remove("open");
      });
      $("settingsToggle").addEventListener("click", () => {
        const panel = $("settingsPanel");
        if (panel) panel.classList.toggle("open");
      });
      $("themeToggle").addEventListener("click", () => {
        const nextMode = document.body.classList.contains("light-mode") ? "dark" : "light";
        setTheme(nextMode);
      });
      $("loadLessonLabel").addEventListener("click", () => selectLesson($("lessonNumber").value));
      $("sampleBtn").addEventListener("click", () => {
        const panel = document.querySelector(".utility-panel");
        if (panel) panel.classList.remove("open");
      });
      $("txtFile").addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const text = await readFileEncoded(file);
        const parsed = /New\s+words\s+and\s+expressions/i.test(text) ? parseNce3Text(text) : null;
        $("textInput").value = parsed ? parsed.body : text;
        loadText(parsed ? parsed.body : text, parsed);
        const panel = $("settingsPanel");
        if (panel) panel.classList.remove("open");
      });
      $("lrcFile").addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const lrcText = await readFileAsText(file);
        state.lrc = parseLrc(lrcText);
        renderLrc();
        showToast("LRC已载入");
        const panel = $("settingsPanel");
        if (panel) panel.classList.remove("open");
      });
      $("mp3File").addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (!file) return;
        $("audio").src = URL.createObjectURL(file);
        $("audio").load();
        showToast("MP3已载入");
        const panel = $("settingsPanel");
        if (panel) panel.classList.remove("open");
      });
      $("speedGroup").addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-speed]");
        if (!btn) return;
        applySpeed(btn.dataset.speed);
        if (state.gameAudioLoop.active) syncSelectedPlaybackRate();
        saveStudyProgress();
      });
      $("modeGroup").addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-mode]");
        if (!btn) return;
        state.mode = btn.dataset.mode;
        applyModeButtonState();
        renderReader();
        saveStudyProgress();
      });
      $("gameModeBtn").addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
        $("gameModeBtn").classList.add("active");
        startGame(1);
        const gameCard = $("gameSentence");
        if (gameCard) gameCard.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      $("audio").addEventListener("timeupdate", () => {
        if (!state.lrc.length) return;
        const active = getNearestLrcIndex($("audio").currentTime || 0);
        const shouldScroll = !state.suppressLrcScrollOnce;
        state.suppressLrcScrollOnce = false;
        updateLrcWindow(active, shouldScroll);
        handleLrcRepeatProgress();
        handleGameAudioLoop();
      });
      $("prevSentenceBtn").addEventListener("click", () => moveSentence(-1));
      $("nextSentenceBtn").addEventListener("click", () => moveSentence(1));
      $("startGameBtn").addEventListener("click", () => startGame(1));
      $("restartSentenceBtn").addEventListener("click", () => startGame(1));
      $("skipSentenceBtn").addEventListener("click", () => moveSentence(1));
      $("repeatAudioBtn").addEventListener("click", repeatCurrentAudio);
      $("focusGameBtn").addEventListener("click", () => {
        const nextState = !document.body.classList.contains("focus-game");
        setFocusGameMode(nextState);
        if (nextState && !state.game.active) startGame(1);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && document.body.classList.contains("focus-game")) {
          setFocusGameMode(false);
        }
      });
    }

    let savedTheme = "dark";
    try {
      savedTheme = localStorage.getItem("reciteTheme") || "dark";
    } catch (error) {}
    setTheme(savedTheme === "light" ? "light" : "dark");
    bindEvents();
    $("textInput").value = "";
    state.lrc = [];
    const savedProgress = readStudyProgress();
    const initialCourse = savedProgress?.courseKey?.startsWith(`${NCE_BOOK}-`) ? savedProgress.courseKey : `${NCE_BOOK}-01`;
    selectLesson(initialCourse, { restoreProgress: savedProgress }).catch(() => {
      $("lessonSub").textContent = "课程载入失败，请重试或从设置导入文件。";
    });
  
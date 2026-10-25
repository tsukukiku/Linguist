const lessons = window.LESSONS;
let lines = [], words = [], notes = [];
const titleReadings = {1:'負[ま]けず嫌[ぎら]い',2:'藪蛇[やぶへび]',3:'豆沙包[トウシャーパオ]、その他[そのた]',4:'変換[へんかん]ミス',5:'副業[ふくぎょう]（一[いち]）',6:'副業[ふくぎょう]（二[に]）',7:'ニュアンス',8:'空[あ]き巣[す]',9:'ヤク中[ちゅう]',10:'省略[しょうりゃく]',11:'日本料理[にほんりょうり]（一[いち]）',12:'日本料理[にほんりょうり]（二[に]）',13:'サンタクロース',14:'病院[びょういん]の名前[なまえ]',15:'礼儀作法[れいぎさほう]',16:'携帯電話[けいたいでんわ]'};
const speakerReadings={渡辺:'渡辺[わたなべ]',君島:'君島[きみしま]',宮崎:'宮崎[みやざき]',長田:'長田[おさだ]',白川:'白川[しらかわ]',幸子:'幸子[さちこ]',浦田:'浦田[うらた]',古賀:'古賀[こが]',藤田:'藤田[ふじた]',大中:'大中[おおなか]',岩井:'岩井[いわい]',判田:'判田[はんだ]',砂川:'砂川[すながわ]',鈴木:'鈴木[すずき]',先生:'先生[せんせい]',父:'父[ちち]',母:'母[はは]',娘:'娘[むすめ]',子供達:'子供達[こどもたち]',中村:'中村[なかむら]',中尾:'中尾[なかお]'};
const speakerLabel=s=>speakerReadings[s]||s.replace(/^学生/,'学生[がくせい]');

const audio = document.getElementById('audio');
const playButton = document.getElementById('playButton');
const seek = document.getElementById('seek');
let selected = null;
let showAll = false;
let hasRealTimes = true;

const escapeHtml = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ruby = s => escapeHtml(s).replace(/([一-龯々][一-龯々ぁ-んァ-ヶー]*|[ァ-ヶー]+[一-龯々][一-龯々ぁ-んァ-ヶー]*)\[([^\]]+)\]/g,'<ruby>$1<rt>$2</rt></ruby>');
const fmt = t => `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const lessonSelect=document.getElementById('lessonSelect');
lessonSelect.innerHTML=Object.entries(lessons).map(([number,lesson])=>`<option value="${number}">第${number}課 · ${escapeHtml(lesson.title)}</option>`).join('');
let currentLesson=1;
function openLesson(number){
  if(!lessons[number])return;
  audio.pause();
  currentLesson=number;
  ({lines,words,notes}=lessons[number]);
  selected=null;
  audio.crossOrigin="use-credentials";audio.src=`${window.LINGUIST_API_ORIGIN}/api/audio/${number}`;
  audio.load();
  loadLessonLrc(number, lines);
  audio.playbackRate=Number(document.querySelector('[data-speed].selected')?.dataset.speed||1);
  seek.value=0;
  seek.max=Math.ceil(lines[lines.length-1]?.end||134);
  document.getElementById('currentTime').textContent='0:00';
  document.getElementById('duration').textContent=fmt(Number(seek.max));
  document.getElementById('nowPlaying').textContent='全体を再生';
  document.getElementById('lessonNumber').textContent=`LESSON ${String(number).padStart(2,'0')}`;
  document.getElementById('lessonTitle').innerHTML=ruby(titleReadings[number]||lessons[number].title);
  document.getElementById('audioTitle').textContent=`第${number}課 音声`;
  const speakers=[...new Set(lines.map(line=>line.s))];
  document.getElementById('lessonSpeakers').textContent=speakers.length>3?`${speakers.slice(0,2).join(' × ')} ほか`:speakers.join(' × ');
  document.getElementById('lessonDuration').textContent=`約${fmt(Number(seek.max))}`;
  document.getElementById('sourceCard').innerHTML=`原文：『挑战日语口语・中级篇』第${number}課<br>書籍の画像と付属音声から作成`;
  document.title=`ことばの道場｜第${number}課 ${lessons[number].title}`;
  lessonSelect.value=String(number);
  document.getElementById('previousLesson').disabled=number===1;
  document.getElementById('nextLesson').disabled=number===16;
  try{localStorage.setItem('kotoba-last-lesson',String(number))}catch{}
  renderLines();renderStatic();
}
lessonSelect.addEventListener('change',()=>openLesson(Number(lessonSelect.value)));
document.getElementById('previousLesson').addEventListener('click',()=>openLesson(currentLesson-1));
document.getElementById('nextLesson').addEventListener('click',()=>openLesson(currentLesson+1));

function renderLines(){
  document.getElementById('lines').innerHTML = lines.map((l,i)=>`<article class="line${selected===i?' active':''}" data-index="${i}"><span class="line-number">${String(i+1).padStart(2,'0')}</span><span class="speaker ${i%2?'nakamura':''}">${ruby(speakerLabel(l.s))}</span><div class="line-body"><div class="japanese" tabindex="0" role="button" aria-label="第${i+1}文を再生">${ruby(l.j)}</div><p class="line-translation${showAll||l.revealed?' visible':''}">${escapeHtml(l.z||'訳文は翻訳欄をご覧ください。')}</p></div><div class="line-actions"><button class="icon-button" data-action="play" aria-label="第${i+1}文を再生">▶</button><button class="reveal-button" data-action="reveal">${showAll||l.revealed?'訳を隠す':'訳を見る'}</button></div></article>`).join('');
}
function renderStatic(){
  document.getElementById('wordList').innerHTML=words.map(w=>`<div class="word-item"><strong>${escapeHtml(w[0])}</strong><small>${escapeHtml(w[1])}</small><p>${escapeHtml(w[2])}</p></div>`).join('');
  document.getElementById('noteList').innerHTML=notes.map((n,i)=>`<article class="note"><h3><span class="note-index">${String(i+1).padStart(2,'0')}</span>${escapeHtml(n[0])}</h3><p>${escapeHtml(n[1])}</p></article>`).join('');
  const translated=lines.filter((l,i)=>i===0||l.s!==lines[i-1].s||l.z!==lines[i-1].z);
  document.getElementById('translationList').innerHTML=translated.map(l=>`<div class="translation-item"><strong>${escapeHtml(l.s)}</strong><p>${escapeHtml(l.z||'訳文の照合中')}</p></div>`).join('');
}
function playLine(i){
  const l=lines[i];
  if(!hasRealTimes||!Number.isFinite(l.start)||!Number.isFinite(l.end)){document.getElementById('nowPlaying').textContent='音声位置を準備中';return}
  selected=i; audio.currentTime=l.start; audio.play();
  document.getElementById('nowPlaying').textContent=`${String(i+1).padStart(2,'0')} / ${lines.length} · ${l.s}`;
  renderLines();
}
document.getElementById('lines').addEventListener('click',e=>{
  const item=e.target.closest('.line'); if(!item)return;
  const i=Number(item.dataset.index);
  if(e.target.closest('[data-action="reveal"]')){lines[i].revealed=!lines[i].revealed;renderLines()}
  else if(e.target.closest('[data-action="play"]')||e.target.closest('.japanese'))playLine(i);
});
document.getElementById('lines').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('japanese')){e.preventDefault();playLine(Number(e.target.closest('.line').dataset.index))}});
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',x===b?'true':'false')});document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===b.dataset.tab))}));
document.getElementById('furiganaToggle').addEventListener('click',e=>{let hidden=document.body.classList.toggle('hide-ruby');e.target.textContent=hidden?'ふりがなを表示':'ふりがなを隠す';e.target.setAttribute('aria-pressed',hidden?'false':'true')});
document.getElementById('showAllTranslations').addEventListener('click',e=>{showAll=!showAll;e.target.textContent=showAll?'訳をすべて隠す':'訳をすべて表示';e.target.setAttribute('aria-pressed',String(showAll));renderLines()});
document.getElementById('fullPlayback').addEventListener('click',()=>{selected=null;document.getElementById('nowPlaying').textContent='全体を再生';if(audio.duration&&audio.currentTime>=audio.duration-.1)audio.currentTime=0;audio.play();renderLines()});
playButton.addEventListener('click',()=>{if(audio.paused){if(selected!==null&&audio.currentTime>=lines[selected].end-.08)audio.currentTime=lines[selected].start;audio.play()}else audio.pause()});
document.getElementById('backButton').addEventListener('click',()=>{audio.currentTime=Math.max(0,audio.currentTime-5)});
document.getElementById('forwardButton').addEventListener('click',()=>{audio.currentTime=Math.min(audio.duration||134,audio.currentTime+5)});
document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>{audio.playbackRate=Number(b.dataset.speed);document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('selected',x===b))}));
seek.addEventListener('input',()=>{selected=null;document.getElementById('nowPlaying').textContent='全体を再生';audio.currentTime=Number(seek.value);renderLines()});
audio.addEventListener('loadedmetadata',()=>{seek.max=audio.duration;document.getElementById('duration').textContent=fmt(audio.duration);document.getElementById('lessonDuration').textContent=`約${fmt(audio.duration)}`});
audio.addEventListener('timeupdate',()=>{seek.value=audio.currentTime;document.getElementById('currentTime').textContent=fmt(audio.currentTime);if(selected!==null&&audio.currentTime>=lines[selected].end-.06){audio.pause();audio.currentTime=lines[selected].end}});
audio.addEventListener('play',()=>{playButton.textContent='Ⅱ';playButton.setAttribute('aria-label','一時停止')});
audio.addEventListener('pause',()=>{playButton.textContent='▶';playButton.setAttribute('aria-label','再生')});
let savedLesson=1;
try{savedLesson=Number(localStorage.getItem('kotoba-last-lesson'))||1}catch{}
openLesson(lessons[savedLesson]?savedLesson:1);

async function loadLessonLrc(number, lessonLines) {
  try {
    const response = await fetch(`${window.LINGUIST_API_ORIGIN}/api/lrc/${number}`, {credentials: 'include', cache: 'no-store'});
    if (!response.ok) return;
    const lrc = await response.text();
    const stamps = [...lrc.matchAll(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/gm)]
      .map(match => ({time: Number(match[1]) * 60 + Number(match[2]), text: match[3].trim()}));
    const dialogue = stamps.filter(item => item.text.includes('：') || item.text.includes(':'));
    if (dialogue.length !== lessonLines.length || currentLesson !== number || lines !== lessonLines ||
        dialogue.some((item, index) => !Number.isFinite(item.time) || item.time < 0 ||
          (index > 0 && item.time <= dialogue[index - 1].time))) return;
    dialogue.forEach((item, index) => {
      lessonLines[index].start = item.time;
      if (index + 1 < dialogue.length) lessonLines[index].end = Math.max(item.time + 0.1, dialogue[index + 1].time - 0.08);
      else lessonLines[index].end = Math.max(lessonLines[index].end, item.time + 0.5);
    });
  } catch (error) {
    console.warn('LRC の読み込みに失敗しました。内蔵時刻を使います。', error);
  }
}


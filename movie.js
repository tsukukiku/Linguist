(async()=>{
  const api=window.LINGUIST_API_ORIGIN;
  const grid=document.getElementById('lessonGrid');
  const status=document.getElementById('status');
  const panel=document.getElementById('lessonPanel');
  const title=document.getElementById('lessonTitle');
  const meta=document.getElementById('lessonMeta');
  const text=document.getElementById('lessonText');
  const notice=document.getElementById('lessonNotice');
  const actions=document.getElementById('lessonActions');
  const get=async url=>{const response=await fetch(url,{credentials:'include',cache:'no-store',redirect:'manual'});if(!response.ok)throw Error(String(response.status));return response.json()};
  let index,sample,privateLessons;
  try{[index,sample]=await Promise.all([get('sample/movie-index.json'),get('sample/movie-lesson1.json')]);}
  catch{status.textContent='目录载入失败，请刷新页面。';return}
  try{privateLessons=await get(`${api}/api/movie/lessons`)}catch{privateLessons=null}
  status.textContent='共 32 课。第 1 课可试读；后续课程需要授权登录。';
  const show=n=>{
    const item=index[n-1];
    if(!item)return;
    const lesson=n===1?sample:privateLessons?.[String(n)];
    panel.hidden=false;
    title.textContent=`第 ${n} 课 · ${item.title}／${item.titleZh}`;
    meta.textContent=`原书第 ${item.printedStart}–${item.printedEnd} 页 · 扫描文字草稿`;
    actions.replaceChildren();
    if(!lesson?.scene){
      text.hidden=true;
      notice.hidden=false;
      notice.textContent='第 2 课以后需要授权登录，才能查看对白。';
      const a=document.createElement('a');
      const back=new URL(location.href);back.searchParams.set('lesson',String(n));
      a.href=`${api}/auth?return=${encodeURIComponent(back.href)}`;
      a.className='button';a.textContent='使用邮箱登录';actions.append(a);
    }else{
      text.hidden=false;notice.hidden=false;
      notice.textContent=n===1?'第 1 课对白已对照扫描页整理；LRC 时间尚未制作。':'OCR 草稿：文字尚未逐句校对，LRC 时间未制作。';
      text.textContent=lesson.scene;
      if(n>1){const a=document.createElement('a');a.href=`${api}/api/movie/lrc/${n}`;a.textContent='下载 LRC 草稿';a.rel='noopener';actions.append(a)}
    }
    history.replaceState(null,'',`?lesson=${n}`);
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  };
  index.forEach((item,i)=>{
    const button=document.createElement('button');button.type='button';
    button.innerHTML=`<strong>第 ${item.number} 课</strong><span></span>`;
    button.querySelector('span').textContent=`${item.title}／${item.titleZh}`;
    button.addEventListener('click',()=>show(i+1));grid.append(button);
  });
  const requested=Number(new URLSearchParams(location.search).get('lesson'));
  if(Number.isInteger(requested)&&requested>=1&&requested<=32)show(requested);
})();

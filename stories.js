const STORY_DATA_URL='story/posts.json';

function storyDate(value){
  const date=new Date(`${value}T00:00:00`);
  if(Number.isNaN(date.getTime()))return String(value||'');
  return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date).replace(/\. /g,'.');
}

function storyHref(post){
  return post.url?`story/${post.url}`:`story/post.html?id=${encodeURIComponent(post.id||'')}`;
}

function createStoryCard(post){
  const article=document.createElement('article');
  article.className='story home-story-card reveal visible';
  const link=document.createElement('a');
  link.href=storyHref(post);
  const text=document.createElement('div');
  text.className='story-text';
  const meta=document.createElement('span');
  meta.textContent=`이야기 · ${storyDate(post.date)}`;
  const title=document.createElement('h3');
  title.textContent=post.title||'(제목 없음)';
  const summary=document.createElement('p');
  summary.textContent=post.summary||'';
  const more=document.createElement('span');
  more.className='arrow-link';
  more.textContent='읽어보기 →';
  text.append(meta,title,summary,more);
  link.append(text);
  article.append(link);
  return article;
}

async function renderLatestStories(){
  const lists=document.querySelectorAll('[data-story-list]');
  if(!lists.length)return;
  try{
    const response=await fetch(STORY_DATA_URL,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const posts=await response.json();
    if(!Array.isArray(posts))throw new Error('잘못된 글 데이터');
    const sorted=posts.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    lists.forEach(list=>{
      const limit=Number.parseInt(list.dataset.limit||'3',10);
      const items=sorted.slice(0,Number.isFinite(limit)?limit:3);
      if(items.length)list.replaceChildren(...items.map(createStoryCard));
      else{const empty=document.createElement('p');empty.className='story-status';empty.textContent='첫 번째 이야기를 준비하고 있어요.';list.replaceChildren(empty)}
    });
  }catch(error){
    lists.forEach(list=>{const status=document.createElement('p');status.className='story-status';status.textContent='이야기를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';list.replaceChildren(status)});
    console.error('이야기 데이터 로딩 실패:',error);
  }
}

renderLatestStories();

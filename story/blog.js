(function(){
  const list=document.querySelector('[data-blog-list]');
  const main=document.querySelector('[data-blog-post]');

  function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node}
  function fmtDate(value){const date=new Date(`${value}T00:00:00`);if(Number.isNaN(date.getTime()))return String(value||'');return `${date.getFullYear()}. ${date.getMonth()+1}. ${date.getDate()}.`}
  function hrefOf(post){return post.url?String(post.url):`post.html?id=${encodeURIComponent(post.id||'')}`}

  function renderList(posts){
    const sorted=posts.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    if(!sorted.length){const empty=el('div','blog-empty');empty.append(el('strong',null,'아직 올라온 글이 없습니다'),document.createTextNode('첫 번째 이야기를 준비하고 있어요. 곧 만나요.'));list.replaceWith(empty);return}
    sorted.forEach(post=>{
      const item=el('li','blog-card');const link=el('a');link.href=hrefOf(post);
      const time=el('time',null,fmtDate(post.date));time.dateTime=String(post.date||'');
      link.append(time,el('h2',null,String(post.title||'(제목 없음)')));
      if(post.summary)link.append(el('p','blog-summary',String(post.summary)));
      if(Array.isArray(post.tags)&&post.tags.length){const tags=el('div','blog-tags');post.tags.forEach(tag=>tags.append(el('span','blog-tag',String(tag))));link.append(tags)}
      link.append(el('span','blog-read','이야기 읽기 →'));
      item.append(link);list.append(item);
    });
  }

  function renderBody(source){
    const box=el('div','blog-body');
    String(source||'').replace(/\r\n/g,'\n').split(/\n\s*\n/).forEach(block=>{
      block=block.trim();if(!block)return;const lines=block.split('\n');
      if(lines.every(line=>/^- /.test(line.trim()))){const ul=el('ul');lines.forEach(line=>ul.append(el('li',null,line.trim().slice(2))));box.append(ul)}
      else if(/^## /.test(block))box.append(el('h2',null,block.slice(3).trim()));
      else box.append(el('p',null,block));
    });
    return box;
  }

  function setMeta(post){
    const title=String(post.title||'이야기');const description=String(post.description||post.summary||'').slice(0,160);const canonical=location.href.split('#')[0];const author=String(post.author||'').trim();
    document.title=`${title} | Funny D`;document.querySelector('meta[name="description"]').content=description;document.querySelector('meta[name="author"]').content=author;document.querySelector('link[rel="canonical"]').href=canonical;document.querySelector('meta[property="og:title"]').content=title;document.querySelector('meta[property="og:description"]').content=description;document.querySelector('meta[property="og:url"]').content=canonical;
    const ld=document.createElement('script');ld.type='application/ld+json';ld.textContent=JSON.stringify({'@context':'https://schema.org','@type':'BlogPosting',headline:title,description,datePublished:String(post.date||''),dateModified:String(post.updated||post.date||''),mainEntityOfPage:canonical,keywords:Array.isArray(post.tags)?post.tags.map(String).join(', '):'',...(author?{author:{'@type':'Person',name:author}}:{})});document.head.append(ld);
  }

  function renderFaq(items){const section=el('section','blog-faq');section.append(el('h2',null,'자주 묻는 질문'));items.forEach(item=>{const details=el('details');details.append(el('summary',null,String(item.q)),el('p',null,String(item.a)));section.append(details)});return section}
  function renderSources(items){const section=el('section','blog-sources');section.append(el('h2',null,'참고·출처'));const ol=el('ol');items.forEach(item=>{const li=el('li');if(item&&item.url){const link=el('a',null,String(item.title||item.url));link.href=String(item.url);link.target='_blank';link.rel='noopener';li.append(link)}else li.textContent=String(item&&item.title||item||'');ol.append(li)});section.append(ol);return section}

  function renderPost(posts){
    const id=new URLSearchParams(location.search).get('id')||new URLSearchParams(location.search).get('slug');
    const sorted=posts.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    const index=sorted.findIndex(post=>String(post.id)===id||(post.url&&String(post.url).replace(/\.html$/,'')===id));
    if(index<0){const box=el('div','blog-notfound');box.append(el('h1',null,'글을 찾을 수 없습니다'),el('p',null,'주소가 잘못되었거나 삭제된 글일 수 있어요.'));const back=el('a','button button-primary',null);back.href='index.html';back.textContent='이야기 목록으로';box.append(back);main.append(box);return}
    const post=sorted[index];setMeta(post);const article=el('article','blog-article');const head=el('header','post-head');const time=el('time',null,fmtDate(post.date));time.dateTime=String(post.date||'');head.append(time,el('h1',null,String(post.title||'(제목 없음)')));
    if(post.author||(post.updated&&post.updated!==post.date)){const meta=el('div','post-meta');if(post.author)meta.append(el('span',null,String(post.author)));if(post.updated&&post.updated!==post.date)meta.append(el('span',null,`수정 ${fmtDate(post.updated)}`));head.append(meta)}
    if(Array.isArray(post.tags)&&post.tags.length){const tags=el('div','blog-tags');post.tags.forEach(tag=>tags.append(el('span','blog-tag',String(tag))));head.append(tags)}
    article.append(head,el('hr','post-rule'),renderBody(post.body));const faq=Array.isArray(post.faq)?post.faq.filter(item=>item&&item.q&&item.a):[];if(faq.length)article.append(renderFaq(faq));if(Array.isArray(post.sources)&&post.sources.length)article.append(renderSources(post.sources));
    const previous=sorted[index+1],next=sorted[index-1];if(previous||next){const nav=el('nav','blog-pn');nav.setAttribute('aria-label','다른 이야기');const add=(item,cls,label)=>{if(!item){nav.append(el('span'));return}const link=el('a',cls);link.href=hrefOf(item);link.append(el('div','dir',label),el('div','pn-title',String(item.title||'')));nav.append(link)};add(previous,'prev','이전 글');add(next,'next','다음 글');article.append(nav)}main.append(article);
  }

  fetch('posts.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error(response.status);return response.json()}).then(posts=>{const data=Array.isArray(posts)?posts:[];if(list)renderList(data);if(main)renderPost(data)}).catch(()=>{const error=el('div','blog-error','글을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.');if(list)list.replaceWith(error);if(main)main.append(error)});
})();

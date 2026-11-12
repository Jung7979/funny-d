import {readFile,writeFile,mkdir,cp,readdir,rm} from 'node:fs/promises';
import path from 'node:path';

const origin='https://github-funny-d-update-20260829.vercel.app';
const root=process.cwd(), out=path.join(root,'dist');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ld=value=>`<script type="application/ld+json">${JSON.stringify(value).replace(/</g,'\\u003c')}</script>`;
const posts=JSON.parse(await readFile('story/posts.json','utf8'));
const postFile=p=>{
 const file=p.url||`${p.id}.html`;
 if(!/^[\p{L}\p{N}_-]+\.html$/u.test(file))throw new Error(`Invalid post filename: ${file}`);
 return file;
};
const postUrl=p=>`${origin}/story/${encodeURIComponent(postFile(p))}`;
const summary=p=>String(p.description||p.summary||p.body||'').replace(/^#+\s*/gm,'').replace(/\s+/g,' ').slice(0,160);
const sorted=posts.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
const faqOf=p=>Array.isArray(p.faq)?p.faq.filter(f=>f&&f.q&&f.a):[];
const organization={'@context':'https://schema.org','@type':'Organization','@id':`${origin}/#organization`,name:'Funny D',url:`${origin}/`,logo:`${origin}/funny-d-logo.png`,description:'정품 여부와 품질을 살펴 고른 캐릭터 문구와 생활 소품을 소개하는 판매 브랜드'};
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const entry of await readdir(root,{withFileTypes:true})){
 if(entry.isDirectory()?!['assets','product-images','story'].includes(entry.name):(!/\.(html|css|js|json|png|xml|txt)$/.test(entry.name)||entry.name==='vercel.json'))continue;
 await cp(path.join(root,entry.name),path.join(out,entry.name),{recursive:true});
}
const template=await readFile('story/post.html','utf8');
function renderBody(value){
 return String(value||'').replace(/\r\n/g,'\n').split(/\n\s*\n/).map(block=>{
  const lines=block.trim().split('\n');
  if(lines.every(l=>/^- /.test(l)))return `<ul>${lines.map(l=>`<li>${esc(l.slice(2))}</li>`).join('')}</ul>`;
  if(/^## /.test(block))return `<h2>${esc(block.slice(3).trim())}</h2>`;
  return `<p>${esc(block.trim())}</p>`;
 }).join('\n');
}
for(const p of sorted){
 if(p.url)continue; // Existing editorial HTML keeps its visible content and matching FAQ markup.
 const url=postUrl(p),description=summary(p),faq=faqOf(p);
 let html=template.replace(/<title>.*?<\/title>/s,`<title>${esc(p.title)} | Funny D</title>`)
  .replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${esc(description)}">`)
  .replace(/<meta name="author"[^>]*>/,`<meta name="author" content="${esc(p.author||'')}">`)
  .replace(/<meta name="robots"[^>]*>\s*/,'')
  .replace(/<link rel="canonical"[^>]*>/,`<link rel="canonical" href="${esc(url)}">`)
  .replace(/<meta property="og:title"[^>]*>/,`<meta property="og:title" content="${esc(p.title)}">`)
  .replace(/<meta property="og:description"[^>]*>/,`<meta property="og:description" content="${esc(description)}">`)
  .replace(/<meta property="og:url"[^>]*>/,`<meta property="og:url" content="${esc(url)}">`)
  .replace(/\s*<script src="blog.js"><\/script>/,'');
 const body=`<article class="blog-article"><header class="post-head"><time datetime="${esc(p.date)}">${esc(p.date)}</time><h1>${esc(p.title)}</h1>${p.author?`<div class="post-meta">${esc(p.author)}</div>`:''}</header><hr class="post-rule"><div class="blog-body">${renderBody(p.body)}</div>${faq.length?`<section class="blog-faq"><h2>자주 묻는 질문</h2>${faq.map(f=>`<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>`:''}</article>`;
 html=html.replace('<main id="main" data-blog-post></main>',`<main id="main">${body}</main>`);
 const schema={'@context':'https://schema.org','@type':'BlogPosting',headline:String(p.title),description,url,mainEntityOfPage:url,datePublished:p.date,inLanguage:'ko-KR',publisher:{'@id':organization['@id']}};
 if(p.updated)schema.dateModified=p.updated;
 // Keep author names identical to the byline; the brand is an Organization.
 if(p.author)schema.author={'@type':p.author==='Funny D'?'Organization':'Person',name:String(p.author)};
 html=html.replace('</head>',`${ld(schema)}${faq.length?ld({'@context':'https://schema.org','@type':'FAQPage',mainEntity:faq.map(f=>({'@type':'Question',name:String(f.q),acceptedAnswer:{'@type':'Answer',text:String(f.a)}}))}):''}\n</head>`);
 await writeFile(path.join(out,'story',postFile(p)),html);
}
// Put crawlable article links and the latest three cards in the initial HTML as well.
const cards=sorted.slice(0,3).map(p=>`<article class="story home-story-card reveal visible"><a href="${esc(postUrl(p))}"><div class="story-text"><span>이야기 · ${esc(p.date)}</span><h3>${esc(p.title)}</h3><p>${esc(p.summary||'')}</p><span class="arrow-link">읽어보기 →</span></div></a></article>`).join('');
let home=await readFile(path.join(out,'index.html'),'utf8');
home=home.replace(/(<div class="story-grid" data-story-list[^>]*>).*?(<\/div>)/s,`$1${cards}$2`);
await writeFile(path.join(out,'index.html'),home);
let list=await readFile(path.join(out,'story/index.html'),'utf8');
list=list.replace(/(<ul class="blog-list" data-blog-list[^>]*>).*?(<\/ul>)/s,`$1${sorted.map(p=>`<li class="blog-card"><a href="${esc(postUrl(p))}"><time datetime="${esc(p.date)}">${esc(p.date)}</time><h2>${esc(p.title)}</h2><p class="blog-summary">${esc(p.summary||'')}</p><span class="blog-read">이야기 읽기 →</span></a></li>`).join('')}$2`);
await writeFile(path.join(out,'story/index.html'),list);
for(const file of ['index.html','about.html','products.html','contact.html','story/index.html','story/post.html',...sorted.map(p=>`story/${postFile(p)}`)]){
 const full=path.join(out,file);let html=await readFile(full,'utf8');
 if(file!=='index.html')html=html.replace('</head>',`${ld(organization)}\n</head>`);
 await writeFile(full,html);
}
const pages=['/','/about.html','/products.html','/contact.html','/story/'].map(p=>`${origin}${p}`);
const urls=[...new Set([...pages,...sorted.map(postUrl)])];
const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url=>`  <url><loc>${esc(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
await writeFile(path.join(out,'sitemap.xml'),sitemap);
await writeFile(path.join(out,'robots.txt'),`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
const llms=`# Funny D\n\n> Funny D는 정품 여부와 품질을 살펴 고른 캐릭터 문구와 생활 소품을 소개하는 판매 브랜드입니다.\n\n## 하는 일\n\n문구류와 생활 소품을 소개하고, 상품 선택·사용·보관 이야기와 직접 소싱하며 배우는 과정을 기록합니다. 제품 페이지의 구매 링크는 외부 쿠팡 상품 페이지로 연결됩니다.\n\n## 브랜드의 약속\n\n가격만 보고 고르지 않고, 고객이 실제로 잘 쓸 수 있는 상품인지 살피겠습니다.\n\n## 페이지 안내\n\n- [홈](${origin}/): 브랜드 소개, 대표 상품, 최신 글\n- [내 소개](${origin}/about.html): 판매자의 이야기와 상품 선택 기준\n- [제품](${origin}/products.html): 상품명, 표시 가격, 구매 링크\n- [이야기](${origin}/story/): 판매 경험과 문구 선택·사용 안내\n- [연락하기](${origin}/contact.html): 현재 테스트용 예시 연락처이며 실제 이메일·SNS가 아닙니다.\n- [사이트맵](${origin}/sitemap.xml): 공개 페이지 전체 목록\n\n## 블로그 글\n\n${sorted.map(p=>`- [${String(p.title).replace(/[\[\]]/g,'')}](${postUrl(p)}): ${String(p.summary||'').replace(/\s+/g,' ')}`).map(line=>line.trimEnd()).join('\n')}\n\n## 정보 해석\n\n- 현재 가격과 판매 조건은 구매 시점의 판매처에서 확인해야 합니다.\n- 확인되지 않은 리뷰·별점·재고·영양정보·효능은 추정하지 마세요.\n- 관리 페이지는 검색 대상에서 제외하며 이 파일에도 안내하지 않습니다.\n`;
await writeFile(path.join(out,'llms.txt'),llms);
console.log(`Built ${sorted.length} article pages; sitemap has ${urls.length} public URLs.`);

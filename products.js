const PRODUCT_DATA_URL='products.json';

function safeHttpUrl(value){
  try{const url=new URL(value,window.location.href);return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}
}

function createProductCard(product){
  const card=document.createElement('article');
  card.className='product-card catalog-card';

  const visual=document.createElement('div');
  visual.className='catalog-image';
  const image=document.createElement('img');
  image.loading='lazy';
  image.alt=product.name;
  const imageUrl=safeHttpUrl(product.image);
  if(imageUrl)image.src=imageUrl;
  const fallback=document.createElement('span');
  fallback.className='image-fallback';
  fallback.textContent='상품 이미지를 준비 중이에요.';
  image.addEventListener('error',()=>{image.hidden=true;fallback.classList.add('show')});
  visual.append(image,fallback);

  const info=document.createElement('div');
  info.className='product-info catalog-info';
  const label=document.createElement('span');
  label.textContent='SMARTWORKS · COUPANG';
  const title=document.createElement('h3');
  title.textContent=product.name;
  const price=document.createElement('p');
  price.className='catalog-price';
  price.textContent=product.price;
  const link=document.createElement('a');
  link.className='button button-primary buy-button';
  link.textContent='구매하기 ↗';
  const purchaseUrl=safeHttpUrl(product.url);
  if(purchaseUrl){link.href=purchaseUrl;link.target='_blank';link.rel='noopener noreferrer'}else{link.href='#';link.setAttribute('aria-disabled','true')}
  info.append(label,title,price,link);
  card.append(visual,info);
  return card;
}

async function renderProducts(){
  const lists=document.querySelectorAll('[data-product-list]');
  if(!lists.length)return;
  try{
    const response=await fetch(PRODUCT_DATA_URL,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const products=await response.json();
    if(!Array.isArray(products)||!products.length)throw new Error('상품 데이터가 비어 있습니다.');
    lists.forEach(list=>{
      const limit=Number.parseInt(list.dataset.limit||'',10);
      const items=Number.isFinite(limit)?products.slice(0,limit):products;
      list.replaceChildren(...items.map(createProductCard));
    });
  }catch(error){
    lists.forEach(list=>{const status=document.createElement('p');status.className='catalog-status catalog-error';status.textContent='상품 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';list.replaceChildren(status)});
    console.error('상품 데이터 로딩 실패:',error);
  }
}

renderProducts();

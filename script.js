const menuButton=document.querySelector('.menu-toggle');
const nav=document.querySelector('.nav');
menuButton.addEventListener('click',()=>{const open=nav.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'메뉴 닫기':'메뉴 열기')});
nav.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{nav.classList.remove('open');menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','메뉴 열기')}));

const filters=document.querySelectorAll('.filter');
const products=document.querySelectorAll('.product-card');
filters.forEach(filter=>filter.addEventListener('click',()=>{filters.forEach(item=>{item.classList.remove('active');item.setAttribute('aria-selected','false')});filter.classList.add('active');filter.setAttribute('aria-selected','true');const value=filter.dataset.filter;products.forEach(product=>product.classList.toggle('hidden',value!=='all'&&product.dataset.category!==value))}));

document.querySelectorAll('.heart').forEach(button=>button.addEventListener('click',()=>{const pressed=button.getAttribute('aria-pressed')==='true';button.setAttribute('aria-pressed',String(!pressed));button.textContent=pressed?'♡':'♥'}));

const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.1});
document.querySelectorAll('.reveal').forEach(element=>observer.observe(element));

const contactForm=document.querySelector('#contact-form');
if(contactForm)contactForm.addEventListener('submit',event=>{event.preventDefault();event.currentTarget.querySelector('.form-status').textContent='메시지를 받았어요! Funny D가 곧 답장할게요. ♥';event.currentTarget.reset()});

// 실행학교 4주차 쇼핑몰 키트 — 서버 공통 (Vercel 함수)
// 파일 이름이 _ 로 시작하면 Vercel이 주소로 만들지 않아요(도우미 파일).
// 가격 규칙은 shop/shop.js 와 똑같아야 해요. 고칠 때는 둘 다 고쳐요.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function num(v) { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; }
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function won(n) { return Math.round(Number(n) || 0).toLocaleString('ko-KR') + '원'; }

export function saleActive(p, d = today()) {
  const s = num(p.salePrice), b = num(p.price);
  if (!(s > 0) || !(s < b)) return false;
  if (p.saleStart && d < p.saleStart) return false;
  if (p.saleEnd && d > p.saleEnd) return false;
  return true;
}
export function basePrice(p, d) { return saleActive(p, d) ? num(p.salePrice) : num(p.price); }
export function optionAdd(p, opts) {
  let add = 0;
  const list = p.options || [];
  for (let i = 0; i < list.length; i++) {
    const v = (list[i].values || []).find((x) => x.label === (opts || [])[i]);
    if (!v) return null;
    add += num(v.add);
  }
  return add;
}
export function unitPrice(p, opts, d) { const a = optionAdd(p, opts); return a === null ? null : basePrice(p, d) + a; }
const unlimited = (p) => p.stock === '' || p.stock === null || p.stock === undefined;
export function sellable(p) { return !!p && p.status !== '숨김' && p.status !== '품절' && (unlimited(p) || num(p.stock) > 0); }
export function maxQty(p) { const m = num(p.maxQty) || 99; return unlimited(p) ? m : Math.min(m, num(p.stock)); }
export function shipping(st, subtotal) {
  if (!subtotal) return 0;
  const free = num(st.freeShippingOver);
  if (free > 0 && subtotal >= free) return 0;
  return num(st.shippingFee);
}

// 주문 금액을 서버에서 다시 계산해요 (화면에서 보낸 금액은 믿지 않아요)
export function quote(data, items, d = today()) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new Error('주문 상품이 비어 있어요.');
  const lines = [];
  let subtotal = 0;
  for (const it of items) {
    const p = (data.products || []).find((x) => x.id === it.id);
    const qty = Math.floor(num(it.qty));
    if (!p || p.status === '숨김') throw new Error('판매가 끝난 상품이 있어요. 장바구니를 확인해 주세요.');
    if (!sellable(p)) throw new Error(`${p.name}은(는) 품절이에요.`);
    if (!(qty >= 1) || qty > maxQty(p)) throw new Error(`${p.name} 수량을 확인해 주세요. (최대 ${maxQty(p)}개)`);
    const opts = Array.isArray(it.opts) ? it.opts.map(String) : [];
    const unit = unitPrice(p, opts, d);
    if (unit === null) throw new Error(`${p.name} 옵션이 바뀌었어요. 다시 골라 주세요.`);
    const opt = (p.options || []).map((o, i) => `${o.name}: ${opts[i]}`).join(' · ');
    lines.push({ id: p.id, sku: p.sku || '', name: p.name, opt, opts, qty, unit, total: unit * qty });
    subtotal += unit * qty;
  }
  const ship = shipping(data.store || {}, subtotal);
  return { lines, subtotal, shipping: ship, total: subtotal + ship };
}

// shop/products.json 읽기: 배포된 파일 → 안 되면 내 사이트 주소에서 받아오기
export async function loadData(req) {
  for (const p of [path.join(process.cwd(), 'shop', 'products.json'), path.join(process.cwd(), 'public', 'shop', 'products.json')]) {
    try { return JSON.parse(await readFile(p, 'utf8')); } catch {}
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const r = await fetch(`https://${host}/shop/products.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('상품 정보를 읽지 못했어요.');
  return r.json();
}

export function cleanCustomer(c = {}) {
  const s = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const out = { name: s(c.name, 30), phone: s(c.phone, 20).replace(/[^0-9]/g, ''), email: s(c.email, 80), address: s(c.address, 120), address2: s(c.address2, 80), zip: s(c.zip, 7), memo: s(c.memo, 100) };
  if (!out.name) throw new Error('이름을 적어 주세요.');
  if (!/^01[0-9]{8,9}$/.test(out.phone)) throw new Error('휴대폰 번호를 확인해 주세요.');
  if (!out.address) throw new Error('받는 주소를 적어 주세요.');
  return out;
}

export function validOrderId(id) { return /^ORD-\d{8}-[A-Z0-9]{6}$/.test(String(id || '')); }

export function webhookUrl() { return (process.env.ORDER_WEBHOOK_URL || '').trim(); }
export function demoMode() { return process.env.SHOP_DEMO_MODE === '1'; }

// 디스코드(또는 슬랙) 웹훅으로 주문 알림 보내기
export async function notify(order, storeName) {
  const url = webhookUrl();
  if (!url) return false;
  const c = order.customer;
  const lines = order.lines.map((l) => `• ${l.name}${l.opt ? ` (${l.opt})` : ''} × ${l.qty} = ${won(l.total)}${l.sku ? ` [${l.sku}]` : ''}`).join('\n');
  const head = order.status === 'paid' ? '💳 결제 완료 주문' : '🏦 입금 대기 주문';
  const text = [
    `**${head}** — ${storeName || '내 가게'}`,
    `주문번호: ${order.orderId}`,
    lines,
    `배송비: ${order.shipping ? won(order.shipping) : '무료'} / **합계 ${won(order.total)}**`,
    `결제: ${order.method === 'toss' ? `토스페이먼츠 ${order.payment?.method || ''}${order.payment?.test ? ' (테스트)' : ''}` : '계좌이체 — 입금 확인 후 발송'}`,
    `받는 분: ${c.name} / ${c.phone}${c.email ? ` / ${c.email}` : ''}`,
    `주소: ${c.zip ? `(${c.zip}) ` : ''}${c.address} ${c.address2}`.trim(),
    c.memo ? `메모: ${c.memo}` : '',
  ].filter(Boolean).join('\n');
  const body = url.includes('hooks.slack.com') ? { text } : { content: text.slice(0, 1990), allowed_mentions: { parse: [] } };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('주문 알림을 보내지 못했어요 (' + r.status + ')');
  return true;
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

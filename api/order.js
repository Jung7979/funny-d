// 계좌이체(무통장입금) 주문 접수 — POST /api/order
import { loadData, quote, cleanCustomer, validOrderId, notify, webhookUrl, demoMode, readBody, send, num } from './_shop.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, message: 'POST로 보내 주세요.' });
  try {
    const body = await readBody(req);
    if (body.website) return send(res, 200, { ok: true, order: { orderId: body.orderId, status: 'pending', lines: [], total: 0 } }); // 스팸 봇
    if (!validOrderId(body.orderId)) return send(res, 400, { ok: false, message: '주문번호 형식이 달라요.' });
    if (!webhookUrl() && !demoMode()) return send(res, 503, { ok: false, message: '판매자가 아직 주문 알림을 연결하지 않았어요. (Vercel 환경변수 ORDER_WEBHOOK_URL)' });
    const data = await loadData(req);
    const bank = data.payment?.bank || {};
    if (bank.enabled === false || !bank.account) return send(res, 400, { ok: false, message: '계좌이체를 받지 않는 가게예요.' });
    const customer = cleanCustomer(body.customer);
    const q = quote(data, body.items);
    const hours = num(bank.dueHours) || 48;
    const due = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric' }).format(new Date(Date.now() + hours * 3600e3));
    const order = { orderId: body.orderId, method: 'bank', status: 'pending', ...q, customer, bank: { bankName: bank.bankName, account: bank.account, holder: bank.holder, due }, createdAt: new Date().toISOString() };
    const sent = await notify(order, data.store?.name);
    const { customer: _c, ...pub } = order;
    return send(res, 200, { ok: true, notified: sent, order: pub });
  } catch (e) {
    return send(res, 400, { ok: false, message: e.message || '주문을 받지 못했어요.' });
  }
}

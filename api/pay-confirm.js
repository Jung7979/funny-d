// 토스페이먼츠 결제 승인 — POST /api/pay-confirm
// 결제창에서 돌아오면 금액을 서버에서 다시 계산해 맞을 때만 승인해요.
// 시크릿 키는 Vercel 환경변수 TOSS_SECRET_KEY 에만 넣어요(코드·채팅에 쓰지 않기).
import { loadData, quote, cleanCustomer, validOrderId, notify, webhookUrl, demoMode, readBody, send, num } from './_shop.js';

const DOCS_CLIENT = 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm';
const DOCS_SECRET = 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6'; // 토스 공개 문서용 테스트 키(돈이 오가지 않아요)

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, message: 'POST로 보내 주세요.' });
  try {
    const body = await readBody(req);
    if (!validOrderId(body.orderId) || !body.paymentKey) return send(res, 400, { ok: false, message: '결제 정보가 올바르지 않아요.' });
    if (!webhookUrl() && !demoMode()) return send(res, 503, { ok: false, message: '판매자가 아직 주문 알림을 연결하지 않아 결제를 확정하지 않았어요. 돈은 빠져나가지 않았어요.' });
    const data = await loadData(req);
    const toss = data.payment?.toss || {};
    if (!toss.enabled || !toss.clientKey) return send(res, 400, { ok: false, message: '카드 결제를 받지 않는 가게예요.' });
    const secret = (process.env.TOSS_SECRET_KEY || '').trim() || (toss.clientKey === DOCS_CLIENT ? DOCS_SECRET : '');
    if (!secret) return send(res, 503, { ok: false, message: '판매자가 결제 시크릿 키를 아직 넣지 않았어요. 돈은 빠져나가지 않았어요.' });
    if (/^live_/.test(secret) !== /^live_/.test(toss.clientKey)) return send(res, 503, { ok: false, message: '결제 키(테스트/라이브) 짝이 맞지 않아요. 판매자에게 알려 주세요.' });
    const customer = cleanCustomer(body.customer);
    const q = quote(data, body.items);
    if (num(body.amount) !== q.total) return send(res, 400, { ok: false, message: `결제 금액(${num(body.amount)}원)이 주문 금액(${q.total}원)과 달라 승인하지 않았어요.` });

    const r = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(secret + ':').toString('base64'), 'Content-Type': 'application/json', 'Idempotency-Key': body.orderId },
      body: JSON.stringify({ paymentKey: body.paymentKey, orderId: body.orderId, amount: q.total }),
    });
    const pay = await r.json().catch(() => ({}));
    if (!r.ok) return send(res, 400, { ok: false, message: '결제 승인 실패: ' + (pay.message || r.status) });

    const order = { orderId: body.orderId, method: 'toss', status: 'paid', ...q, customer,
      payment: { method: pay.method || '', approvedAt: pay.approvedAt || '', test: /^test_/.test(secret), receipt: pay.receipt?.url || '' }, createdAt: new Date().toISOString() };
    let notified = false;
    try { notified = await notify(order, data.store?.name); } catch {}
    const { customer: _c, ...pub } = order;
    return send(res, 200, { ok: true, notified, order: pub });
  } catch (e) {
    return send(res, 400, { ok: false, message: e.message || '결제를 확인하지 못했어요.' });
  }
}

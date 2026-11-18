/* ============================================================
   실행학교 4주차 · 미니 쇼핑몰 키트 — 공통 스크립트
   ------------------------------------------------------------
   이 파일은 고치지 않아도 돼요(디자인은 shop.css 변수와 각 HTML에서).
   하는 일: 상품 데이터 읽기 · 가격 계산(정가/판매가/할인가) · 장바구니 ·
            목록/상세/장바구니/주문서/완료 화면 그리기 · 결제 요청
   상품 데이터: shop/products.json  (관리자 화면 shop/admin.html 또는 비서가 고쳐요)

   내 사이트 다른 페이지(홈 등)에서도 쓸 수 있어요.
     <link rel="stylesheet" href="shop/shop.css">
     <script src="shop/shop.js" defer></script>
     <a href="shop/cart.html" data-shop-cart>장바구니 <span data-shop-cart-count></span></a>
     <button data-shop-add="상품id">담기</button>          (옵션 있는 상품은 상세로 이동)
     <div data-shop-featured="3"></div>                   (추천 상품 카드 3개 자동 표시)
     <span data-shop-price="상품id">34,000원</span>        (지금 가격·할인으로 자동 교체, 품절이면 품절 표시)
   ============================================================ */
(function () {
  'use strict';

  var script = document.currentScript;
  var ROOT = new URL('../', script ? script.src : location.href).href; // shop/ 폴더가 있는 곳(사이트 맨 위)
  var SHOP = ROOT + 'shop/';
  var CART_KEY = 'shopkit-cart:' + new URL(ROOT).pathname;
  var PENDING_KEY = 'shopkit-pending:' + new URL(ROOT).pathname;
  var LAST_KEY = 'shopkit-last:' + new URL(ROOT).pathname;
  var TOSS_SDK = 'https://js.tosspayments.com/v2/standard';

  /* ───────── 작은 도구 ───────── */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function won(n) { return (Math.round(Number(n) || 0)).toLocaleString('ko-KR') + '원'; }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')); return isFinite(n) ? n : 0; }
  function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function img(path) {
    if (!path) return SHOP + 'images/placeholder.svg';
    if (/^(https?:)?\/\//.test(path) || path.indexOf('data:') === 0) return path;
    return ROOT + String(path).replace(/^\.?\//, '');
  }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function param(k) { return new URLSearchParams(location.search).get(k); }

  /* ───────── 가격 규칙 (api/_shop.js 와 똑같아야 해요) ─────────
     price      판매가 (필수)
     listPrice  정가·소비자가 (선택, 판매가보다 높으면 줄 그어 표시)
     salePrice  할인가 (선택, saleStart~saleEnd 기간에만. 비우면 기간 없이 계속)
     options    [{name:'색상', values:[{label:'화이트', add:0}, {label:'블랙', add:1000}]}]  */
  function saleActive(p, d) {
    var s = num(p.salePrice), b = num(p.price);
    if (!(s > 0) || !(s < b)) return false;
    d = d || today();
    if (p.saleStart && d < p.saleStart) return false;
    if (p.saleEnd && d > p.saleEnd) return false;
    return true;
  }
  function basePrice(p, d) { return saleActive(p, d) ? num(p.salePrice) : num(p.price); }
  function optionAdd(p, opts) {
    var add = 0, list = p.options || [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i], pick = (opts || [])[i];
      var v = (o.values || []).filter(function (x) { return x.label === pick; })[0];
      if (!v) return null; // 옵션이 바뀌었거나 안 골랐어요
      add += num(v.add);
    }
    return add;
  }
  function unitPrice(p, opts, d) { var a = optionAdd(p, opts); return a === null ? null : basePrice(p, d) + a; }
  function wasPrice(p, d) { var w = Math.max(num(p.listPrice), num(p.price)); return w > basePrice(p, d) ? w : 0; }
  function rate(p, d) { var w = wasPrice(p, d); return w ? Math.floor((1 - basePrice(p, d) / w) * 100) : 0; }
  function hasStock(p) { return p.stock === '' || p.stock === null || p.stock === undefined; }
  function sellable(p) { return p && p.status !== '숨김' && p.status !== '품절' && (hasStock(p) || num(p.stock) > 0); }
  function maxQty(p) { var m = num(p.maxQty) || 99; return hasStock(p) ? m : Math.min(m, num(p.stock)); }
  function shipping(settings, subtotal) {
    if (!subtotal) return 0;
    var free = num(settings.freeShippingOver);
    if (free > 0 && subtotal >= free) return 0;
    return num(settings.shippingFee);
  }
  function quote(data, lines, d) {
    d = d || today();
    var out = [], subtotal = 0, ok = lines.length > 0;
    lines.forEach(function (l) {
      var p = find(data, l.id), unit = p ? unitPrice(p, l.opts, d) : null, problem = '';
      if (!p || p.status === '숨김') problem = '판매가 끝난 상품이에요';
      else if (!sellable(p)) problem = '품절이에요';
      else if (unit === null) problem = '옵션이 바뀌었어요. 다시 골라 주세요';
      else if (l.qty > maxQty(p)) problem = '최대 ' + maxQty(p) + '개까지 살 수 있어요';
      if (problem) ok = false;
      var total = unit === null ? 0 : unit * l.qty;
      if (!problem) subtotal += total;
      out.push({ id: l.id, opts: l.opts || [], qty: l.qty, product: p, unit: unit, total: total, problem: problem });
    });
    var ship = shipping(data.store || {}, subtotal);
    return { lines: out, subtotal: subtotal, shipping: ship, total: subtotal + ship, ok: ok };
  }

  /* ───────── 데이터 ───────── */
  var dataPromise = null;
  function load() {
    if (!dataPromise) {
      dataPromise = fetch(SHOP + 'products.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('shop/products.json 을 읽지 못했어요 (' + r.status + ')'); return r.json(); })
        .then(function (d) { d.store = d.store || {}; d.payment = d.payment || {}; d.products = Array.isArray(d.products) ? d.products : []; return d; });
    }
    return dataPromise;
  }
  function find(data, id) { return (data.products || []).filter(function (p) { return p.id === id; })[0] || null; }
  function visible(data) { return (data.products || []).filter(function (p) { return p.status !== '숨김'; }); }

  /* ───────── 장바구니 ───────── */
  function cart() { var c = store(CART_KEY); return Array.isArray(c) ? c : []; }
  function saveCart(c) { store(CART_KEY, c); paintCount(); }
  function sameOpts(a, b) { return JSON.stringify(a || []) === JSON.stringify(b || []); }
  function add(id, opts, qty) {
    var c = cart(), hit = c.filter(function (l) { return l.id === id && sameOpts(l.opts, opts); })[0];
    if (hit) hit.qty += qty || 1; else c.push({ id: id, opts: opts || [], qty: qty || 1 });
    saveCart(c);
  }
  function count() { return cart().reduce(function (s, l) { return s + (l.qty || 0); }, 0); }
  function paintCount() {
    var n = count();
    $$('[data-shop-cart-count]').forEach(function (el) { el.textContent = n; el.setAttribute('data-zero', n ? '0' : '1'); });
    $$('[data-shop-cart]').forEach(function (el) { el.setAttribute('aria-label', '장바구니, ' + n + '개'); });
  }

  var toastTimer;
  function toast(msg, link) {
    var t = $('.sk-toast');
    if (!t) { t = document.createElement('div'); t.className = 'sk-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (link ? '<a href="' + SHOP + 'cart.html">장바구니 보기 →</a>' : '');
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  /* ───────── 공통 조각 ───────── */
  function priceHtml(p, big) {
    var d = today(), was = wasPrice(p, d), r = rate(p, d);
    var h = '<div class="sk-price' + (big ? ' sk-price--big' : '') + '">' +
      (r > 0 ? '<span class="sk-price__rate">' + r + '%</span>' : '') +
      '<span class="sk-price__now">' + won(basePrice(p, d)) + '</span>' +
      (was ? '<span class="sk-price__was">' + won(was) + '</span>' : '') + '</div>';
    if (big && saleActive(p, d) && p.saleEnd) h += '<div class="sk-sale-until">할인 ' + esc(p.saleEnd.slice(5).replace('-', '/')) + '까지</div>';
    return h;
  }
  function badgesHtml(p) {
    var b = [], r = rate(p);
    if (!sellable(p)) b.push('<span class="sk-badge sk-badge--out">품절</span>');
    else if (r > 0) b.push('<span class="sk-badge sk-badge--sale">' + r + '% 할인</span>');
    (p.badges || []).forEach(function (x) { b.push('<span class="sk-badge">' + esc(x) + '</span>'); });
    return b.length ? '<div class="sk-badges">' + b.join('') + '</div>' : '';
  }
  function cardHtml(p) {
    return '<a class="sk-card' + (sellable(p) ? '' : ' is-out') + '" href="' + SHOP + 'product.html?id=' + encodeURIComponent(p.id) + '">' +
      '<div class="sk-card__pic"><img src="' + esc(img((p.images || [])[0])) + '" alt="' + esc(p.name) + '" loading="lazy">' + badgesHtml(p) + '</div>' +
      '<div class="sk-card__body"><div class="sk-card__name">' + esc(p.name) + '</div>' +
      (p.summary ? '<div class="sk-card__sum">' + esc(p.summary) + '</div>' : '') + priceHtml(p) + '</div></a>';
  }
  function optText(p, opts) {
    return (p && p.options || []).map(function (o, i) { return o.name + ': ' + (opts[i] || '-'); }).join(' · ');
  }
  // 상세 설명(한국형 긴 상세페이지). 빈 줄로 덩어리를 나눠요.
  //   # 큰 문구          → 가운데 큰 헤드카피
  //   ## 소제목           → 섹션 제목 (## POINT 1 | 제목 → 포인트 머리표)
  //   > 문장              → 강조 박스
  //   - 목록  /  1. 목록  → 목록 / 번호 카드
  //   | 항목 | 내용 |     → 표
  //   ![설명](사진주소)   → 사진 (여러 줄이면 틈 없이 이어 붙임)
  //   ---                 → 여백 구분선 · **굵게**
  function md(text) {
    var blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/);
    var inline = function (s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); };
    var IMG = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
    return blocks.map(function (b) {
      b = b.trim(); if (!b) return '';
      var lines = b.split('\n').map(function (l) { return l.trim(); });
      if (lines.every(function (l) { return IMG.test(l); })) {
        return '<div class="sk-md-pics">' + lines.map(function (l) { var m = l.match(IMG); return '<img src="' + esc(img(m[2])) + '" alt="' + esc(m[1]) + '" loading="lazy">'; }).join('') + '</div>';
      }
      if (/^-{3,}$/.test(b)) return '<hr class="sk-md-gap">';
      if (b.indexOf('## ') === 0) {
        var pt = b.slice(3).match(/^(POINT\s*\d+|포인트\s*\d+|STEP\s*\d+)\s*\|\s*(.+)$/i);
        if (pt) return '<h3 class="sk-md-point"><span>' + esc(pt[1]) + '</span>' + inline(pt[2]) + '</h3>';
        return '<h3>' + inline(b.slice(3)) + '</h3>';
      }
      if (b.indexOf('# ') === 0) return '<h2 class="sk-md-hero">' + lines.map(function (l) { return inline(l.replace(/^#\s+/, '')); }).join('<br>') + '</h2>';
      if (b.charAt(0) === '>') return '<blockquote>' + lines.map(function (l) { return inline(l.replace(/^>\s?/, '')); }).join('<br>') + '</blockquote>';
      if (lines.every(function (l) { return /^\|.*\|$/.test(l); })) {
        var rows = lines.filter(function (l) { return !/^\|[\s:|-]+\|$/.test(l); }).map(function (l) { return l.slice(1, -1).split('|').map(function (c) { return c.trim(); }); });
        return '<div class="sk-md-table"><table>' + rows.map(function (r, ri) { var t = ri ? 'td' : 'th'; return '<tr>' + r.map(function (c) { return '<' + t + '>' + inline(c) + '</' + t + '>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
      }
      if (/^\d+\.\s/.test(b)) return '<ol class="sk-md-points">' + lines.map(function (li) { return '<li>' + inline(li.replace(/^\d+\.\s*/, '')) + '</li>'; }).join('') + '</ol>';
      if (/^- /.test(b)) return '<ul>' + lines.map(function (li) { return '<li>' + inline(li.replace(/^- /, '')) + '</li>'; }).join('') + '</ul>';
      if (IMG.test(b)) { var m = b.match(IMG); return '<img src="' + esc(img(m[2])) + '" alt="' + esc(m[1]) + '" loading="lazy">'; }
      return '<p>' + inline(b).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  // 교환·반품 안내 기본 문구 (상점 설정에서 바꿀 수 있어요)
  var RETURN_DEFAULT = '## 교환·반품 신청\n\n상품을 받은 날부터 7일 안에 문의처로 연락해 주세요.\n\n## 교환·반품 배송비\n\n- 단순 변심: 왕복 배송비를 고객님이 부담해요.\n- 상품 불량·오배송: 배송비를 판매자가 부담해요.\n\n## 교환·반품이 어려운 경우\n\n- 받은 날부터 7일이 지난 경우\n- 포장을 뜯었거나 사용해서 상품 가치가 떨어진 경우 (식품·소모품)\n- 고객님 책임으로 상품이 망가진 경우\n\n## 환불\n\n돌려받은 상품을 확인한 뒤 3영업일 안에 결제한 수단으로 환불해요.';

  function fail(el, err) { if (el) el.innerHTML = '<div class="sk-error">' + esc(err && err.message || err) + '</div>'; }
  function setMeta(title, desc) {
    if (title) document.title = title;
    var m = $('meta[name="description"]');
    if (desc) { if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); } m.content = desc; }
  }

  /* ───────── 화면: 목록 ───────── */
  function pageList() {
    var box = $('[data-shop-list]'), chips = $('[data-shop-cats]');
    load().then(function (data) {
      var all = visible(data);
      if (!all.length) { box.innerHTML = '<div class="sk-empty">아직 등록한 상품이 없어요.<br>관리자 화면(shop/admin.html)이나 비서에게 상품 등록을 맡겨 보세요.</div>'; return; }
      var cats = [];
      all.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
      var cur = param('cat') || '';
      function paint() {
        var list = cur ? all.filter(function (p) { return p.category === cur; }) : all;
        box.innerHTML = '<div class="sk-grid">' + list.map(cardHtml).join('') + '</div>';
        if (chips) $$('.sk-chip', chips).forEach(function (c) { c.setAttribute('aria-pressed', c.dataset.cat === cur ? 'true' : 'false'); });
      }
      if (chips && cats.length > 1) {
        chips.innerHTML = '<button type="button" class="sk-chip" data-cat="">전체</button>' + cats.map(function (c) { return '<button type="button" class="sk-chip" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('');
        chips.addEventListener('click', function (e) { var b = e.target.closest('.sk-chip'); if (!b) return; cur = b.dataset.cat; paint(); });
      }
      paint();
    }).catch(function (e) { fail(box, e); });
  }

  /* ───────── 화면: 상세 ───────── */
  // 한국형 긴 상세: 탭(상세정보·상품정보고시·배송/교환/반품) + 접기 + 하단 구매바
  function longHtml(p, st, shipNote) {
    var notice = (p.notice || []).filter(function (s) { return s && s.k; });
    var dimgs = (p.detailImages || []).filter(Boolean);
    var hasDetail = !!(p.detail || dimgs.length);
    var tabs = [];
    if (hasDetail) tabs.push(['detail', '상세정보']);
    if (notice.length) tabs.push(['notice', '상품정보고시']);
    tabs.push(['ship', '배송·교환·반품']);
    var contact = st.contact ? '\n\n문의: ' + st.contact : '';
    return '<nav class="sk-tabs" aria-label="상품 안내"><div class="sk-tabs__in">' + tabs.map(function (t, i) { return '<a href="#sk-tab-' + t[0] + '" aria-current="' + (i ? 'false' : 'true') + '">' + t[1] + '</a>'; }).join('') + '</div></nav>' +
      (hasDetail ? '<section class="sk-section sk-long" id="sk-tab-detail"><h2 class="sk-sr">상세정보</h2><div class="sk-long__body"><div class="sk-md">' + md(p.detail) + '</div>' +
        (dimgs.length ? '<div class="sk-md-pics">' + dimgs.map(function (s) { return '<img src="' + esc(img(s)) + '" alt="' + esc(p.name) + ' 상세" loading="lazy">'; }).join('') + '</div>' : '') +
        '</div><div class="sk-long__more"><button type="button" class="sk-btn sk-btn--line" data-more>상세정보 펼쳐보기 ▾</button></div></section>' : '') +
      (notice.length ? '<section class="sk-section" id="sk-tab-notice"><h2>상품정보제공고시</h2><div class="sk-md-table"><table class="sk-notice">' + notice.map(function (s) { return '<tr><th>' + esc(s.k) + '</th><td>' + esc(s.v) + '</td></tr>'; }).join('') + '</table></div></section>' : '') +
      '<section class="sk-section" id="sk-tab-ship"><h2>배송·교환·반품</h2><div class="sk-md-table"><table class="sk-notice"><tr><th>배송비</th><td>' + esc(shipNote) + '</td></tr>' +
        (st.shippingNote ? '<tr><th>배송 안내</th><td>' + esc(st.shippingNote) + '</td></tr>' : '') + (st.contact ? '<tr><th>문의</th><td>' + esc(st.contact) + '</td></tr>' : '') + '</table></div>' +
        '<div class="sk-md sk-md--small">' + md(st.returnPolicy || RETURN_DEFAULT + contact) + '</div></section>';
  }
  function longWire(box) {
    // 긴 상세는 처음엔 접어 두고 '펼쳐보기'로 열어요 (사진이 뜰 때마다 높이를 다시 재요)
    var lg = $('.sk-long', box);
    function measure() { if (lg && !lg.classList.contains('is-open')) lg.classList.toggle('is-folded', $('.sk-long__body', lg).scrollHeight > 1700); }
    if (lg) { measure(); $$('img', lg).forEach(function (i) { i.addEventListener('load', measure); }); window.addEventListener('load', measure); }
    // 탭: 지금 보고 있는 구역에 밑줄
    var links = $$('.sk-tabs a', box);
    if (links.length && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) links.forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('href') === '#' + e.target.id ? 'true' : 'false'); }); });
      }, { rootMargin: '-45% 0px -50% 0px' });
      links.forEach(function (a) { var t = $(a.getAttribute('href'), box); if (t) io.observe(t); });
    }
    // 하단 구매바: 위쪽 구매 버튼이 화면 위로 지나가면 보여요
    var bar = $('[data-buybar]', box), acts = $('.sk-actions', box);
    if (bar && acts && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        var show = !es[0].isIntersecting && es[0].boundingClientRect.top < 0;
        bar.classList.toggle('is-on', show); bar.setAttribute('aria-hidden', show ? 'false' : 'true');
        document.body.classList.toggle('sk-buybar-on', show);
      }).observe(acts);
    }
  }
  function pageProduct() {
    var box = $('[data-shop-product]');
    load().then(function (data) {
      var p = find(data, param('id'));
      if (!p || p.status === '숨김') { box.innerHTML = '<div class="sk-empty">찾는 상품이 없어요. <a href="' + SHOP + '">전체 상품 보기</a></div>'; return; }
      setMeta(p.name + ' — ' + (data.store.name || '쇼핑'), p.summary || p.name);
      var pics = (p.images && p.images.length ? p.images : ['']).map(img);
      var opts = (p.options || []).map(function () { return ''; });
      var qty = 1, can = sellable(p);
      var specs = (p.specs || []).filter(function (s) { return s && s.k; });
      var st = data.store || {};
      var shipNote = num(st.freeShippingOver) > 0 ? won(st.shippingFee) + ' (' + won(st.freeShippingOver) + ' 이상 무료)' : (num(st.shippingFee) ? won(st.shippingFee) : '무료');
      box.innerHTML =
        '<div class="sk-crumb"><a href="' + ROOT + '">홈</a> · <a href="' + SHOP + '">쇼핑</a>' + (p.category ? ' · <a href="' + SHOP + '?cat=' + encodeURIComponent(p.category) + '">' + esc(p.category) + '</a>' : '') + '</div>' +
        '<div class="sk-detail"><div class="sk-gallery"><div class="sk-gallery__main"><img src="' + esc(pics[0]) + '" alt="' + esc(p.name) + '"></div>' +
        (pics.length > 1 ? '<div class="sk-thumbs">' + pics.map(function (s, i) { return '<button type="button" data-pic="' + i + '" aria-current="' + (i ? 'false' : 'true') + '" aria-label="사진 ' + (i + 1) + '"><img src="' + esc(s) + '" alt=""></button>'; }).join('') + '</div>' : '') + '</div>' +
        '<div class="sk-info">' + (p.sku ? '<div class="sk-sku">제품번호 ' + esc(p.sku) + '</div>' : '') +
        '<h1>' + esc(p.name) + '</h1>' + (p.summary ? '<p class="sk-summary">' + esc(p.summary) + '</p>' : '') + priceHtml(p, true) +
        '<dl class="sk-rows"><div><dt>배송비</dt><dd>' + esc(shipNote) + '</dd></div>' +
        (st.shippingNote ? '<div><dt>배송</dt><dd>' + esc(st.shippingNote) + '</dd></div>' : '') +
        specs.map(function (s) { return '<div><dt>' + esc(s.k) + '</dt><dd>' + esc(s.v) + '</dd></div>'; }).join('') +
        (!hasStock(p) && can && num(p.stock) <= 5 ? '<div><dt>재고</dt><dd style="color:var(--sk-accent)">' + num(p.stock) + '개 남았어요</dd></div>' : '') + '</dl>' +
        (p.options || []).map(function (o, i) {
          return '<div class="sk-field"><label for="sk-opt-' + i + '">' + esc(o.name) + '</label><select id="sk-opt-' + i + '" data-opt="' + i + '"><option value="">' + esc(o.name) + ' 선택</option>' +
            (o.values || []).map(function (v) { return '<option value="' + esc(v.label) + '">' + esc(v.label) + (num(v.add) ? ' (+' + won(v.add) + ')' : '') + '</option>'; }).join('') + '</select></div>';
        }).join('') +
        '<div class="sk-field"><span class="sk-label">수량</span><div class="sk-qty"><button type="button" data-q="-1" aria-label="수량 줄이기">−</button><span data-qv>1</span><button type="button" data-q="1" aria-label="수량 늘리기">+</button></div></div>' +
        '<div class="sk-total"><span>합계</span><b data-sum>' + won(basePrice(p)) + '</b></div>' +
        '<div class="sk-actions"><button type="button" class="sk-btn sk-btn--line" data-act="cart"' + (can ? '' : ' disabled') + '>장바구니 담기</button>' +
        '<button type="button" class="sk-btn" data-act="buy"' + (can ? '' : ' disabled') + '>' + (can ? '바로 구매' : '품절') + '</button></div>' +
        '<p class="sk-muted" data-msg style="font-size:13px;min-height:20px;margin-top:10px"></p></div></div>' +
        longHtml(p, st, shipNote) +
        (can ? '<div class="sk-buybar" data-buybar aria-hidden="true"><div class="sk-buybar__in"><div class="sk-buybar__name"><b>' + esc(p.name) + '</b><span data-bsum>' + won(basePrice(p)) + '</span></div>' +
          '<button type="button" class="sk-btn sk-btn--line" data-bact="cart">장바구니</button><button type="button" class="sk-btn" data-bact="buy">구매하기</button></div></div>' : '');

      var sum = $('[data-sum]', box), qv = $('[data-qv]', box), msg = $('[data-msg]', box);
      function repaint() {
        var u = unitPrice(p, opts);
        sum.textContent = u === null ? won(basePrice(p) * qty) + ' ~' : won(u * qty);
        qv.textContent = qty;
        var bs = $('[data-bsum]', box); if (bs) bs.textContent = sum.textContent;
      }
      box.addEventListener('change', function (e) { var s = e.target.closest('[data-opt]'); if (!s) return; opts[+s.dataset.opt] = s.value; msg.textContent = ''; repaint(); });
      box.addEventListener('click', function (e) {
        var t = e.target.closest('button'); if (!t) return;
        if (t.dataset.bact) { var top = $('[data-act="' + t.dataset.bact + '"]', box); top.click(); if (msg.textContent) $('.sk-info', box).scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        if (t.dataset.more !== undefined) { var lg = $('.sk-long', box), open = lg.classList.toggle('is-open'); t.textContent = open ? '상세정보 접기 ▴' : '상세정보 펼쳐보기 ▾'; if (!open) lg.scrollIntoView({ block: 'start' }); return; }
        if (t.dataset.pic !== undefined) { $('.sk-gallery__main img', box).src = pics[+t.dataset.pic]; $$('.sk-thumbs button', box).forEach(function (b) { b.setAttribute('aria-current', b === t ? 'true' : 'false'); }); }
        if (t.dataset.q) { qty = Math.max(1, Math.min(maxQty(p) || 1, qty + (+t.dataset.q))); repaint(); }
        if (t.dataset.act) {
          var miss = (p.options || []).filter(function (o, i) { return !opts[i]; })[0];
          if (miss) { msg.textContent = miss.name + '을(를) 골라 주세요.'; return; }
          add(p.id, opts.slice(), qty);
          if (t.dataset.act === 'buy') location.href = SHOP + 'checkout.html';
          else toast('장바구니에 담았어요', true);
        }
      });
      repaint();
      longWire(box);
      // 검색·AI가 읽는 상품 정보 (화면에 보이는 사실만)
      var ld = document.createElement('script'); ld.type = 'application/ld+json';
      ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.sku || undefined, description: p.summary || undefined, image: pics.filter(Boolean),
        offers: { '@type': 'Offer', priceCurrency: 'KRW', price: basePrice(p), availability: can ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: location.href } });
      document.head.appendChild(ld);
    }).catch(function (e) { fail(box, e); });
  }

  /* ───────── 화면: 장바구니 ───────── */
  function linesHtml(q, editable) {
    return q.lines.map(function (l, i) {
      var p = l.product || { name: '(없는 상품)', images: [] };
      return '<div class="sk-line"><img src="' + esc(img((p.images || [])[0])) + '" alt="">' +
        '<div><div class="sk-line__name">' + esc(p.name) + '</div>' + (l.opts.length ? '<div class="sk-line__opt">' + esc(optText(p, l.opts)) + '</div>' : '') +
        (l.unit !== null ? '<div class="sk-line__opt">' + won(l.unit) + (editable ? '' : ' × ' + l.qty) + '</div>' : '') +
        (l.problem ? '<div class="sk-line__warn">' + esc(l.problem) + '</div>' : '') + '</div>' +
        '<div class="sk-line__side">' + (editable ? '<span class="sk-qty"><button type="button" data-dec="' + i + '" aria-label="수량 줄이기">−</button><span>' + l.qty + '</span><button type="button" data-inc="' + i + '" aria-label="수량 늘리기">+</button></span>' : '') +
        '<b>' + won(l.total) + '</b>' + (editable ? '<button type="button" class="sk-line__kill" data-kill="' + i + '">삭제</button>' : '') + '</div></div>';
    }).join('');
  }
  function sumHtml(q, st) {
    var free = num(st.freeShippingOver), left = free - q.subtotal;
    return '<div class="sk-sum"><div><span>상품 금액</span><span>' + won(q.subtotal) + '</span></div>' +
      '<div><span>배송비</span><span>' + (q.shipping ? won(q.shipping) : '무료') + '</span></div>' +
      '<div class="sk-sum__total"><span>결제 금액</span><span>' + won(q.total) + '</span></div></div>' +
      (free > 0 && q.subtotal > 0 && left > 0 && q.shipping ? '<p class="sk-free">' + won(left) + ' 더 담으면 무료배송이에요</p>' : '');
  }
  function pageCart() {
    var box = $('[data-shop-cart-page]');
    load().then(function (data) {
      function paint() {
        var c = cart();
        if (!c.length) { box.innerHTML = '<div class="sk-empty">장바구니가 비어 있어요.<br><a class="sk-btn" style="margin-top:16px" href="' + SHOP + '">상품 보러 가기</a></div>'; return; }
        var q = quote(data, c);
        box.innerHTML = '<div class="sk-cols"><div class="sk-panel">' + linesHtml(q, true) + '</div>' +
          '<div class="sk-panel sk-sticky">' + sumHtml(q, data.store) +
          '<a class="sk-btn sk-btn--block" href="' + SHOP + 'checkout.html"' + (q.ok ? '' : ' aria-disabled="true" onclick="return false"') + '>주문하기</a>' +
          (q.ok ? '' : '<p class="sk-line__warn" style="margin-top:10px">빨간 글씨가 있는 상품을 정리하면 주문할 수 있어요.</p>') +
          '<a class="sk-btn sk-btn--line sk-btn--block" style="margin-top:8px" href="' + SHOP + '">계속 쇼핑하기</a></div></div>';
      }
      box.addEventListener('click', function (e) {
        var t = e.target.closest('button'); if (!t) return;
        var c = cart(), i;
        if (t.dataset.inc !== undefined) { i = +t.dataset.inc; var p = find(data, c[i].id); c[i].qty = Math.min(p ? maxQty(p) || 1 : 1, c[i].qty + 1); }
        else if (t.dataset.dec !== undefined) { i = +t.dataset.dec; c[i].qty = Math.max(1, c[i].qty - 1); }
        else if (t.dataset.kill !== undefined) { c.splice(+t.dataset.kill, 1); }
        else return;
        saveCart(c); paint();
      });
      paint();
    }).catch(function (e) { fail(box, e); });
  }

  /* ───────── 화면: 주문서 · 결제 ───────── */
  function orderId() {
    var d = today().replace(/-/g, ''), r = '';
    var a = new Uint8Array(6); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
    for (var i = 0; i < a.length; i++) r += 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[a[i] % 32];
    return 'ORD-' + d + '-' + r;
  }
  function orderName(q) {
    var first = q.lines[0] && q.lines[0].product ? q.lines[0].product.name : '주문';
    return q.lines.length > 1 ? first + ' 외 ' + (q.lines.length - 1) + '건' : first;
  }
  function loadToss() {
    if (window.TossPayments) return Promise.resolve();
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = TOSS_SDK; s.onload = ok; s.onerror = function () { no(new Error('토스페이먼츠 결제창을 불러오지 못했어요.')); }; document.head.appendChild(s); });
  }
  function api(path, body) {
    return fetch(ROOT + 'api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = JSON.parse(t); } catch (e) {}
          if (!r.ok || !j || !j.ok) throw new Error((j && j.message) || (r.status === 404 ? '주문 접수 창구(api 폴더)가 아직 없어요. 키트 설치를 다시 확인해 주세요.' : '주문 접수 중 문제가 생겼어요 (' + r.status + ')'));
          return j;
        });
      });
  }
  function pageCheckout() {
    var box = $('[data-shop-checkout]');
    var failMsg = param('fail') ? (param('message') || '결제가 취소됐거나 실패했어요.') : '';
    load().then(function (data) {
      var c = cart();
      if (!c.length) { box.innerHTML = '<div class="sk-empty">주문할 상품이 없어요.<br><a class="sk-btn" style="margin-top:16px" href="' + SHOP + '">상품 보러 가기</a></div>'; return; }
      var q = quote(data, c);
      if (!q.ok) { location.replace(SHOP + 'cart.html'); return; }
      var pay = data.payment || {}, bank = pay.bank || {}, toss = pay.toss || {};
      var bankOn = bank.enabled !== false && bank.account, tossOn = toss.enabled && toss.clientKey;
      var methods = (tossOn ? '<label><input type="radio" name="method" value="toss"' + (tossOn ? ' checked' : '') + '><span><b>카드 · 간편결제</b><small>토스페이먼츠 결제창' + (/^test_/.test(toss.clientKey) ? ' (지금은 테스트 모드 · 실제로 돈이 나가지 않아요)' : '') + '</small></span></label>' : '') +
        (bankOn ? '<label><input type="radio" name="method" value="bank"' + (tossOn ? '' : ' checked') + '><span><b>계좌이체 (무통장입금)</b><small>' + esc(bank.bankName || '') + ' · 주문 후 ' + (num(bank.dueHours) || 48) + '시간 안에 입금하면 확인 후 보내드려요</small></span></label>' : '');
      if (!methods) { box.innerHTML = '<div class="sk-error">판매자가 아직 결제 방법을 설정하지 않았어요. (관리자 화면 → 상점 설정 → 결제)</div>'; return; }
      box.innerHTML = (failMsg ? '<div class="sk-error" style="margin-bottom:16px">' + esc(failMsg) + '</div>' : '') +
        '<form class="sk-cols" novalidate><div>' +
        '<div class="sk-panel"><h2>주문하는 분</h2><div class="sk-grid2"><div class="sk-field"><label for="sk-name">이름</label><input id="sk-name" name="name" autocomplete="name" required maxlength="30"></div>' +
        '<div class="sk-field"><label for="sk-phone">휴대폰</label><input id="sk-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="01012345678" required maxlength="20"></div></div>' +
        '<div class="sk-field"><label for="sk-email">이메일 (선택)</label><input id="sk-email" name="email" type="email" autocomplete="email" maxlength="80"></div></div>' +
        '<div class="sk-panel"><h2>받는 곳</h2><div class="sk-field"><label for="sk-addr">주소</label><input id="sk-addr" name="address" autocomplete="street-address" placeholder="도로명 주소" required maxlength="120"></div>' +
        '<div class="sk-grid2"><div class="sk-field"><label for="sk-addr2">상세 주소</label><input id="sk-addr2" name="address2" maxlength="80"></div><div class="sk-field"><label for="sk-zip">우편번호 (선택)</label><input id="sk-zip" name="zip" inputmode="numeric" maxlength="7"></div></div>' +
        '<div class="sk-field"><label for="sk-memo">배송 메모 (선택)</label><input id="sk-memo" name="memo" maxlength="100" placeholder="예) 문 앞에 두고 가 주세요"></div>' +
        '<input class="sk-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"></div>' +
        '<div class="sk-panel"><h2>결제 방법</h2><div class="sk-pay">' + methods + '</div><div data-toss style="margin-top:12px"><div id="sk-toss-methods"></div><div id="sk-toss-agree"></div></div></div></div>' +
        '<div><div class="sk-panel sk-sticky"><h2>주문 상품</h2>' + linesHtml(q, false) + sumHtml(q, data.store) +
        '<label class="sk-agree"><input type="checkbox" name="agree" required><span>주문 처리·배송을 위해 이름·연락처·주소를 판매자에게 전달하는 데 동의해요.</span></label>' +
        '<button class="sk-btn sk-btn--block" type="submit" data-go>' + won(q.total) + ' 주문하기</button><p class="sk-line__warn" data-err role="alert" style="min-height:18px"></p>' +
        '<a class="sk-muted" style="font-size:13px" href="' + SHOP + 'cart.html">← 장바구니로</a></div></div></form>';

      var form = $('form', box), err = $('[data-err]', box), go = $('[data-go]', box), tossBox = $('[data-toss]', box);
      var widgets = null, tossReady = null;
      function method() { var m = $('input[name="method"]:checked', box); return m ? m.value : ''; }
      function syncMethod() {
        var isToss = method() === 'toss';
        tossBox.hidden = !isToss;
        if (isToss && !tossReady) {
          tossReady = loadToss().then(function () {
            widgets = window.TossPayments(toss.clientKey).widgets({ customerKey: window.TossPayments.ANONYMOUS });
            return widgets.setAmount({ currency: 'KRW', value: q.total });
          }).then(function () {
            return Promise.all([widgets.renderPaymentMethods({ selector: '#sk-toss-methods', variantKey: 'DEFAULT' }), widgets.renderAgreement({ selector: '#sk-toss-agree', variantKey: 'AGREEMENT' })]);
          }).catch(function (e) { err.textContent = (e && e.message) || '결제창을 띄우지 못했어요.'; tossReady = null; throw e; });
        }
      }
      box.addEventListener('change', function (e) { if (e.target.name === 'method') syncMethod(); });
      syncMethod();

      form.addEventListener('submit', function (e) {
        e.preventDefault(); err.textContent = '';
        var f = new FormData(form), g = function (k) { return String(f.get(k) || '').trim(); };
        var phone = g('phone').replace(/[^0-9]/g, '');
        if (!g('name')) return (err.textContent = '이름을 적어 주세요.');
        if (!/^01[0-9]{8,9}$/.test(phone)) return (err.textContent = '휴대폰 번호를 숫자로 적어 주세요. 예) 01012345678');
        if (!g('address')) return (err.textContent = '받는 주소를 적어 주세요.');
        if (!f.get('agree')) return (err.textContent = '개인정보 전달에 동의해 주세요.');
        var customer = { name: g('name'), phone: phone, email: g('email'), address: g('address'), address2: g('address2'), zip: g('zip'), memo: g('memo') };
        var items = cart().map(function (l) { return { id: l.id, opts: l.opts || [], qty: l.qty }; });
        var id = orderId();
        go.disabled = true; go.textContent = '처리 중…';
        var done = function () { go.disabled = false; go.textContent = won(q.total) + ' 주문하기'; };
        if (method() === 'bank') {
          api('order', { method: 'bank', orderId: id, items: items, customer: customer, website: g('website') }).then(function (res) {
            store(LAST_KEY, res.order); saveCart([]);
            location.href = SHOP + 'complete.html?order=' + encodeURIComponent(res.order.orderId);
          }).catch(function (e2) { err.textContent = e2.message; done(); });
        } else {
          if (!tossReady) syncMethod();
          tossReady.then(function () {
            store(PENDING_KEY, { orderId: id, amount: q.total, items: items, customer: customer });
            return widgets.requestPayment({ orderId: id, orderName: orderName(q), customerName: customer.name, customerMobilePhone: phone, customerEmail: customer.email || undefined,
              successUrl: SHOP + 'complete.html', failUrl: SHOP + 'checkout.html?fail=1' });
          }).catch(function (e2) { err.textContent = (e2 && e2.message) || '결제를 시작하지 못했어요.'; done(); });
        }
      });
    }).catch(function (e) { fail(box, e); });
  }

  /* ───────── 화면: 주문 완료 ───────── */
  function completeHtml(o) {
    var bank = o.bank;
    return '<div class="sk-panel"><div class="sk-done"><div class="sk-check" aria-hidden="true">✓</div>' +
      '<h1 style="margin:0 0 6px">' + (o.status === 'paid' ? '결제가 끝났어요' : '주문을 받았어요') + '</h1>' +
      '<p class="sk-muted">주문번호 <b>' + esc(o.orderId) + '</b></p></div>' +
      (bank ? '<div class="sk-bank">아래 계좌로 <b>' + won(o.total) + '</b>을 입금해 주세요.<br><b>' + esc(bank.bankName) + ' ' + esc(bank.account) + '</b><br>예금주 ' + esc(bank.holder) +
        (bank.due ? '<br><span class="sk-muted">입금 기한: ' + esc(bank.due) + ' · 입금자명은 주문하신 분 이름으로 해 주세요</span>' : '') + '</div>' : '') +
      '<dl class="sk-rows">' + (o.lines || []).map(function (l) { return '<div><dt>' + esc(l.name) + (l.opt ? ' (' + esc(l.opt) + ')' : '') + ' × ' + l.qty + '</dt><dd>' + won(l.total) + '</dd></div>'; }).join('') +
      '<div><dt>배송비</dt><dd>' + (o.shipping ? won(o.shipping) : '무료') + '</dd></div><div><dt><b>합계</b></dt><dd><b>' + won(o.total) + '</b></dd></div></dl>' +
      '<p class="sk-muted" style="font-size:14px;line-height:1.7">주문 내용은 판매자에게 바로 전달됐어요. 궁금한 점은 판매자 연락처로 주문번호와 함께 문의해 주세요.</p>' +
      '<a class="sk-btn sk-btn--line" href="' + SHOP + '">쇼핑 계속하기</a></div>';
  }
  function pageComplete() {
    var box = $('[data-shop-complete]');
    var paymentKey = param('paymentKey'), oid = param('orderId'), amount = param('amount');
    if (paymentKey && oid) {
      var pend = store(PENDING_KEY);
      if (!pend || pend.orderId !== oid) {
        var last = store(LAST_KEY);
        if (last && last.orderId === oid) { box.innerHTML = completeHtml(last); return; }
        box.innerHTML = '<div class="sk-error">주문 정보를 이 브라우저에서 찾지 못했어요. 결제는 아직 확정되지 않았어요. 주문한 기기·브라우저에서 다시 열어 주세요.</div>'; return;
      }
      box.innerHTML = '<div class="sk-empty">결제를 확인하는 중이에요…</div>';
      api('pay-confirm', { paymentKey: paymentKey, orderId: oid, amount: Number(amount), items: pend.items, customer: pend.customer }).then(function (res) {
        store(LAST_KEY, res.order); store(PENDING_KEY, null); saveCart([]);
        history.replaceState(null, '', SHOP + 'complete.html?order=' + encodeURIComponent(oid));
        box.innerHTML = completeHtml(res.order);
      }).catch(function (e) { box.innerHTML = '<div class="sk-error">' + esc(e.message) + '</div><p style="margin-top:16px"><a class="sk-btn sk-btn--line" href="' + SHOP + 'checkout.html">주문서로 돌아가기</a></p>'; });
      return;
    }
    var o = store(LAST_KEY);
    if (o && (!param('order') || o.orderId === param('order'))) box.innerHTML = completeHtml(o);
    else box.innerHTML = '<div class="sk-empty">최근 주문을 찾지 못했어요. <a href="' + SHOP + '">쇼핑하러 가기</a></div>';
  }

  /* ───────── 다른 페이지에서 쓰는 버튼·카드 ───────── */
  function featured() {
    $$('[data-shop-featured]').forEach(function (box) {
      var n = num(box.getAttribute('data-shop-featured')) || 3;
      load().then(function (data) {
        var list = visible(data), pick = list.filter(function (p) { return p.featured; });
        pick = (pick.length ? pick : list).slice(0, n);
        box.innerHTML = pick.length ? '<div class="sk-grid">' + pick.map(cardHtml).join('') + '</div>' : '';
      }).catch(function () {});
    });
  }
  function livePrices() {
    var els = $$('[data-shop-price]'); if (!els.length) return;
    load().then(function (data) {
      els.forEach(function (el) {
        var p = find(data, el.getAttribute('data-shop-price')); if (!p) return;
        el.innerHTML = priceHtml(p) + (sellable(p) ? '' : '<span class="sk-soldout-tag">품절</span>');
      });
    }).catch(function () {});
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-shop-add],[data-shop-buy]'); if (!b) return;
    e.preventDefault();
    var id = b.getAttribute('data-shop-add') || b.getAttribute('data-shop-buy'), buy = b.hasAttribute('data-shop-buy');
    load().then(function (data) {
      var p = find(data, id);
      if (!p || !sellable(p)) return toast(p ? '품절이에요' : '상품을 찾지 못했어요 (' + id + ')');
      if ((p.options || []).length) { location.href = SHOP + 'product.html?id=' + encodeURIComponent(id); return; }
      add(id, [], 1);
      if (buy) location.href = SHOP + 'checkout.html'; else toast('장바구니에 담았어요', true);
    });
  });

  function floatButton() {
    if (window.SHOP_NO_FLOAT || $('[data-shop-cart]') || document.body.dataset.shopPage === 'admin') return;
    var a = document.createElement('a');
    a.className = 'sk-float'; a.href = SHOP + 'cart.html'; a.setAttribute('data-shop-cart', '');
    a.innerHTML = '장바구니 <span class="sk-count" data-shop-cart-count>0</span>';
    document.body.appendChild(a);
  }

  window.Shop = { root: ROOT, load: load, cart: cart, add: add, clear: function () { saveCart([]); }, quote: quote, price: basePrice, won: won, saleActive: saleActive, unitPrice: unitPrice };

  function boot() {
    floatButton(); paintCount(); featured(); livePrices();
    var page = document.body.dataset.shopPage;
    ({ list: pageList, product: pageProduct, cart: pageCart, checkout: pageCheckout, complete: pageComplete }[page] || function () {})();
  }
  addEventListener('storage', function (e) { if (e.key === CART_KEY) paintCount(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

# 미니 쇼핑몰 키트 (실행학교 4주차)

3주차에 만든 홈페이지에 붙이는 쇼핑몰이에요. GitHub에 올리면 Vercel이 알아서 배포해요.

## 들어 있는 것

| 파일 | 하는 일 | 고쳐도 되나요 |
|---|---|---|
| `shop/index.html` | 상품 목록 | 머리·바닥글 자리만 |
| `shop/product.html` | 상품 상세 (`?id=상품id`) | 머리·바닥글 자리만 |
| `shop/cart.html` | 장바구니 | 머리·바닥글 자리만 |
| `shop/checkout.html` | 주문서·결제 | 머리·바닥글 자리만 |
| `shop/complete.html` | 주문 완료 | 머리·바닥글 자리만 |
| `shop/admin.html` | 상품 관리 (나만) | ✗ |
| `shop/products.json` | 상품·배송비·결제 설정 | 관리자 화면·비서가 고쳐요 |
| `shop/shop.css` | 쇼핑몰 모양 | 맨 위 색·서체 변수만 |
| `shop/shop.js` | 장바구니·가격 계산·결제 | ✗ |
| `api/order.js` | 계좌이체 주문 접수 → 디스코드 알림 | ✗ |
| `api/pay-confirm.js` | 토스 결제 승인 → 디스코드 알림 | ✗ |
| `api/_shop.js` | 서버 공통(가격 다시 계산) | ✗ |

## 가격 규칙

- **판매가(price)** 는 꼭 적어요. **정가(listPrice)** 가 더 높으면 줄 그어 보여요.
- **할인가(salePrice)** 는 판매가보다 낮을 때, 할인 기간(saleStart~saleEnd, 비우면 계속)에만 적용돼요.
- 옵션 추가 금액은 할인 뒤 가격에 더해요.
- 배송비는 상품 금액 합계가 무료배송 기준 이상이면 0원이에요.
- 주문할 때 서버(api)가 `shop/products.json`으로 금액을 **다시 계산**해요. 화면에서 금액을 바꿔도 소용없어요.

## Vercel 환경변수

| 이름 | 값 | 필수 |
|---|---|---|
| `ORDER_WEBHOOK_URL` | 디스코드 #주문 채널 웹훅 주소 | ✅ (없으면 주문을 받지 않아요) |
| `TOSS_SECRET_KEY` | 토스페이먼츠 시크릿 키 | 실결제 때만 (테스트 키는 없어도 돼요) |

바꾼 뒤에는 Vercel → Deployments → 맨 위 ⋯ → **Redeploy** 를 눌러야 적용돼요.

## 다른 페이지에 붙이는 법

```html
<link rel="stylesheet" href="shop/shop.css">
<script src="shop/shop.js" defer></script>

<a href="shop/cart.html" data-shop-cart>장바구니 <span class="sk-count" data-shop-cart-count>0</span></a>
<button data-shop-add="상품id">장바구니 담기</button>
<button data-shop-buy="상품id">바로 구매</button>
<div data-shop-featured="3"></div>   <!-- 추천 상품 카드 3개 -->
<span data-shop-price="상품id">34,000원</span>   <!-- 지금 가격·할인으로 자동 교체 -->
<a href="shop/product.html?id=상품id">상품 사진·이름</a>   <!-- 상품 상세로 가는 링크 -->
```

## 홈에 상품 보여 주기 (꼭)

홈 상품 소개 자리에는 상품 카드를 손으로 쓰지 말고 이 한 줄을 넣어요.

```html
<div data-shop-featured="3"></div>
```

`shop/products.json`을 읽어 카드를 그리므로, 관리자 화면·비서·출시 에이전트가 상품을 올리거나 바꾸면 홈도 같이 바뀌어요. 「홈 추천」(featured)으로 표시한 상품이 있으면 그것만, 없으면 보이는 상품을 순서대로 보여 줘요.
손으로 쓴 「곧 입고 · 가격 미정」 카드는 상품을 올려도 그대로 남아요. 비서의 `status`가 이런 홈을 찾아 알려 줘요.

## 상세페이지 (한국형 긴 상세)

상품 페이지 아래는 **상세정보 · 상품정보고시 · 배송·교환·반품** 탭으로 나뉘어요. 상세가 길면 접혀 있다가 '펼쳐보기'로 열리고, 아래로 내리면 화면 맨 아래에 구매 바가 따라와요.

상세 설명 문법: `# 큰 문구` · `## 소제목` · `## POINT 1 | 제목` · `> 강조 박스` · `- 목록` · `1. 번호 카드` · `| 항목 | 내용 |` 표 · `![설명](사진주소)` 사진(여러 줄이면 틈 없이 이어 붙음) · `---` 여백 · `**굵게**`.
통이미지 상세(세로로 긴 그림)는 '상세페이지 이미지'로 올리면 글 아래 이어 붙어요. 사이트 머리글이 위에 붙어 있으면 `shop.css`의 `--sk-tabs-top`을 머리글 높이로 바꿔요.

장바구니 링크(`data-shop-cart`)가 없는 페이지에는 오른쪽 아래에 떠 있는 장바구니 버튼이 자동으로 생겨요.

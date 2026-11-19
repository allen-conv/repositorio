const { JSDOM } = require('jsdom');
const fs = require('fs');
const assert = require('assert');
const file = process.argv[2] || __dirname + '/merchant-reviews-loader.js';
const code = fs.readFileSync(file, 'utf8');
const J = x => JSON.stringify(x);
const pad = n => (n < 10 ? '0' : '') + n;
const ymdPlus = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

function boot(cfg, before, noGapi) {
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url: 'https://hocks.com.br/checkout/sucesso', runScripts: 'outside-only' });
  const w = dom.window;
  w.dataLayer = [];
  w.gtag = function () { w.dataLayer.push(arguments); };
  w.renders = [];
  if (!noGapi) w.gapi = { load: (n, cb) => { assert.strictEqual(n, 'surveyoptin'); cb(); }, surveyoptin: { render: o => w.renders.push(o) } };
  if (before) before(w);
  if (cfg) w.cvtMerchantReviewsConfig = cfg;
  w.eval(code);
  return w;
}
const purchase = (extra) => Object.assign({
  transaction_id: '1000001367', value: 409.9, currency: 'BRL',
  items: [{ product_id: 712277, item_name: 'Tênis', price: 359.9, quantity: 1, ean: '7891234567895' }],
  customer: { email: ' Cliente@Exemplo.com ', first_name: 'Maria' },
  shipping: { delivery_country: 'Brasil', estimated_delivery_date: 5, tier: 'Jadlog' }
}, extra || {});

(async () => {
  /* 1. sem merchant não inicia; aceita window.merchant_id antigo */
  let w = boot({});
  assert.ok(!w.cvtMerchantReviews);
  w = boot(null, w => { w.merchant_id = 5582012; });
  assert.ok(w.cvtMerchantReviews, 'window.merchant_id legado');

  const CFG = { merchantId: 5582012 };

  /* 2. purchase via gtag já no dataLayer -> render com campos obrigatórios */
  w = boot(CFG, w => w.gtag('event', 'purchase', purchase()));
  assert.strictEqual(w.renders.length, 1);
  let r = w.renders[0];
  assert.strictEqual(r.merchant_id, 5582012); assert.strictEqual(r.order_id, '1000001367');
  assert.strictEqual(r.email, 'cliente@exemplo.com'); assert.strictEqual(r.delivery_country, 'BR');
  assert.strictEqual(r.estimated_delivery_date, ymdPlus(5 + 2), 'prazo 5 dias + 2 de margem');
  assert.strictEqual(r.opt_in_style, 'CENTER_DIALOG'); assert.ok(!('products' in r));

  /* 3. push em objeto ignorado; repetido (mesma página e F5) não reabre */
  w.dataLayer.push({ event: 'purchase', eventModel: purchase({ transaction_id: '999' }) });
  assert.strictEqual(w.renders.length, 1, 'push em objeto ignorado');
  w.gtag('event', 'purchase', purchase());
  assert.strictEqual(w.renders.length, 1, 'mesmo pedido não reabre');
  const ls = w.localStorage.getItem('cvt_gcr_tx');
  let w2 = boot(CFG, w => { w.localStorage.setItem('cvt_gcr_tx', ls); w.gtag('event', 'purchase', purchase()); });
  assert.strictEqual(w2.renders.length, 0, 'F5 não reabre');

  /* 4. dados dentro de eventModel, data de entrega como data e DD/MM/AAAA */
  const future = ymdPlus(10);
  w = boot(CFG, w => w.gtag('event', 'purchase', { eventModel: purchase({ transaction_id: 'A1', shipping: { delivery_country: 'BR', delivery_date: future } }) }));
  assert.strictEqual(w.renders[0].order_id, 'A1'); assert.strictEqual(w.renders[0].estimated_delivery_date, ymdPlus(12));
  const [Y, M, D] = future.split('-');
  w = boot(Object.assign({}, CFG, { extraDeliveryDays: 0 }), w => w.gtag('event', 'purchase', purchase({ transaction_id: 'A2', shipping: { delivery_date: D + '/' + M + '/' + Y } })));
  assert.strictEqual(w.renders[0].estimated_delivery_date, future);

  /* 5. sem prazo ou data passada -> padrão; país ausente -> BR */
  w = boot(Object.assign({}, CFG, { defaultDeliveryDays: 10, extraDeliveryDays: 1 }), w => w.gtag('event', 'purchase', purchase({ transaction_id: 'A3', shipping: {} })));
  assert.strictEqual(w.renders[0].estimated_delivery_date, ymdPlus(11)); assert.strictEqual(w.renders[0].delivery_country, 'BR');
  w = boot(CFG, w => w.gtag('event', 'purchase', purchase({ transaction_id: 'A4', shipping: { delivery_date: '2020-01-01' } })));
  assert.strictEqual(w.renders[0].estimated_delivery_date, ymdPlus(7 + 2), 'data passada -> padrão');

  /* 6. e-mail: do cvt_ud quando o pedido não traz; sem e-mail não exibe */
  w = boot(CFG, w => { w.sessionStorage.setItem('cvt_ud', J({ v: 3, data: { email: 'ud@exemplo.com' }, hashed: {} })); w.gtag('event', 'purchase', purchase({ transaction_id: 'A5', customer: {} })); });
  assert.strictEqual(w.renders[0].email, 'ud@exemplo.com');
  w = boot(CFG, w => w.gtag('event', 'purchase', purchase({ transaction_id: 'A6', customer: { email: 'cpf-nao-email' } })));
  assert.strictEqual(w.renders.length, 0, 'sem e-mail válido');
  w = boot(CFG, w => w.gtag('event', 'purchase', purchase({ transaction_id: '' })));
  assert.strictEqual(w.renders.length, 0, 'sem transaction_id');

  /* 7. estilo e GTIN */
  w = boot(Object.assign({}, CFG, { optInStyle: 'BOTTOM_RIGHT_DIALOG', gtinField: 'ean' }), w => w.gtag('event', 'purchase', purchase({ transaction_id: 'A7' })));
  assert.strictEqual(w.renders[0].opt_in_style, 'BOTTOM_RIGHT_DIALOG');
  assert.strictEqual(J(w.renders[0].products), J([{ gtin: '7891234567895' }]));

  /* 8. purchase com send_to (de outro loader) ignorado */
  w = boot(CFG);
  w.gtag('event', 'purchase', purchase({ transaction_id: 'A8', send_to: 'cvt_gads' }));
  assert.strictEqual(w.renders.length, 0);

  /* 9. sem gapi: carrega platform.js e define o idioma */
  w = boot(CFG, null, true);
  w.gtag('event', 'purchase', purchase({ transaction_id: 'A9' }));
  assert.ok([...w.document.scripts].some(s => s.src === 'https://apis.google.com/js/platform.js'), 'carrega platform.js');
  assert.strictEqual(w.___gcfg.lang, 'pt_BR');

  console.log('ALL TESTS PASSED:', file.split('/').pop());
})().catch(e => { console.error('FAIL', e.message, e.stack.split('\n')[1]); process.exit(1); });

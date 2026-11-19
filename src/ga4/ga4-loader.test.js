const { JSDOM } = require('jsdom');
const fs = require('fs');
const assert = require('assert');
const file = process.argv[2] || __dirname + '/ga4-loader.js';
const code = fs.readFileSync(file, 'utf8');
const J = x => JSON.stringify(x);

function boot(cfg, before) {
  const dom = new JSDOM('<!doctype html><head><script src="https://www.googletagmanager.com/gtag/js?id=G-896RK86V4D"></script></head><body></body>', { url: 'https://hocks.com.br/', runScripts: 'outside-only' });
  const w = dom.window;
  w.dataLayer = [];
  w.gtag = function () { w.dataLayer.push(arguments); };
  if (before) before(w);
  w.cvtGa4Config = cfg;
  w.eval(code);
  return w;
}
const isA = e => e && typeof e.length === 'number' && typeof e[0] === 'string';
const own = w => w.cvtGa4DataLayer || [];
const sent = w => own(w).filter(e => isA(e) && e[0] === 'event');
const last = w => sent(w)[sent(w).length - 1];

const pdpItem = { id: 712277, item_id: 712277, item_sku: '26000102', item_name: 'Tênis Flat Core Plus', item_category: 'Footwear', price: 359.9, quantity: 1 };
const cartItem = { item_id: 712277, item_sku: '26000102', item_name: 'Tênis Flat Core Plus', price: 359.9, quantity: 1, variantion: [{ variant_id: 4785062, value: '41' }] };
const ckItems = [
  { item_id: 99001, product_id: 712277, variation_id: 4785062, item_name: 'Tênis', price: 359.9, quantity: 1 },
  { item_id: 99002, product_id: 800100, variation_id: 4800001, item_name: 'Meia', price: '25,00', quantity: 2 }
];
const pl = (items, extra) => Object.assign({ items, value: 359.9, currency: 'BRL', ecommerce: { items }, eventModel: Object.assign({ items, value: 359.9, currency: 'BRL' }, extra || {}) }, extra || {});

(async () => {
  const CFG = { measurementId: 'G-TESTE12345', events: {
    view_item: 'view_item', add_to_cart: 'add_to_cart', initiate_checkout: 'begin_checkout',
    add_shipping_info: { name: 'add_shipping_info', params: ['shipping_tier'] },
    purchase: 'purchase',
    login_success: { name: 'login', items: false, extra: { method: 'site' } },
    newsletter: { name: 'cadastro_newsletter', items: false },
    compre_junto: { name: 'compre_junto', items: true }
  } };

  /* 1. ID inválido não inicia */
  let w = boot({ measurementId: 'AW-1' });
  assert.ok(!w.cvtGa4);

  /* 2. config em grupo próprio; view_item do backlog com itens no esquema GA4 */
  w = boot(CFG, w => w.gtag('event', 'view_item', pl([pdpItem])));
  const cfg = own(w).find(e => isA(e) && e[0] === 'config' && e[1] === 'G-TESTE12345');
  assert.strictEqual(J(cfg[2]), J({ send_page_view: true }));
  assert.ok(!w.dataLayer.some(e => isA(e) && (e[0] === 'config' && e[1] === 'G-TESTE12345' || (e[0] === 'event' && e[2] && e[2].send_to === 'G-TESTE12345'))), 'nada do loader no dataLayer principal');
  assert.ok([...w.document.scripts].some(s => s.src.includes('gtag/js?id=G-TESTE12345&l=cvtGa4DataLayer')), 'gtag.js com dataLayer próprio');
  let v = last(w);
  assert.strictEqual(v[1], 'view_item'); assert.strictEqual(v[2].send_to, 'G-TESTE12345'); assert.strictEqual(v[2].value, 359.9); assert.strictEqual(v[2].currency, 'BRL');
  assert.strictEqual(J(v[2].items), J([{ item_id: '712277', item_name: 'Tênis Flat Core Plus', price: 359.9, quantity: 1, index: 0, item_category: 'Footwear' }]));

  /* 3. push em objeto ignorado; add_to_cart via gtag com item_variant */
  const n = sent(w).length;
  w.dataLayer.push({ event: 'add_to_cart', eventModel: { items: [cartItem] } });
  assert.strictEqual(sent(w).length, n, 'push em objeto ignorado');
  w.gtag('event', 'add_to_cart', pl([cartItem]));
  v = last(w);
  assert.strictEqual(v[1], 'add_to_cart'); assert.strictEqual(v[2].items[0].item_id, '712277'); assert.strictEqual(v[2].items[0].item_variant, '41');

  /* 4. renomear (initiate_checkout -> begin_checkout) com itens do checkout (product_id, não item_id da linha) */
  w.gtag('event', 'initiate_checkout', Object.assign(pl(ckItems), { value: 409.9, coupon: 'BLACK10' }));
  v = last(w);
  assert.strictEqual(v[1], 'begin_checkout'); assert.strictEqual(v[2].coupon, 'BLACK10');
  assert.strictEqual(J(v[2].items.map(i => i.item_id)), J(['712277', '800100']));
  assert.strictEqual(v[2].items[1].price, 25, 'preço "25,00" normalizado');

  /* 5. params extras do evento da loja */
  w.gtag('event', 'add_shipping_info', Object.assign(pl(ckItems), { shipping_tier: 'Jadlog', shipping: '20,93' }));
  v = last(w);
  assert.strictEqual(v[2].shipping_tier, 'Jadlog'); assert.strictEqual(v[2].shipping, 20.93);

  /* 6. personalizado sem itens com extra fixo; personalizado sem itens; personalizado com itens */
  w.gtag('event', 'login_success', pl(ckItems));
  v = last(w);
  assert.strictEqual(v[1], 'login'); assert.strictEqual(v[2].method, 'site'); assert.ok(!('items' in v[2]), 'items:false');
  w.gtag('event', 'newsletter', { email_hash: 'x' });
  v = last(w);
  assert.strictEqual(v[1], 'cadastro_newsletter'); assert.ok(!('items' in v[2])); assert.ok(!('currency' in v[2]), 'sem valor/itens não força moeda');
  w.gtag('event', 'compre_junto', pl([pdpItem, cartItem]));
  v = last(w);
  assert.strictEqual(v[1], 'compre_junto'); assert.strictEqual(v[2].items.length, 2);

  /* 7. evento não configurado -> nada */
  const n2 = sent(w).length;
  w.gtag('event', 'begin_checkout', pl([{ item_id: 0, variantion: [{ variant_id: 0 }] }]));
  assert.strictEqual(sent(w).length, n2);

  /* 8. purchase + dedupe (mesma página e F5) */
  w.gtag('event', 'purchase', Object.assign(pl(ckItems), { transaction_id: '1000001367', value: 409.9, shipping: 20.93, tax: 0 }));
  v = last(w);
  assert.strictEqual(v[1], 'purchase'); assert.strictEqual(v[2].transaction_id, '1000001367'); assert.strictEqual(v[2].shipping, 20.93);
  const n3 = sent(w).length;
  w.gtag('event', 'purchase', Object.assign(pl(ckItems), { transaction_id: '1000001367' }));
  assert.strictEqual(sent(w).length, n3, 'purchase repetido ignorado');
  const ls = w.localStorage.getItem('cvt_ga4_tx');
  let w2 = boot(CFG, w => { w.localStorage.setItem('cvt_ga4_tx', ls); w.gtag('event', 'purchase', Object.assign(pl(ckItems), { transaction_id: '1000001367' })); });
  assert.strictEqual(sent(w2).length, 0, 'F5 não reenvia');

  /* 9. itemId: variant e sku */
  w = boot(Object.assign({}, CFG, { itemId: 'variant' }));
  w.gtag('event', 'add_to_cart', pl([cartItem]));
  assert.strictEqual(last(w)[2].items[0].item_id, '4785062');
  w.gtag('event', 'view_item', pl([pdpItem]));
  assert.strictEqual(last(w)[2].items[0].item_id, '712277', 'sem variação -> pai');
  w = boot(Object.assign({}, CFG, { itemId: 'sku' }));
  w.gtag('event', 'view_item', pl([pdpItem]));
  assert.strictEqual(last(w)[2].items[0].item_id, '26000102');

  /* 10. userId e userData a partir do cvt_ud */
  const ud = { v: 3, data: { customer_id: '98765', city: 'navegantes', region: 'sc', postal_code: '88372502', country: 'br' }, hashed: { email: 'h_em', phone_e164: 'h_ph', first_name: 'h_fn', last_name: 'h_ln' } };
  w = boot(Object.assign({}, CFG, { userId: true, userData: true }), w => w.localStorage.setItem('cvt_ud', J(ud)));
  const c2 = own(w).find(e => isA(e) && e[0] === 'config');
  assert.strictEqual(c2[2].user_id, '98765');
  const set = own(w).filter(e => isA(e) && e[0] === 'set' && e[1] === 'user_data');
  assert.strictEqual(set.length, 1);
  assert.strictEqual(J(set[0][2]), J({ sha256_email_address: 'h_em', sha256_phone_number: 'h_ph', address: { sha256_first_name: 'h_fn', sha256_last_name: 'h_ln', city: 'navegantes', region: 'SC', postal_code: '88372502', country: 'BR' } }));
  // padrão: sem user_data / user_id
  w = boot(CFG, w => w.localStorage.setItem('cvt_ud', J(ud)));
  assert.ok(!own(w).some(e => isA(e) && e[0] === 'set'));
  assert.ok(!('user_id' in own(w).find(e => isA(e) && e[0] === 'config')[2]));

  /* 11. sendPageView: false; injeta gtag.js quando não existe */
  w = boot(Object.assign({}, CFG, { sendPageView: false }));
  assert.strictEqual(own(w).find(e => isA(e) && e[0] === 'config')[2].send_page_view, false);
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url: 'https://loja.com.br/', runScripts: 'outside-only' });
  dom.window.cvtGa4Config = CFG; dom.window.eval(code);
  assert.ok([...dom.window.document.scripts].some(s => s.src.includes('gtag/js?id=G-TESTE12345&l=cvtGa4DataLayer')));

  /* 12. Consent Mode espelhado (backlog e update) */
  w = boot(CFG, w => w.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' }));
  let cons = own(w).filter(e => isA(e) && e[0] === 'consent');
  assert.strictEqual(cons.length, 1); assert.strictEqual(cons[0][1], 'default'); assert.strictEqual(cons[0][2].analytics_storage, 'denied');
  assert.ok(own(w).indexOf(cons[0]) < own(w).findIndex(e => isA(e) && e[0] === 'config'), 'consent default antes do config');
  w.gtag('consent', 'update', { analytics_storage: 'granted' });
  cons = own(w).filter(e => isA(e) && e[0] === 'consent');
  assert.strictEqual(cons.length, 2); assert.strictEqual(cons[1][1], 'update'); assert.strictEqual(cons[1][2].analytics_storage, 'granted');

  console.log('ALL TESTS PASSED:', file.split('/').pop());
})().catch(e => { console.error('FAIL', e.message, e.stack.split('\n')[1]); process.exit(1); });

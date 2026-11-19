const { JSDOM } = require('jsdom');
const fs = require('fs');
const assert = require('assert');
const file = process.argv[2] || __dirname + '/meta-ads-loader.js';
const code = fs.readFileSync(file, 'utf8');
const J = x => JSON.stringify(x);

function boot(cfg, before) {
  const dom = new JSDOM('<!doctype html><head><script></script></head><body></body>', { url: 'https://hocks.com.br/', runScripts: 'outside-only' });
  const w = dom.window;
  w.dataLayer = [];
  w.gtag = function () { w.dataLayer.push(arguments); };
  w.calls = [];
  w.fbq = function () { w.calls.push([].slice.call(arguments)); };   // pixel já presente (stub)
  if (before) before(w);
  w.cvtMetaConfig = cfg;
  w.eval(code);
  return w;
}
const tracks = w => w.calls.filter(c => c[0] === 'track' || c[0] === 'trackCustom').filter(c => c[1] !== 'PageView');
const last = w => tracks(w)[tracks(w).length - 1];

// formatos reais da Convertr
const pdpItem = { id: 712277, item_id: 712277, item_sku: '26000102', item_name: 'Tênis Flat Core Plus', price: 359.9, quantity: 1 };
const cartItem = { item_id: 712277, item_name: 'Tênis Flat Core Plus', price: 359.9, quantity: 1, variantion: [{ variant_id: 4785062, value: '41' }] };
const ckItems = [
  { item_id: 99001, product_id: 712277, variation_id: 4785062, item_name: 'Tênis', price: 359.9, quantity: 1 },
  { item_id: 99002, product_id: 800100, variation_id: 4800001, item_name: 'Meia', price: 25, quantity: 2 }
];
const gtagPayload = (items, extra) => Object.assign({ items, value: 359.9, currency: 'BRL', ecommerce: { items }, eventModel: Object.assign({ items, value: 359.9, currency: 'BRL' }, extra || {}) }, extra || {});

(async () => {
  const CFG = { pixelId: '1234567890', events: {
    view_item: 'ViewContent', add_to_cart: 'AddToCart', initiate_checkout: 'InitiateCheckout',
    add_payment_info: 'AddPaymentInfo', purchase: 'Purchase',
    add_shipping_info: { name: 'AddShippingInfo', items: true },
    sign_up: { name: 'CompleteRegistration', items: false },
    login_success: { name: 'LoginCliente', items: false }
  } };

  /* 1. pixel inválido não inicia */
  let w = boot({ pixelId: 'abc' });
  assert.strictEqual(w.calls.length, 0);

  /* 2. init + PageView; view_item já no dataLayer -> ViewContent product_group com ID do produto pai */
  w = boot(CFG, w => w.gtag('event', 'view_item', gtagPayload([pdpItem])));
  assert.strictEqual(w.calls[0][0], 'init'); assert.strictEqual(w.calls[0][1], '1234567890');
  assert.ok(w.calls.some(c => c[0] === 'track' && c[1] === 'PageView'), 'PageView');
  let v = last(w);
  assert.strictEqual(v[0], 'track'); assert.strictEqual(v[1], 'ViewContent');
  assert.strictEqual(v[2].content_type, 'product_group');
  assert.strictEqual(J(v[2].content_ids), J(['712277']));
  assert.strictEqual(v[2].content_name, 'Tênis Flat Core Plus');
  assert.strictEqual(v[2].value, 359.9); assert.strictEqual(v[2].currency, 'BRL');

  /* 3. push em objeto (duplicado) é ignorado; add_to_cart via gtag -> product com ID da variação */
  const n = tracks(w).length;
  w.dataLayer.push({ event: 'add_to_cart', eventModel: { items: [cartItem], value: 359.9 } });
  assert.strictEqual(tracks(w).length, n, 'push em objeto ignorado');
  w.gtag('event', 'add_to_cart', gtagPayload([cartItem], { event_id: 'evt-atc-1' }));
  v = last(w);
  assert.strictEqual(v[1], 'AddToCart'); assert.strictEqual(v[2].content_type, 'product');
  assert.strictEqual(J(v[2].content_ids), J(['4785062']), 'ID da variação');
  assert.strictEqual(J(v[3]), J({ eventID: 'evt-atc-1' }), 'eventID da plataforma');

  /* 4. initiate_checkout com itens do checkout: product_id/variation_id (item_id é a linha) */
  w.gtag('event', 'initiate_checkout', Object.assign(gtagPayload(ckItems), { value: 409.9 }));
  v = last(w);
  assert.strictEqual(v[1], 'InitiateCheckout');
  assert.strictEqual(J(v[2].content_ids), J(['4785062', '4800001']));
  assert.strictEqual(J(v[2].contents), J([{ id: '4785062', quantity: 1, item_price: 359.9 }, { id: '4800001', quantity: 2, item_price: 25 }]));
  assert.strictEqual(v[2].num_items, 3); assert.strictEqual(v[2].value, 409.9);
  assert.strictEqual(v[3], undefined, 'sem event_id -> sem eventID');

  /* 5. begin_checkout não configurado -> nada */
  const n2 = tracks(w).length;
  w.gtag('event', 'begin_checkout', gtagPayload([{ item_id: 0, variantion: [{ variant_id: 0 }] }]));
  assert.strictEqual(tracks(w).length, n2);

  /* 6. personalizado com itens -> trackCustom com contents */
  w.gtag('event', 'add_shipping_info', gtagPayload(ckItems));
  v = last(w);
  assert.strictEqual(v[0], 'trackCustom'); assert.strictEqual(v[1], 'AddShippingInfo');
  assert.strictEqual(v[2].content_type, 'product'); assert.strictEqual(v[2].content_ids.length, 2);

  /* 7. padrão sem itens e personalizado sem itens */
  w.gtag('event', 'sign_up', { method: 'email' });
  v = last(w);
  assert.strictEqual(v[0], 'track'); assert.strictEqual(v[1], 'CompleteRegistration');
  assert.ok(!('content_ids' in v[2]) && !('contents' in v[2]));
  w.gtag('event', 'login_success', gtagPayload(ckItems));
  v = last(w);
  assert.strictEqual(v[0], 'trackCustom'); assert.strictEqual(v[1], 'LoginCliente');
  assert.ok(!('content_ids' in v[2]), 'items:false não envia itens mesmo se o evento tiver');

  /* 8. Purchase com order_id + dedupe (mesma página e F5) */
  w.gtag('event', 'purchase', Object.assign(gtagPayload(ckItems, { event_id: 'evt-pur' }), { transaction_id: '1000001367', value: 409.9 }));
  v = last(w);
  assert.strictEqual(v[1], 'Purchase'); assert.strictEqual(v[2].order_id, '1000001367'); assert.strictEqual(J(v[3]), J({ eventID: 'evt-pur' }));
  const n3 = tracks(w).length;
  w.gtag('event', 'purchase', Object.assign(gtagPayload(ckItems), { transaction_id: '1000001367' }));
  assert.strictEqual(tracks(w).length, n3, 'purchase repetido ignorado');
  const ls = w.localStorage.getItem('cvt_meta_tx');
  let w2 = boot(CFG, w => { w.localStorage.setItem('cvt_meta_tx', ls); w.gtag('event', 'purchase', Object.assign(gtagPayload(ckItems), { transaction_id: '1000001367' })); });
  assert.strictEqual(tracks(w2).length, 0, 'F5 não reenvia');

  /* 9. feedVariants: false -> sempre 'product' com o ID do produto pai */
  w = boot({ pixelId: '1234567890', feedVariants: false, events: { add_to_cart: 'AddToCart', view_item: 'ViewContent', purchase: 'Purchase' } });
  w.gtag('event', 'add_to_cart', gtagPayload([cartItem]));
  assert.strictEqual(last(w)[2].content_type, 'product'); assert.strictEqual(J(last(w)[2].content_ids), J(['712277']));
  w.gtag('event', 'view_item', gtagPayload([pdpItem]));
  assert.strictEqual(last(w)[2].content_type, 'product'); assert.strictEqual(J(last(w)[2].content_ids), J(['712277']));
  w.gtag('event', 'purchase', Object.assign(gtagPayload(ckItems), { transaction_id: 'SV-1' }));
  assert.strictEqual(last(w)[2].content_type, 'product');
  assert.ok(last(w)[2].content_ids.indexOf('712277') > -1, 'compra com ID do pai');

  /* 10. Advanced Matching a partir do cvt_ud (hash) e atualização */
  const ud = { v: 3, data: {}, hashed: { email: 'h_em', phone: 'h_ph', phone_e164: 'h_e164', first_name: 'h_fn', last_name: 'h_ln', city: 'h_ct', region: 'h_st', postal_code: 'h_zp', country: 'h_co', customer_id: 'h_id' } };
  w = boot(CFG, w => w.sessionStorage.setItem('cvt_ud', J(ud)));
  assert.strictEqual(J(w.calls[0][2]), J({ em: 'h_em', ph: 'h_ph', fn: 'h_fn', ln: 'h_ln', ct: 'h_ct', st: 'h_st', zp: 'h_zp', country: 'h_co', external_id: 'h_id' }));
  w.sessionStorage.setItem('cvt_ud', J({ v: 3, hashed: { email: 'novo' } }));
  w.gtag('event', 'view_item', gtagPayload([pdpItem]));
  const inits = w.calls.filter(c => c[0] === 'init');
  assert.strictEqual(inits.length, 2, 're-init com dados novos'); assert.strictEqual(J(inits[1][2]), J({ em: 'novo' }));
  assert.ok(w.calls.indexOf(inits[1]) < w.calls.indexOf(last(w)), 'matching antes do evento');

  /* 11. pageView: false e eventId: false */
  w = boot(Object.assign({}, CFG, { pageView: false, eventId: false }));
  assert.ok(!w.calls.some(c => c[1] === 'PageView'));
  w.gtag('event', 'add_to_cart', gtagPayload([cartItem], { event_id: 'x' }));
  assert.strictEqual(last(w)[3], undefined);

  /* 12. sem fbq na página: injeta fbevents.js */
  const dom = new JSDOM('<!doctype html><head><script></script></head><body></body>', { url: 'https://loja.com.br/', runScripts: 'outside-only' });
  dom.window.cvtMetaConfig = CFG; dom.window.eval(code);
  assert.ok([...dom.window.document.scripts].some(s => /fbevents\.js/.test(s.src)), 'injeta fbevents.js');
  assert.strictEqual(typeof dom.window.fbq, 'function');

  console.log('ALL TESTS PASSED:', file.split('/').pop());
})().catch(e => { console.error('FAIL', e.message, e.stack.split('\n')[1]); process.exit(1); });

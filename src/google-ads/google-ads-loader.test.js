const { JSDOM } = require('jsdom');
const fs = require('fs');
const assert = require('assert');
const file = process.argv[2] || __dirname + '/google-ads-loader.js';
const code = fs.readFileSync(file, 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));

function boot(cfg, before) {
  const dom = new JSDOM('<!doctype html><head><script src="https://www.googletagmanager.com/gtag/js?id=G-896RK86V4D"></script></head><body></body>', { url: 'https://hocks.com.br/', runScripts: 'outside-only' });
  const w = dom.window;
  w.dataLayer = [];
  w.gtag = function () { w.dataLayer.push(arguments); };     // gtag da plataforma (já carregado)
  if (before) before(w);
  w.cvtGadsConfig = cfg;
  w.eval(code);
  return w;
}
// chamadas feitas pelo loader = entradas Arguments com config do AW ou send_to
const sent = w => w.dataLayer.filter(e => e && typeof e.length === 'number' && (
  (e[0] === 'config' && /^AW-/.test(e[1])) || (e[0] === 'set' && e[1] === 'user_data') ||
  (e[0] === 'event' && e[2] && e[2].send_to)));
const conv = w => sent(w).filter(e => e[1] === 'conversion');
const rmk = (w, n) => sent(w).filter(e => e[0] === 'event' && e[1] === n && e[2].send_to === 'cvt_gads');

// payload no formato da Convertr: gtag('event', nome, {items, value, currency, ecommerce, eventModel})
const item = { id: 712277, name: 'Tênis', item_price: 359.9, item_id: 712277, item_sku: '26000102', item_name: 'Tênis', price: 359.9, quantity: 1 };
const payload = extra => Object.assign({ items: [item], value: 359.9, currency: 'BRL', ecommerce: { currency: 'BRL', value: 359.9, items: [item] }, eventModel: { currency: 'BRL', value: 359.9, items: [item] } }, extra || {});

(async () => {
  const CFG = { conversionId: 'AW-755098170', conversions: { purchase: 'LBL_PUR', add_to_cart: 'LBL_ATC', begin_checkout: 'LBL_BC', view_item: 'LBL_VI' } };

  /* 1. sem conversionId válido não inicia */
  let w = boot({ conversionId: 'G-123' });
  assert.ok(!w.cvtGads, 'não inicia sem AW-');

  /* 2. evento já no dataLayer antes do loader (view_item da carga) é enviado */
  w = boot(CFG, w => w.gtag('event', 'view_item', payload()));
  const cfgCall = sent(w).find(e => e[0] === 'config');
  assert.strictEqual(JSON.stringify(cfgCall[2]), JSON.stringify({ groups: 'cvt_gads' }), 'config com grupo próprio');
  assert.strictEqual(conv(w).length, 1, 'conversão view_item');
  assert.strictEqual(conv(w)[0][2].send_to, 'AW-755098170/LBL_VI');
  assert.strictEqual(conv(w)[0][2].value, 359.9);
  assert.strictEqual(rmk(w, 'view_item').length, 1, 'remarketing view_item');
  assert.strictEqual(JSON.stringify(rmk(w, 'view_item')[0][2].items[0]), JSON.stringify({ id: '712277', price: 359.9, quantity: 1, google_business_vertical: 'retail' }));

  /* 3. push em objeto (duplicado da plataforma) é ignorado; só o gtag conta */
  w.dataLayer.push({ event: 'add_to_cart', ecommerce: { value: 359.9, currency: 'BRL', items: [item] } });
  assert.strictEqual(conv(w).length, 1, 'push em objeto ignorado');
  w.gtag('event', 'add_to_cart', payload());
  assert.strictEqual(conv(w).length, 2, 'add_to_cart via gtag conta');
  assert.strictEqual(conv(w)[1][2].send_to, 'AW-755098170/LBL_ATC');

  /* 4. eventos do loader não são reprocessados (sem loop) */
  const before = w.dataLayer.length;
  w.gtag('event', 'page_view', {});
  assert.strictEqual(w.dataLayer.length, before + 1, 'evento sem rótulo/remarketing não gera envio');

  /* 5. alias initiate_checkout -> begin_checkout */
  w.gtag('event', 'initiate_checkout', payload());
  assert.strictEqual(conv(w)[2][2].send_to, 'AW-755098170/LBL_BC');

  /* 6. purchase com transaction_id e deduplicação no F5 */
  w.gtag('event', 'purchase', payload({ transaction_id: '1000001367', value: 315 }));
  let c = conv(w).filter(e => e[2].send_to.endsWith('LBL_PUR'));
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0][2].transaction_id, '1000001367');
  assert.strictEqual(c[0][2].value, 315);
  assert.strictEqual(rmk(w, 'purchase').length, 1);
  w.gtag('event', 'purchase', payload({ transaction_id: '1000001367', value: 315 }));
  assert.strictEqual(conv(w).filter(e => e[2].send_to.endsWith('LBL_PUR')).length, 1, 'purchase repetido ignorado');
  // nova página (F5): localStorage mantém o registro
  const ls = w.localStorage.getItem('cvt_gads_tx');
  let w2 = boot(CFG, w => { w.localStorage.setItem('cvt_gads_tx', ls); w.gtag('event', 'purchase', payload({ transaction_id: '1000001367' })); });
  assert.strictEqual(conv(w2).length, 0, 'F5 na página de obrigado não reenvia');

  /* 7. conversões otimizadas a partir do cvt_ud (hash preferido) */
  const ud = { v: 3, data: { email: 'maria@exemplo.com', phone: '5547999998888', phone_e164: '+5547999998888', first_name: 'maria', last_name: 'souza', city: 'navegantes', region: 'sc', postal_code: '88372502', country: 'br' },
    hashed: { email: 'h_email', phone_e164: 'h_phone', first_name: 'h_fn', last_name: 'h_ln' } };
  w = boot(CFG, w => { w.sessionStorage.setItem('cvt_ud', JSON.stringify(ud)); });
  w.gtag('event', 'add_to_cart', payload());
  const set = sent(w).filter(e => e[0] === 'set');
  assert.strictEqual(set.length, 1, 'user_data enviado uma vez');
  assert.strictEqual(JSON.stringify(set[0][2]), JSON.stringify({ sha256_email_address: 'h_email', sha256_phone_number: 'h_phone', address: { sha256_first_name: 'h_fn', sha256_last_name: 'h_ln', city: 'navegantes', region: 'SC', postal_code: '88372502', country: 'BR' } }));
  assert.ok(w.dataLayer.indexOf(set[0]) < w.dataLayer.indexOf(conv(w)[0]), 'user_data antes da conversão');

  // sem hash: usa valor padronizado
  w = boot(CFG, w => { w.localStorage.setItem('cvt_ud', JSON.stringify({ v: 3, data: { email: 'a@b.com', phone_e164: '+5511999990000' }, hashed: {} })); });
  assert.strictEqual(JSON.stringify(sent(w).find(e => e[0] === 'set')[2]), JSON.stringify({ email: 'a@b.com', phone_number: '+5511999990000' }));

  /* 8. remarketing desligado e itemIdField = item_sku */
  w = boot(Object.assign({}, CFG, { remarketing: false, itemIdField: 'item_sku' }));
  w.gtag('event', 'view_item_list', payload());
  assert.strictEqual(sent(w).filter(e => e[0] === 'event').length, 0, 'view_item_list sem rótulo e sem remarketing');
  w = boot(Object.assign({}, CFG, { itemIdField: 'item_sku' }));
  w.gtag('event', 'view_item_list', payload());
  assert.strictEqual(rmk(w, 'view_item_list')[0][2].items[0].id, '26000102', 'id do item pelo SKU');

  /* 9. carrega gtag.js quando não existe */
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url: 'https://loja.com.br/', runScripts: 'outside-only' });
  dom.window.cvtGadsConfig = CFG; dom.window.eval(code);
  assert.ok([...dom.window.document.scripts].some(s => s.src.includes('gtag/js?id=AW-755098170')), 'injeta gtag.js');

  /* cliques (clicks) */
  {
  const btn = w => { w.document.body.insertAdjacentHTML('beforeend', '<a class="btn-wpp"><span id="wppT">PEDIDO</span></a><section class="whatsapp-floater"><a id="flt">wa</a></section>'); };
  const clk = (w, id) => w.document.getElementById(id).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const w = boot({ conversionId: 'AW-10978477517', conversions: { whatsapp_pedido: 'LBL_P', whatsapp_flutuante: 'LBL_F' },
    clicks: [{ selector: 'a.btn-wpp', event: 'whatsapp_pedido', product: true }, { selector: '.whatsapp-floater', event: 'whatsapp_flutuante' }] });
  btn(w); w.history.pushState({}, '', '/pochete/p');
  w.gtag('event', 'view_item', { currency: 'BRL', value: 199.9, items: [{ item_id: 1299, item_name: 'Pochete', price: 199.9, quantity: 1 }] });
  clk(w, 'wppT'); clk(w, 'flt');
  const c = conv(w);
  assert.strictEqual(c.length, 2);
  assert.strictEqual(c[0][2].send_to, 'AW-10978477517/LBL_P'); assert.strictEqual(c[0][2].value, 199.9);
  assert.strictEqual(c[1][2].send_to, 'AW-10978477517/LBL_F');
  }

  console.log('ALL TESTS PASSED:', file.split('/').pop());
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

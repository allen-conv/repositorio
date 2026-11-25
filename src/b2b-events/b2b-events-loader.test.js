const { JSDOM } = require('jsdom');
const fs = require('fs');
const assert = require('assert');
const file = process.argv[2] || __dirname + '/b2b-events-loader.js';
const code = fs.readFileSync(file, 'utf8');
const tick = (ms) => new Promise(r => setTimeout(r, ms || 5));

const HTML = '<!doctype html><head><script></script></head><body>' +
  '<button class="register__show-price-btn-default"><span id="vp">Ver preço</span></button>' +
  '<a class="go__create-account" id="cc">Criar conta</a>' +
  '<a class="name" id="vit">Produto</a>' +
  '<div id="wrap"><div class="overlay" id="ov"></div></div>' +
  '<button class="cta-whats" id="wa">WhatsApp</button>' +
  '<a class="btn-wpp" id="wpp"><span id="wppTxt">PEDIDO VIA WHATSAPP</span></a><section class="whatsapp-floater"><a id="flt">wa</a></section></body>';

function boot(cfg, opts) {
  opts = opts || {};
  const dom = new JSDOM(HTML, { url: opts.url || 'https://loja.com.br/', runScripts: 'outside-only' });
  const w = dom.window;
  w.dataLayer = [];
  w.fbqCalls = [];
  w.fbq = function () { w.fbqCalls.push([].slice.call(arguments)); };
  w.apiStatus = 200;
  w.fetch = (input) => Promise.resolve({ status: w.apiStatus, url: input });
  if (opts.before) opts.before(w);
  w.cvtB2bConfig = cfg;
  w.eval(code);
  return w;
}
const gaEvents = (w, dlName) => (w[dlName || 'cvtB2bDataLayer'] || []).filter(a => a[0] === 'event').map(a => ({ name: a[1], p: a[2] }));
const metaEvents = (w) => w.fbqCalls.filter(c => /^trackSingle/.test(c[0]));
const openPopup = (w) => { w.document.getElementById('wrap').insertAdjacentHTML('beforeend', '<div class="big-wrapper"></div>'); w.document.getElementById('ov').classList.add('visible'); };
const closePopup = (w) => { w.document.getElementById('ov').classList.remove('visible'); const b = w.document.querySelector('.big-wrapper'); b && b.remove(); };
const click = (w, id) => w.document.getElementById(id).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

const CFG = { ga4: 'G-ABC1234', metaPixelId: '111222333' };

(async () => {
  /* 1. ver preço -> pop-up: begin_login (não configurado) + ver_preco para GA4 e Meta */
  let w = boot(CFG);
  click(w, 'vp'); openPopup(w); await tick();
  let ga = gaEvents(w);
  assert.strictEqual(JSON.stringify(ga.map(e => e.name)), JSON.stringify(['b_ver_preco']));
  assert.strictEqual(ga[0].p.send_to, 'G-ABC1234');
  assert.strictEqual(ga[0].p.trigger, 'ver_preco'); assert.strictEqual(ga[0].p.source, 'home');
  let cfgCall = (w.cvtB2bDataLayer).filter(a => a[0] === 'config')[0];
  assert.strictEqual(cfgCall[2].send_page_view, false, 'instância própria sem page_view');
  let me = metaEvents(w);
  assert.strictEqual(me.length, 1);
  assert.strictEqual(JSON.stringify(me[0].slice(0, 3)), JSON.stringify(['trackSingleCustom', '111222333', 'VerPreco']));
  assert.ok(w.fbqCalls.some(c => c[0] === 'init' && c[1] === '111222333'), 'init do pixel');

  /* 2. pop-up continua aberto: mutações não repetem; fechar e abrir pelo header não gera ver_preco */
  w.document.body.insertAdjacentHTML('beforeend', '<i class="x"></i>'); await tick();
  assert.strictEqual(gaEvents(w).length, 1);
  closePopup(w); await tick();
  click(w, 'cc'); openPopup(w); await tick();
  assert.strictEqual(gaEvents(w).length, 1, 'begin_login pelo header não está mapeado por padrão');

  /* 3. login_start 1x por ciclo, sign_up; status de erro não dispara */
  await w.fetch('/api/customer/customers/check_exists?email=x'); await tick();
  await w.fetch('/api/customer/customers/check_exists?email=y'); await tick();
  assert.strictEqual(JSON.stringify(gaEvents(w).map(e => e.name)), JSON.stringify(['b_ver_preco', 'b_registrar_pt1']));
  w.apiStatus = 422;
  await w.fetch('/api/customer/customers', { method: 'POST' }); await tick();
  assert.strictEqual(gaEvents(w).length, 2, 'erro 422 não conta');
  w.apiStatus = 201;
  await w.fetch('/api/customer/customers', { method: 'POST' }); await tick();
  ga = gaEvents(w);
  assert.strictEqual(JSON.stringify(ga.map(e => e.name)), JSON.stringify(['b_ver_preco', 'b_registrar_pt1', 'b_registrar_pt2']));
  me = metaEvents(w);
  assert.strictEqual(JSON.stringify(me.map(c => c[0] + ':' + c[2])), JSON.stringify(['trackSingleCustom:VerPreco', 'trackSingleCustom:IniciouCadastro', 'trackSingle:CompleteRegistration']));
  // novo ciclo: login_start volta a valer
  closePopup(w); await tick(); openPopup(w); await tick();
  await w.fetch('/api/customer/customers/check_exists'); await tick();
  assert.strictEqual(gaEvents(w).filter(e => e.name === 'b_registrar_pt1').length, 2);

  /* 4. XHR também é interceptado */
  w = boot(CFG, { url: 'https://loja.com.br/jaqueta/p', before: w => { w.XMLHttpRequest.prototype.send = function () {}; } });
  const x = new w.XMLHttpRequest();
  x.open('POST', '/api/customer/customers');
  Object.defineProperty(x, 'status', { value: 200 });
  x.send();
  x.dispatchEvent(new w.Event('load'));
  await tick();
  ga = gaEvents(w);
  assert.strictEqual(ga.length, 1); assert.strictEqual(ga[0].name, 'b_registrar_pt2'); assert.strictEqual(ga[0].p.source, 'product');

  /* 5. rota /login (direta e por pushState) */
  w = boot(CFG, { url: 'https://loja.com.br/login' });
  w = boot({ ga4: 'G-ABC1234', events: { begin_login: { ga4: 'begin_login' } } }, { url: 'https://loja.com.br/login' });
  assert.strictEqual(JSON.stringify(gaEvents(w).map(e => e.name + ':' + e.p.trigger)), JSON.stringify(['begin_login:unknown']));
  w.history.pushState({}, '', '/jeans/c'); w.history.pushState({}, '', '/login');
  assert.strictEqual(gaEvents(w).length, 2);
  assert.strictEqual(metaEvents(w).length, 0, 'sem pixel: nada para o Meta');

  /* 6. só GA4 ou só Meta; meta: false; params: false; extra */
  w = boot({ metaPixelId: '111222333', events: { ver_preco: { ga4: 'x', meta: 'Lead', extra: { tipo: 'b2b' } }, sign_up: { ga4: 'y', meta: false } }, params: false });
  click(w, 'vp'); openPopup(w); await tick();
  await w.fetch('/api/customer/customers', { method: 'POST' }); await tick();
  assert.ok(!w.cvtB2bDataLayer, 'sem G- não cria instância do GA4');
  me = metaEvents(w);
  assert.strictEqual(me.length, 1);
  assert.strictEqual(JSON.stringify([me[0][0], me[0][2], JSON.stringify(me[0][3])]), JSON.stringify(['trackSingle', 'Lead', '{"tipo":"b2b"}']));

  /* 7. reaproveita o ga4-loader e o meta-ads-loader com os mesmos IDs */
  w = boot(CFG, { before: w => {
    w.cvtGa4Config = { measurementId: 'g-abc1234' }; w.cvtGa4 = { dataLayer: 'cvtGa4DataLayer' }; w.cvtGa4DataLayer = [];
    w.cvtMetaConfig = { pixelId: '111222333' };
  } });
  click(w, 'vp'); openPopup(w); await tick();
  assert.ok(!w.cvtB2bDataLayer, 'não cria outra instância');
  assert.strictEqual(gaEvents(w, 'cvtGa4DataLayer')[0].name, 'b_ver_preco');
  assert.ok(!w.fbqCalls.some(c => c[0] === 'init'), 'não reinicia o pixel do meta-ads-loader');
  assert.strictEqual(metaEvents(w).length, 1);

  /* 8. Consent Mode espelhado na instância própria */
  w = boot(CFG, { before: w => { w.dataLayer.push(['consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied' }]); } });
  click(w, 'vp'); openPopup(w); await tick();
  w.dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }]);
  const cons = w.cvtB2bDataLayer.filter(a => a[0] === 'consent').map(a => a[1] + ':' + a[2].analytics_storage);
  assert.strictEqual(JSON.stringify(cons), JSON.stringify(['default:denied', 'update:granted']));

  /* 9. dataLayer: true, cliques e APIs personalizados */
  w = boot({ ga4: 'G-ABC1234', dataLayer: true,
    events: { whatsapp: { ga4: 'b_whatsapp' }, carrinho_atacado: { ga4: 'b_grade' } },
    clicks: [{ selector: '.cta-whats', event: 'whatsapp', params: { local: 'pdp' } }],
    api: [{ url: 'api/cart/grade', method: 'POST', event: 'carrinho_atacado', once: true }] });
  click(w, 'wa');
  await w.fetch('/api/cart/grade', { method: 'POST' }); await tick();
  await w.fetch('/api/cart/grade', { method: 'POST' }); await tick();
  ga = gaEvents(w);
  assert.strictEqual(JSON.stringify(ga.map(e => e.name)), JSON.stringify(['b_whatsapp', 'b_grade']));
  assert.strictEqual(ga[0].p.local, 'pdp');
  assert.strictEqual(JSON.stringify(w.dataLayer.filter(e => e.event).map(e => e.event)), JSON.stringify(['whatsapp', 'carrinho_atacado']));

  /* 10. G- inválido desliga só o GA4 */
  w = boot({ ga4: 'UA-123', metaPixelId: '111222333' });
  click(w, 'vp'); openPopup(w); await tick();
  assert.ok(!w.cvtB2bDataLayer); assert.strictEqual(metaEvents(w).length, 1);

  /* 12. cliques com produto da PDP + conversões do Google Ads */
  const C12 = { ga4: 'G-ABC1234', metaPixelId: '111222333', gads: '10978477517',
    events: {
      whatsapp_pedido:    { ga4: 'compre_via_whatsapp', meta: 'Contact', gads: 'LBL_PEDIDO' },
      whatsapp_flutuante: { ga4: 'clique_whatsapp', gads: 'LBL_FLUT' }
    },
    clicks: [
      { selector: 'a.btn-wpp', event: 'whatsapp_pedido', product: true },
      { selector: '.whatsapp-floater a', event: 'whatsapp_flutuante' }
    ] };
  w = boot(C12, { url: 'https://loja.com.br/pochete-preta-123/p', before: w => {
    w.dataLayer.push((function () { return arguments; })('event', 'view_item', { currency: 'BRL', value: 199.9, items: [{ item_id: 1299, item_name: 'Pochete', price: 199.9, item_category: 'Bolsas' }] }));
  } });
  click(w, 'wppTxt'); await tick();
  ga = gaEvents(w);
  assert.strictEqual(ga.length, 1); assert.strictEqual(ga[0].name, 'compre_via_whatsapp');
  assert.strictEqual(ga[0].p.value, 199.9); assert.strictEqual(ga[0].p.currency, 'BRL');
  assert.strictEqual(JSON.stringify(ga[0].p.items), JSON.stringify([{ item_id: '1299', item_name: 'Pochete', price: 199.9, quantity: 1, item_category: 'Bolsas' }]));
  me = metaEvents(w);
  assert.strictEqual(me.length, 1); assert.strictEqual(me[0][0], 'trackSingle'); assert.strictEqual(me[0][2], 'Contact');
  assert.strictEqual(JSON.stringify(me[0][3].content_ids), JSON.stringify(['1299'])); assert.strictEqual(me[0][3].value, 199.9);
  const conv = () => w.dataLayer.filter(a => a && a[0] === 'event' && a[1] === 'conversion').map(a => a[2]);
  assert.strictEqual(conv().length, 1); assert.strictEqual(conv()[0].send_to, 'AW-10978477517/LBL_PEDIDO'); assert.strictEqual(conv()[0].value, 199.9);
  assert.ok(w.dataLayer.some(a => a && a[0] === 'config' && a[1] === 'AW-10978477517'), 'carrega a conta do Ads quando não está na página');
  click(w, 'flt'); await tick();
  assert.strictEqual(conv().length, 2); assert.strictEqual(conv()[1].send_to, 'AW-10978477517/LBL_FLUT'); assert.strictEqual(conv()[1].value, undefined);
  assert.strictEqual(gaEvents(w).slice(-1)[0].name, 'clique_whatsapp');
  assert.strictEqual(metaEvents(w).length, 1, 'flutuante sem meta');
  // fora da PDP: sem produto
  w = boot(C12, { url: 'https://loja.com.br/', before: w => { w.google_tag_manager = { 'AW-10978477517': {} }; w.dataLayer.push((function () { return arguments; })('event', 'view_item', { items: [{ item_id: 1, price: 10 }] })); } });
  click(w, 'wppTxt'); await tick();
  assert.strictEqual(gaEvents(w)[0].p.items, undefined);
  assert.ok(!w.dataLayer.some(a => a && a[0] === 'config' && a[1] === 'AW-10978477517'), 'conta já na página: não recarrega');

  /* 13. rótulo do Google Ads inválido (placeholder do GTM) não envia conversão */
  w = boot({ ga4: 'G-ABC1234', gads: 'AW-18389955176', events: { ver_preco: { ga4: 'b_ver_preco', gads: '.' } } });
  click(w, 'vp'); openPopup(w); await tick();
  assert.strictEqual(gaEvents(w).length, 1);
  assert.ok(!w.dataLayer.some(a => a && a[0] === 'event' && a[1] === 'conversion'), 'sem conversion com rótulo "."');

  /* 11. G- já carregado na página (nativo): envia pelo dataLayer principal, sem items/ecommerce/eventModel */
  w = boot(CFG, { before: w => { w.google_tag_manager = { 'G-ABC1234': {} };
    const op = w.dataLayer.push; // simula o GTM/tema que completa os comandos gtag
    w.dataLayer.push = function (a) { if (a && a[0] === 'event' && a[2]) { a[2].items = [{ item_id: 'velho' }]; a[2].ecommerce = { items: a[2].items }; a[2].eventModel = {}; } return op.apply(this, arguments); };
  } });
  click(w, 'vp'); w.history.pushState({}, '', '/login'); await tick();
  assert.ok(!w.cvtB2bDataLayer, 'não cria instância própria');
  ga = gaEvents(w, 'dataLayer');
  assert.strictEqual(ga.length, 1); assert.strictEqual(ga[0].name, 'b_ver_preco');
  assert.strictEqual(Object.prototype.toString.call(w.dataLayer.filter(a => a && a[0] === 'event')[0]), '[object Arguments]', 'comando gtag como Arguments');
  assert.strictEqual(JSON.stringify(Object.keys(ga[0].p)), JSON.stringify(['send_to', 'trigger', 'source']));
  assert.strictEqual(ga[0].p.items, undefined);
  assert.strictEqual(ga[0].p.source, 'home', 'source = página do clique, não /login');

  console.log('b2b-events-loader: todos os testes passaram (' + file + ')');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

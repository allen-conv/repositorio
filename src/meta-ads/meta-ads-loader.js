/*!
 * meta-ads-loader v1.0.0 — Convertr / Performance
 * Envia os eventos de e-commerce da loja Convertr para o Meta Pixel, configurando por loja
 * quais eventos vão, com qual nome, qual content_type e se levam os itens.
 *
 *   - considera SOMENTE os eventos disparados via gtag('event', ...); os mesmos eventos
 *     enviados em dataLayer.push({event: ...}) são ignorados (a Convertr envia os dois)
 *   - eventos padrão do Meta via fbq('track'); qualquer outro nome via fbq('trackCustom')
 *   - content_type por evento: 'product_group' (ID do produto pai) ou 'product' (ID da variação)
 *   - Advanced Matching a partir do cvt-user-data-loader (cvt_ud), em hash SHA-256
 *   - eventID vindo da plataforma (event_id) para deduplicar com a Conversions API
 *   - Purchase deduplicado por transaction_id (F5 na página de obrigado não reenvia)
 *
 * Configuração ANTES do script:
 *   window.cvtMetaConfig = {
 *     pixelId: '1234567890',
 *     events: {
 *       view_item: 'ViewContent',                       // atalho: padrão da plataforma para esse evento
 *       add_to_cart: 'AddToCart',
 *       initiate_checkout: 'InitiateCheckout',
 *       add_payment_info: 'AddPaymentInfo',
 *       purchase: 'Purchase',
 *       add_shipping_info: { name: 'AddShippingInfo', items: true },   // personalizado com itens
 *       sign_up: { name: 'CompleteRegistration', items: false }        // sem itens
 *     },
 *     pageView: true, debug: false
 *   };
 *   Formato completo de um evento: { name, contentType: 'product'|'product_group'|null, items: true|false }
 */
(function (w, d) {
  'use strict';
  if (!w || w.__cvtMetaLoaded) return;

  var CFG = w.cvtMetaConfig || {};
  var PIXEL = String(CFG.pixelId || '').trim();
  var DEBUG = !!CFG.debug;
  function log() { if (DEBUG && w.console) console.log.apply(console, ['[cvt-meta]'].concat([].slice.call(arguments))); }
  if (!/^\d{6,20}$/.test(PIXEL)) { if (w.console) console.warn('[cvt-meta] cvtMetaConfig.pixelId ausente ou inválido. Loader não iniciado.'); return; }
  w.__cvtMetaLoaded = true;

  var DL_NAME = CFG.dataLayerName || 'dataLayer';
  var CURRENCY = CFG.currency || 'BRL';
  var USE_EVENT_ID = CFG.eventId !== false;
  var AM = CFG.advancedMatching !== false;
  var TX_KEY = 'cvt_meta_tx';

  var STANDARD = { AddPaymentInfo: 1, AddToCart: 1, AddToWishlist: 1, CompleteRegistration: 1, Contact: 1, CustomizeProduct: 1, Donate: 1, FindLocation: 1, InitiateCheckout: 1, Lead: 1, Purchase: 1, Schedule: 1, Search: 1, StartTrial: 1, SubmitApplication: 1, Subscribe: 1, ViewContent: 1 };
  // content_type padrão por evento da loja: produto (pai) na página de produto; variação no resto
  var DEFAULT_TYPE = { view_item: 'product_group', view_item_list: 'product_group', add_to_wishlist: 'product_group' };

  // normaliza a configuração de eventos
  var EVENTS = {};
  var src = CFG.events || {};
  for (var k in src) {
    if (!src.hasOwnProperty(k)) continue;
    var e = typeof src[k] === 'string' ? { name: src[k] } : (src[k] || {});
    if (!e.name) continue;
    EVENTS[k] = {
      name: String(e.name),
      custom: !STANDARD[e.name],
      items: e.items !== false,
      contentType: 'contentType' in e ? e.contentType : (DEFAULT_TYPE[k] || 'product')
    };
  }

  /* ---------------- pixel ---------------- */
  if (!w.fbq) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(w, d, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  }
  function fbq() { w.fbq.apply(w, arguments); }

  /* ---------------- Advanced Matching (cvt_ud) ---------------- */
  var lastAM = '';
  function matchData() {
    if (!AM) return {};
    var ud = null;
    try { ud = JSON.parse(w.localStorage.getItem('cvt_ud') || w.sessionStorage.getItem('cvt_ud') || 'null'); } catch (e) {}
    if (!ud || !ud.hashed) return {};
    var h = ud.hashed, o = {};
    // o Pixel aceita SHA-256 já calculado; formatos conforme o padrão do Meta
    if (h.email) o.em = h.email;
    if (h.phone) o.ph = h.phone;            // dígitos com DDI
    if (h.first_name) o.fn = h.first_name;
    if (h.last_name) o.ln = h.last_name;
    if (h.city) o.ct = h.city;              // minúsculas, sem espaços
    if (h.region) o.st = h.region;          // UF minúscula
    if (h.postal_code) o.zp = h.postal_code;
    if (h.country) o.country = h.country;
    if (h.customer_id) o.external_id = h.customer_id;
    return o;
  }
  function init() {
    var m = matchData(); lastAM = JSON.stringify(m);
    fbq('init', PIXEL, m);
    if (CFG.skipOpenbridge) fbq('skipOpenbridge', PIXEL);
    log('init', PIXEL, '| advanced matching:', Object.keys(m));
  }
  function refreshMatching() {
    var m = matchData(), key = JSON.stringify(m);
    if (key === lastAM || !Object.keys(m).length) return;
    lastAM = key;
    fbq('init', PIXEL, m); // atualiza os dados do usuário do pixel
    log('advanced matching atualizado', Object.keys(m));
  }

  /* ---------------- itens ---------------- */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v !== 'string') return 0;
    var s = v.trim(); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s.replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0;
  }
  function str(v) { return v == null || v === '' || v === 0 || v === '0' ? null : String(v); }
  // Formatos da Convertr:
  //   página de produto / carrinho: item_id = produto pai, variantion[0].variant_id = variação
  //   checkout / compra: product_id = produto pai, variation_id = variação (item_id é a linha do carrinho)
  function parentId(i) {
    return str(i.product_id) || str(i.item_id) || str(i.id);
  }
  function variantId(i) {
    var v = (Array.isArray(i.variantion) && i.variantion[0] && i.variantion[0].variant_id) || i.variation_id || i.variant_id;
    return str(v);
  }
  function itemsOf(p) {
    var list = (p && (p.items || (p.eventModel && p.eventModel.items))) || [];
    return [].slice.call(list);
  }
  function contentOf(items, type) {
    var ids = [], contents = [], n = 0, seen = {};
    items.forEach(function (i) {
      var id = type === 'product_group' ? parentId(i) : (variantId(i) || parentId(i));
      if (!id) return;
      var q = parseInt(i.quantity, 10) || 1;
      n += q;
      contents.push({ id: id, quantity: q, item_price: num(i.price != null ? i.price : i.item_price) });
      if (!seen[id]) { seen[id] = 1; ids.push(id); }
    });
    return { content_ids: ids, contents: contents, num_items: n };
  }

  /* ---------------- envio ---------------- */
  function txSent(tx) { try { return JSON.parse(w.localStorage.getItem(TX_KEY) || '[]').indexOf(tx) > -1; } catch (e) { return false; } }
  function markTx(tx) { try { var l = JSON.parse(w.localStorage.getItem(TX_KEY) || '[]'); l.push(tx); w.localStorage.setItem(TX_KEY, JSON.stringify(l.slice(-50))); } catch (e) {} }

  function handle(storeEvent, p) {
    var cfg = EVENTS[storeEvent]; if (!cfg) return;
    p = p || {};
    var em = p.eventModel && typeof p.eventModel === 'object' ? p.eventModel : {};
    var tx = '';
    if (storeEvent === 'purchase' || cfg.name === 'Purchase') {
      tx = str(p.transaction_id || em.transaction_id) || '';
      if (tx && txSent(tx)) { log('Purchase', tx, 'já enviado — ignorado'); return; }
    }
    var data = { currency: p.currency || em.currency || CURRENCY };
    var value = p.value != null ? p.value : em.value;
    if (value != null) data.value = num(value);

    if (cfg.items) {
      var items = itemsOf(p);
      if (items.length) {
        var c = contentOf(items, cfg.contentType || 'product');
        if (c.content_ids.length) {
          if (cfg.contentType) data.content_type = cfg.contentType;
          data.content_ids = c.content_ids;
          data.contents = c.contents;
          data.num_items = c.num_items;
          if (items.length === 1 && (items[0].item_name || items[0].name)) data.content_name = items[0].item_name || items[0].name;
          if (data.value == null) data.value = c.contents.reduce(function (s, x) { return s + x.item_price * x.quantity; }, 0);
        }
      } else log(cfg.name, '— evento configurado com itens, mas veio sem itens');
    }
    if (tx) data.order_id = tx;

    refreshMatching();
    var eid = USE_EVENT_ID ? str(p.event_id || em.event_id || p.eventId || em.eventId) : null;
    var method = cfg.custom ? 'trackCustom' : 'track';
    if (eid) fbq(method, cfg.name, data, { eventID: eid }); else fbq(method, cfg.name, data);
    log(method, cfg.name, data, eid ? { eventID: eid } : '(sem event_id)');
    if (tx) markTx(tx);
  }

  /* ---------------- escuta do dataLayer (somente gtag) ---------------- */
  function isArgs(e) { return e && typeof e === 'object' && typeof e.length === 'number' && typeof e[0] === 'string'; }
  function onEntry(e) {
    try {
      if (!isArgs(e) || e[0] !== 'event' || typeof e[1] !== 'string') return;
      var p = e[2] && typeof e[2] === 'object' ? e[2] : {};
      if (p.send_to) return; // eventos direcionados a outra ferramenta (ex.: google-ads-loader)
      handle(e[1], p);
    } catch (err) { log('erro', err); }
  }

  init();
  if (CFG.pageView !== false) { fbq('track', 'PageView'); log('track PageView'); }

  var dl = w[DL_NAME] = w[DL_NAME] || [];
  for (var i = 0; i < dl.length; i++) onEntry(dl[i]);
  var orig = dl.push;
  dl.push = function () {
    for (var j = 0; j < arguments.length; j++) onEntry(arguments[j]);
    return orig.apply(dl, arguments);
  };

  // advanced matching: quando o cvt_ud mudar
  function hookUD() { if (w.cvtUserData && w.cvtUserData.onChange) { w.cvtUserData.onChange(refreshMatching); return true; } return false; }
  if (!hookUD()) { var t = 0, iv = setInterval(function () { if (hookUD() || ++t > 20) clearInterval(iv); }, 500); }

  w.cvtMeta = { version: '1.0.0', send: handle, events: EVENTS, refreshMatching: refreshMatching };
  log('pronto | eventos:', Object.keys(EVENTS).map(function (k) { return k + '→' + EVENTS[k].name + (EVENTS[k].custom ? ' (custom)' : '') + (EVENTS[k].items ? ' [itens:' + EVENTS[k].contentType + ']' : ' [sem itens]'); }));
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);

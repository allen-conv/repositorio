/*!
 * ga4-loader v1.0.0 — Convertr / Performance
 * Envia os eventos da loja Convertr para uma propriedade do GA4, configurando por loja quais
 * eventos vão, com que nome, se levam os itens e quais parâmetros extras.
 *
 *   - considera SOMENTE os eventos disparados via gtag('event', ...); os mesmos eventos
 *     enviados em dataLayer.push({event: ...}) são ignorados (a Convertr envia os dois)
 *   - grupo próprio no gtag (cvt_ga4): só recebe o que este loader envia
 *   - itens no esquema do GA4 (item_id, item_name, item_variant, item_category, price, quantity...)
 *     com o ID escolhido por loja: produto pai, variação ou SKU
 *   - eventos personalizados com ou sem itens; parâmetros extras copiados do evento da loja
 *   - user_data (dados fornecidos pelo usuário) e user_id a partir do cvt_ud, opcionais
 *   - purchase deduplicado por transaction_id (F5 na página de obrigado não reenvia)
 *
 * ATENÇÃO: não use o mesmo G- que a plataforma já envia nativamente (Configurações → Geral),
 * senão os eventos contam em dobro. Use outro G- ou retire o G- nativo da plataforma.
 *
 * Configuração ANTES do script:
 *   window.cvtGa4Config = {
 *     measurementId: 'G-XXXXXXXXXX',
 *     events: {
 *       view_item: 'view_item',                          // atalho: mesmo nome, com itens
 *       add_to_cart: 'add_to_cart',
 *       initiate_checkout: 'begin_checkout',             // renomeia
 *       purchase: 'purchase',
 *       add_shipping_info: { name: 'add_shipping_info', items: true, params: ['shipping_tier'] },
 *       login_success: { name: 'login', items: false, extra: { method: 'site' } }
 *     },
 *     itemId: 'product',     // 'product' (pai) | 'variant' (variação) | 'sku'
 *     sendPageView: true, userData: false, userId: false, debug: false
 *   };
 */
(function (w, d) {
  'use strict';
  if (!w || w.__cvtGa4Loaded) return;

  var CFG = w.cvtGa4Config || {};
  var MID = String(CFG.measurementId || '').trim();
  var DEBUG = !!CFG.debug;
  function log() { if (DEBUG && w.console) console.log.apply(console, ['[cvt-ga4]'].concat([].slice.call(arguments))); }
  if (!/^G-[A-Z0-9]{4,}$/i.test(MID)) { if (w.console) console.warn('[cvt-ga4] cvtGa4Config.measurementId ausente ou inválido (esperado G-XXXXXXXXXX). Loader não iniciado.'); return; }
  w.__cvtGa4Loaded = true;

  var GROUP = 'cvt_ga4';
  var DL_NAME = CFG.dataLayerName || 'dataLayer';
  var CURRENCY = CFG.currency || 'BRL';
  var ITEM_ID = CFG.itemId || 'product';
  var TX_KEY = 'cvt_ga4_tx';

  // parâmetros de evento do GA4 copiados automaticamente quando a loja envia
  var AUTO_PARAMS = ['transaction_id', 'affiliation', 'coupon', 'shipping', 'tax', 'payment_type', 'shipping_tier',
    'item_list_id', 'item_list_name', 'promotion_id', 'promotion_name', 'creative_name', 'creative_slot',
    'search_term', 'method', 'content_type'];
  // eventos de e-commerce do GA4 (com itens por padrão)
  var ECOMMERCE = { view_item_list: 1, select_item: 1, view_item: 1, add_to_wishlist: 1, add_to_cart: 1, remove_from_cart: 1,
    view_cart: 1, begin_checkout: 1, add_shipping_info: 1, add_payment_info: 1, purchase: 1, refund: 1, view_promotion: 1, select_promotion: 1 };

  // normaliza a configuração de eventos
  var EVENTS = {}, src = CFG.events || {};
  for (var k in src) {
    if (!src.hasOwnProperty(k)) continue;
    var e = typeof src[k] === 'string' ? { name: src[k] } : (src[k] || {});
    if (!e.name) continue;
    EVENTS[k] = {
      name: String(e.name),
      items: 'items' in e ? e.items !== false : !!ECOMMERCE[e.name] || !!ECOMMERCE[k],
      params: [].concat(e.params || []),
      extra: e.extra && typeof e.extra === 'object' ? e.extra : null
    };
  }

  /* ---------------- gtag ---------------- */
  var dl = w[DL_NAME] = w[DL_NAME] || [];
  if (typeof w.gtag !== 'function') { w.gtag = function () { dl.push(arguments); }; w.gtag('js', new Date()); }
  function gtag() { w.gtag.apply(w, arguments); }
  var hasGtagJs = [].some.call(d.scripts || [], function (s) { return /googletagmanager\.com\/gtag\/js/.test(s.src || ''); });
  if (!hasGtagJs) {
    var s = d.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MID;
    (d.head || d.documentElement).appendChild(s);
  }

  /* ---------------- cvt_ud: user_id e user_data ---------------- */
  function readUD() { try { return JSON.parse(w.localStorage.getItem('cvt_ud') || w.sessionStorage.getItem('cvt_ud') || 'null'); } catch (e) { return null; } }
  var cfgParams = { groups: GROUP, send_page_view: CFG.sendPageView !== false };
  if (CFG.userId) { var u0 = readUD(); if (u0 && u0.data && u0.data.customer_id) cfgParams.user_id = String(u0.data.customer_id); }
  gtag('config', MID, cfgParams);
  log('config', MID, cfgParams, '| eventos:', Object.keys(EVENTS).map(function (k) { return k + '→' + EVENTS[k].name + (EVENTS[k].items ? ' [itens]' : ' [sem itens]'); }));

  var lastUD = '';
  function syncUser() {
    var ud = readUD(); if (!ud) return;
    if (CFG.userId && ud.data && ud.data.customer_id) {
      var uid = String(ud.data.customer_id);
      if (cfgParams.user_id !== uid) { cfgParams.user_id = uid; gtag('config', MID, { groups: GROUP, user_id: uid, send_page_view: false }); log('user_id', uid); }
    }
    if (!CFG.userData) return;
    var h = ud.hashed || {}, v = ud.data || {}, o = {}, a = {};
    if (h.email_gmail || h.email) o.sha256_email_address = h.email_gmail || h.email;
    if (h.phone_e164) o.sha256_phone_number = h.phone_e164;
    if (h.first_name) a.sha256_first_name = h.first_name;
    if (h.last_name) a.sha256_last_name = h.last_name;
    if (v.city) a.city = v.city;
    if (v.region) a.region = String(v.region).toUpperCase();
    if (v.postal_code) a.postal_code = v.postal_code;
    if (v.country) a.country = String(v.country).toUpperCase();
    if (Object.keys(a).length && (a.sha256_first_name || a.postal_code)) o.address = a;
    if (!Object.keys(o).length) return;
    var key = JSON.stringify(o); if (key === lastUD) return;
    lastUD = key; gtag('set', 'user_data', o); log('user_data atualizado');
  }

  /* ---------------- itens ---------------- */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v !== 'string') return 0;
    var s = v.trim(); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s.replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0;
  }
  function str(v) { return v == null || v === '' || v === 0 || v === '0' ? null : String(v); }
  // Convertr: página de produto/carrinho -> item_id = pai, variantion[0].variant_id = variação
  //           checkout/compra -> product_id = pai, variation_id = variação (item_id é a linha do carrinho)
  function parentId(i) { return str(i.product_id) || str(i.item_id) || str(i.id); }
  function variantId(i) { return str((Array.isArray(i.variantion) && i.variantion[0] && i.variantion[0].variant_id) || i.variation_id || i.variant_id); }
  function variantLabel(i) {
    if (i.item_variant) return String(i.item_variant);
    var v = Array.isArray(i.variantion) && i.variantion[0];
    if (v && (v.value || v.name)) return String(v.value || v.name);
    if (i.variation_name) return String(i.variation_name);
    return null;
  }
  function idOf(i) {
    if (ITEM_ID === 'variant') return variantId(i) || parentId(i);
    if (ITEM_ID === 'sku') return str(i.item_sku) || str(i.sku) || parentId(i);
    return parentId(i);
  }
  function itemsOf(p) {
    var list = (p && (p.items || (p.eventModel && p.eventModel.items))) || [];
    return [].slice.call(list).map(function (i, idx) {
      var o = { item_id: idOf(i), item_name: i.item_name || i.name, price: num(i.price != null ? i.price : i.item_price), quantity: parseInt(i.quantity, 10) || 1, index: i.index != null ? i.index : idx };
      var vl = variantLabel(i); if (vl) o.item_variant = vl;
      ['item_brand', 'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5', 'item_list_id', 'item_list_name', 'coupon', 'discount', 'affiliation', 'location_id'].forEach(function (f) {
        if (i[f] != null && i[f] !== '') o[f] = f === 'discount' ? num(i[f]) : i[f];
      });
      if (!o.item_name) delete o.item_name;
      return o;
    }).filter(function (o) { return o.item_id; });
  }

  /* ---------------- envio ---------------- */
  function txSent(tx) { try { return JSON.parse(w.localStorage.getItem(TX_KEY) || '[]').indexOf(tx) > -1; } catch (e) { return false; } }
  function markTx(tx) { try { var l = JSON.parse(w.localStorage.getItem(TX_KEY) || '[]'); l.push(tx); w.localStorage.setItem(TX_KEY, JSON.stringify(l.slice(-50))); } catch (e) {} }

  var sending = false;
  function handle(storeEvent, p) {
    var cfg = EVENTS[storeEvent]; if (!cfg) return;
    p = p || {};
    var em = p.eventModel && typeof p.eventModel === 'object' ? p.eventModel : {};
    function pick(f) { return p[f] != null ? p[f] : em[f]; }

    var tx = '';
    if (cfg.name === 'purchase') {
      tx = str(pick('transaction_id')) || '';
      if (!tx) log('AVISO: purchase sem transaction_id');
      else if (txSent(tx)) { log('purchase', tx, 'já enviado — ignorado'); return; }
    }

    var data = { send_to: GROUP };
    var value = pick('value');
    if (value != null) data.value = num(value);
    var cur = pick('currency'); if (cur || data.value != null || cfg.items) data.currency = cur || CURRENCY;
    AUTO_PARAMS.concat(cfg.params).forEach(function (f) {
      var v = pick(f);
      if (v != null && v !== '' && typeof v !== 'object') data[f] = (f === 'shipping' || f === 'tax') ? num(v) : v;
    });
    if (cfg.extra) for (var x in cfg.extra) if (cfg.extra.hasOwnProperty(x)) data[x] = cfg.extra[x];

    if (cfg.items) {
      var items = itemsOf(p);
      if (items.length) {
        data.items = items;
        if (data.value == null) data.value = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
      } else log(cfg.name, '— configurado com itens, mas veio sem itens');
    }

    syncUser();
    sending = true;
    try { gtag('event', cfg.name, data); } finally { sending = false; }
    log('event', cfg.name, data);
    if (tx) markTx(tx);
  }

  /* ---------------- escuta do dataLayer (somente gtag) ---------------- */
  function isArgs(e) { return e && typeof e === 'object' && typeof e.length === 'number' && typeof e[0] === 'string'; }
  function onEntry(e) {
    try {
      if (sending || !isArgs(e) || e[0] !== 'event' || typeof e[1] !== 'string') return;
      var p = e[2] && typeof e[2] === 'object' ? e[2] : {};
      if (p.send_to) return; // já direcionado (este loader, google-ads-loader etc.)
      handle(e[1], p);
    } catch (err) { log('erro', err); }
  }
  for (var i = 0; i < dl.length; i++) onEntry(dl[i]);
  var orig = dl.push;
  dl.push = function () {
    for (var j = 0; j < arguments.length; j++) onEntry(arguments[j]);
    return orig.apply(dl, arguments);
  };

  syncUser();
  function hookUD() { if (w.cvtUserData && w.cvtUserData.onChange) { w.cvtUserData.onChange(syncUser); return true; } return false; }
  if (!hookUD()) { var t = 0, iv = setInterval(function () { if (hookUD() || ++t > 20) clearInterval(iv); }, 500); }

  w.cvtGa4 = { version: '1.0.0', send: handle, events: EVENTS };
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);

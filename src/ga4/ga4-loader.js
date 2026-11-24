/*!
 * ga4-loader v1.2.0 — Convertr / Performance
 * Envia os eventos da loja Convertr para uma propriedade do GA4, configurando por loja quais
 * eventos vão, com que nome, se levam os itens e quais parâmetros extras.
 *
 *   - prioriza os eventos disparados via gtag('event', ...); a cópia em dataLayer.push({event: ...})
 *     é ignorada (a Convertr envia os dois). Evento que chega SÓ pelo dataLayer (ex.: add_payment_info
 *     em alguns checkouts) é usado como reserva (dataLayerFallback)
 *   - G- novo: instância própria do gtag (dataLayer cvtGa4DataLayer), com o Consent Mode espelhado
 *   - G- que a loja já carrega (GA4 nativo): envia pelo gtag principal e só o que o nativo não envia
 *     (eventos só do dataLayer, renomeados ou personalizados), sem duplicar
 *   - itens no esquema do GA4 (item_id, item_name, item_variant, item_category, price, quantity...)
 *     com o ID escolhido por loja: produto pai, variação ou SKU
 *   - eventos personalizados com ou sem itens; parâmetros extras copiados do evento da loja
 *   - user_data (dados fornecidos pelo usuário) e user_id a partir do cvt_ud, opcionais
 *   - purchase deduplicado por transaction_id (F5 na página de obrigado não reenvia)
 *
 * Com o mesmo G- da plataforma, o loader detecta e não reenvia o que o GA4 nativo já envia.
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

  /* ---------------- G- já carregado na página? ---------------- */
  function isArgs(e) { return e && typeof e === 'object' && typeof e.length === 'number' && typeof e[0] === 'string'; }
  var dl = w[DL_NAME] = w[DL_NAME] || [];
  function nativeTag() {
    if (w.google_tag_manager && w.google_tag_manager[MID]) return true;
    for (var n = 0; n < dl.length; n++) if (isArgs(dl[n]) && dl[n][0] === 'config' && String(dl[n][1]).toUpperCase() === MID.toUpperCase()) return true;
    return false;
  }
  var MAIN = CFG.useExistingTag !== false && nativeTag();
  var FALLBACK = CFG.dataLayerFallback !== false;
  // O GTM/tema das lojas completa todo comando gtag do dataLayer principal com items, ecommerce e
  // eventModel. No modo MAIN essas chaves viram não enumeráveis e somente leitura (cópia ignorada).
  function guard(o) {
    ['items', 'ecommerce', 'eventModel'].forEach(function (k) {
      if (k === 'items' && o.items) return;
      try { if (k === 'items') delete o.items; Object.defineProperty(o, k, { get: function () { return undefined; }, set: function () {}, enumerable: false }); } catch (e) {}
    });
    return o;
  }

  /* ---------------- envio: instância própria ou gtag principal ---------------- */
  // G- novo: instância própria do gtag (gtag.js?l=cvtGa4DataLayer), que o GTM não processa, para
  // que items/ecommerce/eventModel do modelo do GTM não se misturem nos eventos.
  // G- já carregado (MAIN): o Google aceita uma instância por ID, então envia pelo dataLayer
  // principal, com send_to e as chaves protegidas (guard).
  var ODL = CFG.ownDataLayer || 'cvtGa4DataLayer';
  var gtag, mirrorConsent = function () {};
  if (MAIN) {
    gtag = function () { var a = arguments; if (a[0] === 'event' && a[2]) guard(a[2]); dl.push(a); };
    ODL = DL_NAME;
  } else {
    var own = w[ODL] = w[ODL] || [];
    gtag = function () { own.push(arguments); };
    gtag('js', new Date());
    var s = d.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MID + '&l=' + ODL;
    (d.head || d.documentElement).appendChild(s);
    // espelha o Consent Mode da loja na instância própria
    mirrorConsent = function (e) {
      if (isArgs(e) && e[0] === 'consent' && (e[1] === 'default' || e[1] === 'update') && e[2] && typeof e[2] === 'object') {
        var c = {}; for (var k2 in e[2]) if (e[2].hasOwnProperty(k2)) c[k2] = e[2][k2];
        gtag('consent', e[1], c); log('consent', e[1], c);
      }
    };
    for (var ci = 0; ci < dl.length; ci++) mirrorConsent(dl[ci]);
  }

  /* ---------------- cvt_ud: user_id e user_data ---------------- */
  function readUD() { try { return JSON.parse(w.localStorage.getItem('cvt_ud') || w.sessionStorage.getItem('cvt_ud') || 'null'); } catch (e) { return null; } }
  var cfgParams = { send_page_view: CFG.sendPageView !== false };
  if (MAIN) {
    // o GA4 nativo já faz config, page_view, user_id e user_data
    log('G-', MID, 'já carregado na página: usando o GA4 nativo (sem page_view; só o que o nativo não envia)');
  } else {
    if (CFG.userId) { var u0 = readUD(); if (u0 && u0.data && u0.data.customer_id) cfgParams.user_id = String(u0.data.customer_id); }
    gtag('config', MID, cfgParams);
  }
  log(MAIN ? 'modo nativo' : 'config', MID, '| eventos:', Object.keys(EVENTS).map(function (k) { return k + '→' + EVENTS[k].name + (EVENTS[k].items ? ' [itens]' : ' [sem itens]'); }));

  var lastUD = '';
  function syncUser() {
    if (MAIN) return;
    var ud = readUD(); if (!ud) return;
    if (CFG.userId && ud.data && ud.data.customer_id) {
      var uid = String(ud.data.customer_id);
      if (cfgParams.user_id !== uid) { cfgParams.user_id = uid; gtag('config', MID, { user_id: uid, send_page_view: false }); log('user_id', uid); }
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

  function handle(storeEvent, p, fromGtag) {
    var cfg = EVENTS[storeEvent]; if (!cfg) return;
    p = p || {};
    // GA4 nativo com o mesmo G- já recebeu esse evento do gtag com o mesmo nome: não duplica
    if (MAIN && fromGtag && cfg.name === storeEvent) { log(storeEvent, '— já enviado pelo GA4 nativo, ignorado'); return; }
    var em = p.eventModel && typeof p.eventModel === 'object' ? p.eventModel : {};
    function pick(f) { return p[f] != null ? p[f] : em[f]; }

    var tx = '';
    if (cfg.name === 'purchase') {
      tx = str(pick('transaction_id')) || '';
      if (!tx) log('AVISO: purchase sem transaction_id');
      else if (txSent(tx)) { log('purchase', tx, 'já enviado — ignorado'); return; }
    }

    var data = { send_to: MID };
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
    gtag('event', cfg.name, data);
    log('event', cfg.name, data);
    if (tx) markTx(tx);
  }

  /* ---------------- escuta do dataLayer ---------------- */
  // gtag('event', ...) é a fonte principal. Um dataLayer.push({event}) configurado só é usado se o
  // mesmo evento não chegar pelo gtag em até FB_WINDOW ms (antes ou depois): reserva para eventos
  // que a plataforma dispara só no dataLayer.
  var lastGtag = {}, FB_DELAY = 800, FB_WINDOW = 2000;
  function objPayload(e) {
    var p = {}, k;
    if (e.ecommerce && typeof e.ecommerce === 'object') for (k in e.ecommerce) if (e.ecommerce.hasOwnProperty(k)) p[k] = e.ecommerce[k];
    for (k in e) if (e.hasOwnProperty(k) && k !== 'event' && k !== 'ecommerce' && k.indexOf('gtm.') !== 0) p[k] = e[k];
    return p;
  }
  function onEntry(e, backlogGtag) {
    try {
      mirrorConsent(e);
      if (isArgs(e)) {
        if (e[0] !== 'event' || typeof e[1] !== 'string') return;
        var p = e[2] && typeof e[2] === 'object' ? e[2] : {};
        if (p.send_to) return; // já direcionado (este loader, google-ads-loader etc.)
        lastGtag[e[1]] = Date.now();
        handle(e[1], p, true);
        return;
      }
      if (!FALLBACK || !e || typeof e !== 'object' || typeof e.event !== 'string' || !EVENTS[e.event]) return;
      var name = e.event, t = Date.now(), payload = objPayload(e);
      if (backlogGtag) { if (!backlogGtag[name]) { log(name, '— só no dataLayer (reserva)'); handle(name, payload, false); } return; }
      setTimeout(function () {
        var g = lastGtag[name];
        if (g && Math.abs(g - t) < FB_WINDOW) return; // veio pelo gtag: já tratado
        log(name, '— só no dataLayer (reserva)');
        handle(name, payload, false);
      }, FB_DELAY);
    } catch (err) { log('erro', err); }
  }
  var bg = {};
  for (var i0 = 0; i0 < dl.length; i0++) { var x = dl[i0]; if (isArgs(x) && x[0] === 'event' && typeof x[1] === 'string' && !(x[2] && x[2].send_to)) bg[x[1]] = 1; }
  for (var i = 0; i < dl.length; i++) { var be = dl[i]; if (!(isArgs(be) && be[0] === 'consent')) onEntry(be, bg); }
  var orig = dl.push;
  dl.push = function () {
    for (var j = 0; j < arguments.length; j++) onEntry(arguments[j]);
    return orig.apply(dl, arguments);
  };

  syncUser();
  function hookUD() { if (w.cvtUserData && w.cvtUserData.onChange) { w.cvtUserData.onChange(syncUser); return true; } return false; }
  if (!hookUD()) { var t = 0, iv = setInterval(function () { if (hookUD() || ++t > 20) clearInterval(iv); }, 500); }

  /* ---------------- cliques (clicks) ---------------- */
  // clicks: [{ selector: 'a.btn-wpp', event: 'whatsapp_pedido', product: true, params: {...} }]
  // Cada clique vira um evento da loja com esse nome, tratado como os demais (configure-o em events).
  // product: true anexa o produto do último view_item da plataforma (só na página de produto, /p).
  (function () {
    var CL = CFG.clicks || []; if (!CL.length || !d) return;
    var PDP = CFG.productPath ? new RegExp(CFG.productPath) : /\/p\/?$/;
    function pdpPayload() {
      if (!PDP.test(w.location.pathname)) return {};
      for (var n = dl.length - 1; n >= 0; n--) {
        var e = dl[n];
        if (e && typeof e === 'object' && typeof e.length === 'number' && e[0] === 'event' && e[1] === 'view_item' && e[2] && !e[2].send_to) {
          var p = e[2], items = p.items || (p.ecommerce && p.ecommerce.items) || [];
          return { currency: p.currency, value: p.value, items: items };
        }
      }
      return {};
    }
    d.addEventListener('click', function (ev) {
      CL.forEach(function (c) {
        var t = ev.target;
        while (t && t !== d) {
          var ok = false; try { ok = !!(t.matches && c.selector && t.matches(c.selector)); } catch (er) {}
          if (ok) {
            var p = c.product ? pdpPayload() : {};
            if (c.params) for (var k in c.params) if (c.params.hasOwnProperty(k)) p[k] = c.params[k];
            log('clique', c.event, p);
            try { handle(c.event, p, false); } catch (er2) { log('erro', er2); }
            break;
          }
          t = t.parentElement;
        }
      });
    }, true);
  })();

  w.cvtGa4 = { version: '1.2.0', send: handle, events: EVENTS, dataLayer: ODL, native: MAIN };
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);

/*!
 * merchant-reviews-loader v1.0.0 — Convertr / Performance
 * Exibe o opt-in de avaliações do Google (Google Customer Reviews / Merchant Center) na
 * página de confirmação da compra das lojas Convertr.
 *
 *   - considera SOMENTE o purchase disparado via gtag('event', 'purchase', ...); o mesmo evento
 *     em dataLayer.push({event: 'purchase'}) é ignorado (a Convertr envia os dois)
 *   - uma vez por pedido (transaction_id): F5 na página de obrigado não reabre o pop-up
 *   - e-mail do pedido (customer.email) ou, na falta, do cvt-user-data-loader (cvt_ud)
 *   - data estimada de entrega a partir do frete da plataforma (data ou prazo em dias),
 *     com dias de margem configuráveis; na falta, um prazo padrão
 *   - GTIN dos produtos opcional (melhora as avaliações de produto)
 *
 * Configuração ANTES do script:
 *   window.cvtMerchantReviewsConfig = {
 *     merchantId: 123456789,          // obrigatório (ID do Merchant Center)
 *     optInStyle: 'CENTER_DIALOG',    // CENTER_DIALOG | BOTTOM_RIGHT_DIALOG | BOTTOM_LEFT_DIALOG |
 *                                     // TOP_RIGHT_DIALOG | TOP_LEFT_DIALOG | BOTTOM_TRAY
 *     defaultDeliveryDays: 7,         // prazo quando a plataforma não informar
 *     extraDeliveryDays: 2,           // margem somada ao prazo (o Google envia a pesquisa após a entrega)
 *     defaultCountry: 'BR',
 *     gtinField: null,                // campo do item com o GTIN/EAN (ex.: 'gtin', 'ean'); null = não envia
 *     lang: 'pt_BR', debug: false
 *   };
 */
(function (w, d) {
  'use strict';
  if (!w || w.__cvtMerchantReviewsLoaded) return;

  var CFG = w.cvtMerchantReviewsConfig || {};
  var MID = parseInt(CFG.merchantId != null ? CFG.merchantId : w.merchant_id, 10); // aceita o window.merchant_id antigo
  var DEBUG = !!CFG.debug;
  function log() { if (DEBUG && w.console) console.log.apply(console, ['[cvt-gcr]'].concat([].slice.call(arguments))); }
  if (!MID || MID < 1) { if (w.console) console.warn('[cvt-gcr] cvtMerchantReviewsConfig.merchantId ausente ou inválido. Loader não iniciado.'); return; }
  w.__cvtMerchantReviewsLoaded = true;

  var DL_NAME = CFG.dataLayerName || 'dataLayer';
  var STYLE = CFG.optInStyle || 'CENTER_DIALOG';
  var DEFAULT_DAYS = CFG.defaultDeliveryDays != null ? +CFG.defaultDeliveryDays : 7;
  var EXTRA_DAYS = CFG.extraDeliveryDays != null ? +CFG.extraDeliveryDays : 2;
  var COUNTRY = String(CFG.defaultCountry || 'BR').toUpperCase();
  var GTIN = CFG.gtinField || null;
  var KEY = 'cvt_gcr_tx';

  /* ---------------- helpers ---------------- */
  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
  function addDays(base, n) { var dt = new Date(base.getTime()); dt.setDate(dt.getDate() + n); return dt; }
  function country(v) {
    var s = String(v || '').trim().toLowerCase();
    if (!s) return COUNTRY;
    if (/^(br|bra|brasil|brazil)$/.test(s)) return 'BR';
    return /^[a-z]{2}$/.test(s) ? s.toUpperCase() : COUNTRY;
  }
  // aceita: prazo em dias (3, "3"), data ISO/AAAA-MM-DD ou DD/MM/AAAA
  function deliveryDate(v) {
    var today = new Date(); today.setHours(12, 0, 0, 0);
    var dt = null;
    if (typeof v === 'number' || (typeof v === 'string' && /^\s*\d{1,3}\s*$/.test(v))) {
      var days = parseInt(v, 10); if (days >= 0) dt = addDays(today, days);
    } else if (typeof v === 'string') {
      var m = v.match(/^(\d{4})-(\d{2})-(\d{2})/) || null, b = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) dt = new Date(+m[1], +m[2] - 1, +m[3], 12);
      else if (b) dt = new Date(+b[3], +b[2] - 1, +b[1], 12);
    }
    if (!dt || isNaN(dt.getTime()) || dt < today) dt = addDays(today, DEFAULT_DAYS);
    return ymd(addDays(dt, EXTRA_DAYS));
  }
  function udEmail() {
    try { var ud = JSON.parse(w.localStorage.getItem('cvt_ud') || w.sessionStorage.getItem('cvt_ud') || 'null'); return ud && ud.data && ud.data.email; } catch (e) { return null; }
  }
  function sent(tx) { try { return JSON.parse(w.localStorage.getItem(KEY) || '[]').indexOf(tx) > -1; } catch (e) { return false; } }
  function mark(tx) { try { var l = JSON.parse(w.localStorage.getItem(KEY) || '[]'); l.push(tx); w.localStorage.setItem(KEY, JSON.stringify(l.slice(-50))); } catch (e) {} }

  /* ---------------- Google API ---------------- */
  var loading = null;
  function loadApi(cb) {
    if (w.gapi && w.gapi.load) { cb(); return; }
    if (!loading) {
      loading = [];
      if (CFG.lang !== false) w.___gcfg = w.___gcfg || { lang: CFG.lang || 'pt_BR' };
      var s = d.createElement('script'); s.async = true; s.defer = true; s.src = 'https://apis.google.com/js/platform.js';
      s.onload = function () { var q = loading; loading = null; q.forEach(function (f) { try { f(); } catch (e) {} }); };
      (d.head || d.documentElement).appendChild(s);
    }
    if (loading) loading.push(cb); else cb();
  }

  /* ---------------- opt-in ---------------- */
  function render(p) {
    p = p || {};
    var em = p.eventModel && typeof p.eventModel === 'object' ? p.eventModel : {};
    function pick(f) { return p[f] != null ? p[f] : em[f]; }
    var tx = pick('transaction_id'); tx = tx == null ? '' : String(tx);
    if (!tx) { log('purchase sem transaction_id — opt-in não exibido'); return; }
    if (sent(tx)) { log('pedido', tx, 'já teve opt-in — ignorado'); return; }

    var customer = pick('customer') || {}, shipping = pick('shipping') || {};
    var email = String(customer.email || pick('email') || udEmail() || '').trim().toLowerCase();
    if (!RE_EMAIL.test(email)) { log('pedido', tx, 'sem e-mail válido — opt-in não exibido'); return; }

    var opts = {
      merchant_id: MID,
      order_id: tx,
      email: email,
      delivery_country: country(shipping.delivery_country || shipping.country || pick('delivery_country')),
      estimated_delivery_date: deliveryDate(shipping.estimated_delivery_date != null ? shipping.estimated_delivery_date : (shipping.delivery_date != null ? shipping.delivery_date : shipping.delivery_time)),
      opt_in_style: STYLE
    };
    if (GTIN) {
      var items = [].slice.call(pick('items') || []), gt = [];
      items.forEach(function (i) { var g = i && i[GTIN]; if (g && /^\d{8,14}$/.test(String(g))) gt.push({ gtin: String(g) }); });
      if (gt.length) opts.products = gt;
    }
    mark(tx);
    log('opt-in', opts);
    loadApi(function () {
      w.gapi.load('surveyoptin', function () { w.gapi.surveyoptin.render(opts); });
    });
  }

  /* ---------------- escuta do dataLayer (somente gtag) ---------------- */
  function isArgs(e) { return e && typeof e === 'object' && typeof e.length === 'number' && typeof e[0] === 'string'; }
  function onEntry(e) {
    try {
      if (!isArgs(e) || e[0] !== 'event' || e[1] !== 'purchase') return;
      var p = e[2] && typeof e[2] === 'object' ? e[2] : {};
      if (p.send_to) return; // envio de outro loader (ex.: google-ads-loader)
      render(p);
    } catch (err) { log('erro', err); }
  }
  var dl = w[DL_NAME] = w[DL_NAME] || [];
  for (var i = 0; i < dl.length; i++) onEntry(dl[i]);
  var orig = dl.push;
  dl.push = function () {
    for (var j = 0; j < arguments.length; j++) onEntry(arguments[j]);
    return orig.apply(dl, arguments);
  };

  w.cvtMerchantReviews = { version: '1.0.0', show: render };
  log('pronto | merchant', MID, '| estilo', STYLE);
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);

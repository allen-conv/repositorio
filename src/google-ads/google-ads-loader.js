/*!
 * google-ads-loader v1.0.0 — Convertr / Performance
 * Envia os eventos de e-commerce da loja Convertr para o Google Ads direto pelo gtag,
 * sem tags no GTM:
 *   - conversões (um rótulo por evento: purchase, add_to_cart, begin_checkout, view_item...)
 *   - remarketing dinâmico (view_item_list, view_item, add_to_cart, purchase com itens)
 *   - conversões otimizadas (user_data) a partir do cvt-user-data-loader (cvt_ud), quando existir
 *   - deduplicação do purchase por transaction_id (F5 na página de obrigado não reenvia)
 *   - considera SOMENTE os eventos disparados via gtag('event', ...); os mesmos eventos
 *     enviados em dataLayer.push({event: ...}) são ignorados (a Convertr envia os dois)
 *
 * Configuração ANTES do script:
 *   window.cvtGadsConfig = {
 *     conversionId: 'AW-123456789',                 // obrigatório
 *     conversions: {                                // evento da loja -> rótulo da conversão
 *       purchase: 'AbCdEf123', add_to_cart: 'GhIj456', begin_checkout: 'KlMn789', view_item: 'OpQr012'
 *     },
 *     remarketing: true,          // eventos de remarketing dinâmico (padrão true)
 *     itemIdField: 'item_id',     // campo do item que bate com o ID do feed (item_id | item_sku | id)
 *     enhancedConversions: true,  // envia user_data do cvt_ud (padrão true)
 *     debug: false
 *   };
 */
(function (w, d) {
  'use strict';
  if (!w || w.__cvtGadsLoaded) return;

  var CFG = w.cvtGadsConfig || {};
  var AW = String(CFG.conversionId || '').trim();
  var DEBUG = !!CFG.debug;
  function log() { if (DEBUG && w.console) console.log.apply(console, ['[cvt-gads]'].concat([].slice.call(arguments))); }
  if (!/^AW-\d+$/.test(AW)) { if (w.console) console.warn('[cvt-gads] cvtGadsConfig.conversionId ausente ou inválido (esperado AW-123456789). Loader não iniciado.'); return; }
  w.__cvtGadsLoaded = true;

  var CONV = CFG.conversions || {};
  var REMARKETING = CFG.remarketing !== false;
  var EC = CFG.enhancedConversions !== false;
  var ID_FIELD = CFG.itemIdField || 'item_id';
  var GROUP = 'cvt_gads';
  var DL_NAME = CFG.dataLayerName || 'dataLayer';
  var CURRENCY = CFG.currency || 'BRL';
  var TX_KEY = 'cvt_gads_tx';

  // eventos de remarketing dinâmico (varejo)
  var RMK_EVENTS = { view_item_list: 1, view_search_results: 1, view_item: 1, add_to_cart: 1, purchase: 1 };
  // nomes alternativos que a plataforma/terceiros às vezes usam
  var ALIAS = { initiate_checkout: 'begin_checkout' };

  /* ---------------- gtag ---------------- */
  var dl = w[DL_NAME] = w[DL_NAME] || [];
  if (typeof w.gtag !== 'function') {
    w.gtag = function () { dl.push(arguments); };
    w.gtag('js', new Date());
  }
  function gtag() { w.gtag.apply(w, arguments); }
  // carrega o gtag.js com o ID do Ads se ainda não houver gtag.js na página
  var hasGtagJs = [].some.call(d.scripts || [], function (s) { return /googletagmanager\.com\/gtag\/js/.test(s.src || ''); });
  if (!hasGtagJs) {
    var s = d.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + AW;
    (d.head || d.documentElement).appendChild(s);
  }
  // grupo próprio: os eventos da loja enviados sem send_to (para o GA4) NÃO vão para o Ads,
  // só o que este loader envia com send_to: 'cvt_gads'. Evita contagem dupla.
  gtag('config', AW, { groups: GROUP });
  log('config', AW, '| conversões:', Object.keys(CONV), '| remarketing:', REMARKETING, '| conversões otimizadas:', EC);

  /* ---------------- conversões otimizadas (cvt_ud) ---------------- */
  var lastUD = '';
  function readUD() {
    try { return JSON.parse(w.localStorage.getItem('cvt_ud') || w.sessionStorage.getItem('cvt_ud') || 'null'); } catch (e) { return null; }
  }
  function userData() {
    var ud = readUD(); if (!ud) return null;
    var h = ud.hashed || {}, v = ud.data || {}, o = {}, a = {};
    // prefere hash (SHA-256) quando o loader de dados já calculou; senão o valor padronizado
    if (h.email_gmail || h.email) o.sha256_email_address = h.email_gmail || h.email; else if (v.email) o.email = v.email;
    if (h.phone_e164) o.sha256_phone_number = h.phone_e164; else if (v.phone_e164) o.phone_number = v.phone_e164;
    if (h.first_name) a.sha256_first_name = h.first_name; else if (v.first_name) a.first_name = v.first_name;
    if (h.last_name) a.sha256_last_name = h.last_name; else if (v.last_name) a.last_name = v.last_name;
    if (v.city) a.city = v.city;
    if (v.region) a.region = String(v.region).toUpperCase();
    if (v.postal_code) a.postal_code = v.postal_code;
    if (v.country) a.country = String(v.country).toUpperCase();
    if (Object.keys(a).length && (a.sha256_first_name || a.first_name || a.postal_code)) o.address = a;
    return Object.keys(o).length ? o : null;
  }
  function syncUserData() {
    if (!EC) return;
    var u = userData(); if (!u) return;
    var key = JSON.stringify(u); if (key === lastUD) return;
    lastUD = key;
    gtag('set', 'user_data', u);
    log('user_data atualizado', Object.keys(u).concat(u.address ? Object.keys(u.address).map(function (k) { return 'address.' + k; }) : []));
  }

  /* ---------------- helpers de e-commerce ---------------- */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v !== 'string') return 0;
    var s = v.trim(); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s.replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0;
  }
  function itemsOf(p) {
    var src = (p && (p.items || (p.ecommerce && p.ecommerce.items) || (p.eventModel && p.eventModel.items))) || [];
    return [].slice.call(src).map(function (i) {
      var id = i[ID_FIELD] != null ? i[ID_FIELD] : (i.item_id != null ? i.item_id : i.id);
      return { id: id == null ? '' : String(id), price: num(i.price != null ? i.price : i.item_price), quantity: parseInt(i.quantity, 10) || 1, google_business_vertical: 'retail' };
    }).filter(function (i) { return i.id; });
  }
  function valueOf(p, items) {
    var src = p.ecommerce || p.eventModel || p;
    var v = p.value != null ? p.value : src.value;
    if (v != null) return num(v);
    return items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
  }
  function txOf(p) {
    var src = p.ecommerce || p.eventModel || {};
    var t = p.transaction_id || src.transaction_id || p.order_id || src.order_id;
    return t == null ? '' : String(t);
  }
  function txSent(tx) {
    try { var l = JSON.parse(w.localStorage.getItem(TX_KEY) || '[]'); return l.indexOf(tx) > -1; } catch (e) { return false; }
  }
  function markTx(tx) {
    try { var l = JSON.parse(w.localStorage.getItem(TX_KEY) || '[]'); l.push(tx); w.localStorage.setItem(TX_KEY, JSON.stringify(l.slice(-50))); } catch (e) {}
  }

  /* ---------------- envio ---------------- */
  var sending = false;
  function handle(name, p) {
    name = ALIAS[name] || name;
    p = p || {};
    var label = CONV[name], rmk = REMARKETING && RMK_EVENTS[name];
    if (!label && !rmk) return;
    var items = itemsOf(p), value = valueOf(p, items), currency = p.currency || (p.ecommerce && p.ecommerce.currency) || CURRENCY, tx = '';

    if (name === 'purchase') {
      tx = txOf(p);
      if (!tx) log('AVISO: purchase sem transaction_id');
      else if (txSent(tx)) { log('purchase', tx, 'já enviado — ignorado'); return; }
    }

    syncUserData();
    sending = true;
    try {
      if (rmk) {
        gtag('event', name, { send_to: GROUP, value: value, currency: currency, items: items });
        log('remarketing', name, { value: value, items: items.length });
      }
      if (label) {
        var conv = { send_to: AW + '/' + label, value: value, currency: currency };
        if (tx) conv.transaction_id = tx;
        gtag('event', 'conversion', conv);
        log('conversão', name, conv);
      }
    } finally { sending = false; }
    if (name === 'purchase' && tx) markTx(tx);
  }

  /* ---------------- escuta do dataLayer ---------------- */
  function isArgs(e) { return e && typeof e === 'object' && typeof e.length === 'number' && typeof e[0] === 'string'; }
  // A Convertr dispara cada evento duas vezes: gtag('event', ...) e dataLayer.push({event: ...}).
  // Considera SOMENTE o do gtag; o push em objeto é ignorado para não contar em dobro.
  function onEntry(e) {
    try {
      if (sending || !isArgs(e)) return;
      if (e[0] !== 'event' || typeof e[1] !== 'string' || e[1] === 'conversion') return;
      var p = e[2] && typeof e[2] === 'object' ? e[2] : {};
      if (p.send_to) return; // já direcionado (ex.: enviado por este loader ou outra integração)
      handle(e[1], p);
    } catch (err) { log('erro', err); }
  }
  // processa só o que chegar a partir de agora; eventos já no dataLayer (ex.: view_item da carga) também
  var seen = dl.length;
  for (var i = 0; i < seen; i++) onEntry(dl[i]);
  var orig = dl.push;
  dl.push = function () {
    for (var j = 0; j < arguments.length; j++) onEntry(arguments[j]);
    return orig.apply(dl, arguments);
  };

  /* ---------------- user_data: agora e quando o cvt_ud mudar ---------------- */
  syncUserData();
  function hookUD() { if (w.cvtUserData && w.cvtUserData.onChange) { w.cvtUserData.onChange(syncUserData); return true; } return false; }
  if (!hookUD()) { var t = 0, iv = setInterval(function () { if (hookUD() || ++t > 20) clearInterval(iv); }, 500); }

  w.cvtGads = { version: '1.0.0', send: handle, syncUserData: syncUserData };
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);

/*!
 * b2b-events-loader v1.1.0 — Convertr / Performance
 * Eventos extras das lojas B2B (atacado) da Convertr, já enviados para o GA4 e o Meta.
 * Substitui a pasta "Eventos B2B - Login" do GTM (tag "Eventos Datalayer - login" + tags GA4 b_*).
 *
 * Eventos detectados:
 *   begin_login  abriu o pop-up de cadastro/login ou foi para /login     params: trigger, source
 *   ver_preco    o mesmo, quando a origem foi o botão "ver preço"          params: trigger, source
 *   login_start  informou o e-mail/CNPJ (API check_exists), 1x por ciclo   params: source
 *   sign_up      cadastro criado (POST api/customer/customers)            params: source
 *   + eventos próprios por clique (clicks) ou por chamada de API (api)
 *
 *   trigger: ver_preco | header_criar_conta | vitrine | unknown
 *   source:  home | product | category | caminho da página
 *
 * Configuração ANTES do script:
 *   window.cvtB2bConfig = {
 *     ga4: 'G-XXXXXXXXXX',        // opcional: sem ele, nada vai para o GA4
 *     metaPixelId: '1234567890',  // opcional: sem ele, nada vai para o Meta
 *     events: {                   // evento detectado: nome no GA4 / no Meta (false = não envia)
 *       ver_preco:   { ga4: 'b_ver_preco',     meta: 'VerPreco' },
 *       login_start: { ga4: 'b_registrar_pt1', meta: 'IniciouCadastro' },
 *       sign_up:     { ga4: 'b_registrar_pt2', meta: 'CompleteRegistration' }
 *     },
 *     params: true,      // envia trigger e source junto
 *     dataLayer: false,  // true: também faz dataLayer.push({event: ...}) (transição com o GTM)
 *     debug: false
 *   };
 */
(function (w, d) {
  'use strict';
  if (!w || w.__cvtB2bLoaded) return;

  var CFG = w.cvtB2bConfig || {};
  var DEBUG = !!CFG.debug;
  function log() { if (DEBUG && w.console) console.log.apply(console, ['[cvt-b2b]'].concat([].slice.call(arguments))); }
  var MID = String(CFG.ga4 || '').trim().toUpperCase();
  if (MID && !/^G-[A-Z0-9]{4,}$/.test(MID)) { if (w.console) console.warn('[cvt-b2b] cvtB2bConfig.ga4 inválido (esperado G-XXXXXXXXXX). GA4 desligado.'); MID = ''; }
  var PIXEL = String(CFG.metaPixelId || '').replace(/\D/g, '');
  w.__cvtB2bLoaded = true;

  var DL_NAME = CFG.dataLayerName || 'dataLayer';
  var dl = w[DL_NAME] = w[DL_NAME] || [];
  var SEND_PARAMS = CFG.params !== false;

  var DEFAULT_EVENTS = {
    ver_preco: { ga4: 'b_ver_preco', meta: 'VerPreco' },
    login_start: { ga4: 'b_registrar_pt1', meta: 'IniciouCadastro' },
    sign_up: { ga4: 'b_registrar_pt2', meta: 'CompleteRegistration' }
  };
  var EVENTS = CFG.events && typeof CFG.events === 'object' ? CFG.events : DEFAULT_EVENTS;

  var SEL = {
    verPreco: '.register__show-price-btn-default',
    criarConta: '.go__create-account, .account-icon.account',
    vitrine: 'img.lazy-img-fadein, a.name',
    popup: '.overlay.visible',
    popupContent: '.big-wrapper'
  };
  if (CFG.selectors) for (var sk in CFG.selectors) if (CFG.selectors.hasOwnProperty(sk)) SEL[sk] = CFG.selectors[sk];

  var API = [
    { url: 'api/customer/customers/check_exists', method: 'GET', event: 'login_start', once: true },
    { url: 'api/customer/customers', method: 'POST', exclude: 'check_exists', event: 'sign_up' }
  ].concat(CFG.api || []);

  /* ---------------- GA4 (instância própria do gtag, como o ga4-loader) ---------------- */
  function isArgs(e) { return e && typeof e === 'object' && typeof e.length === 'number' && typeof e[0] === 'string'; }
  var gaPush = null;
  function args() { return arguments; } // o gtag.js só processa objetos Arguments, não arrays
  // O GTM/tema das lojas Convertr completa todo comando gtag do dataLayer principal com items,
  // ecommerce e eventModel (chegam ao GA4 como "[object Object]" ou com itens de outra página).
  // Essas três chaves viram propriedades não enumeráveis e somente leitura: a cópia é ignorada.
  function guard(o) {
    ['items', 'ecommerce', 'eventModel'].forEach(function (k) {
      try { Object.defineProperty(o, k, { get: function () { return undefined; }, set: function () {}, enumerable: false }); } catch (e) {}
    });
    return o;
  }
  function ga() {
    if (gaPush) return gaPush;
    // ga4-loader na página com o mesmo G-: usa a instância dele
    var g4 = w.cvtGa4, g4c = w.cvtGa4Config;
    if (g4 && g4.dataLayer && !g4.native && g4c && String(g4c.measurementId || '').toUpperCase() === MID) {
      var other = w[g4.dataLayer];
      gaPush = function (args) { other.push(args); };
      log('GA4 via ga4-loader');
      return gaPush;
    }
    // G- já carregado na página (GA4 nativo da plataforma ou do GTM): o Google só aceita uma
    // instância por ID, então uma instância própria com o mesmo G- seria ignorada. Envia pelo
    // dataLayer principal, com send_to e as chaves protegidas.
    var gtm = w.google_tag_manager;
    if (gtm && gtm[MID]) {
      gaPush = function (a) { if (a[0] === 'event' && a[2]) guard(a[2]); dl.push(a); };
      log('GA4 via instância já carregada na página', MID);
      return gaPush;
    }
    var name = CFG.ownDataLayer || 'cvtB2bDataLayer', own = w[name] = w[name] || [];
    gaPush = function (args) { own.push(args); };
    function gtag() { gaPush(arguments); }
    // espelha o Consent Mode da loja (histórico + atualizações)
    function mirror(e) {
      if (isArgs(e) && e[0] === 'consent' && (e[1] === 'default' || e[1] === 'update') && e[2] && typeof e[2] === 'object') {
        var c = {}; for (var k in e[2]) if (e[2].hasOwnProperty(k)) c[k] = e[2][k];
        gtag('consent', e[1], c);
      }
    }
    for (var i = 0; i < dl.length; i++) mirror(dl[i]);
    var orig = dl.push;
    dl.push = function () { for (var j = 0; j < arguments.length; j++) { try { mirror(arguments[j]); } catch (er) {} } return orig.apply(dl, arguments); };
    gtag('js', new Date());
    gtag('config', MID, { send_page_view: false });
    var s = d.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MID + '&l=' + name;
    (d.head || d.documentElement).appendChild(s);
    log('GA4 instância própria', MID);
    return gaPush;
  }

  /* ---------------- Meta ---------------- */
  var STANDARD = { AddPaymentInfo: 1, AddToCart: 1, AddToWishlist: 1, CompleteRegistration: 1, Contact: 1, CustomizeProduct: 1, Donate: 1, FindLocation: 1, InitiateCheckout: 1, Lead: 1, Purchase: 1, Schedule: 1, Search: 1, StartTrial: 1, SubmitApplication: 1, Subscribe: 1, ViewContent: 1 };
  var metaReady = false;
  function matchData() {
    var ud = null;
    try { ud = JSON.parse(w.localStorage.getItem('cvt_ud') || w.sessionStorage.getItem('cvt_ud') || 'null'); } catch (e) {}
    if (!ud || !ud.hashed) return {};
    var h = ud.hashed, o = {};
    if (h.email) o.em = h.email; if (h.phone) o.ph = h.phone;
    if (h.first_name) o.fn = h.first_name; if (h.last_name) o.ln = h.last_name;
    if (h.city) o.ct = h.city; if (h.region) o.st = h.region; if (h.postal_code) o.zp = h.postal_code;
    if (h.country) o.country = h.country; if (h.customer_id) o.external_id = h.customer_id;
    return o;
  }
  function meta() {
    if (metaReady) return;
    metaReady = true;
    if (!w.fbq) {
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0] || b.head; s.parentNode.insertBefore(t, s);
      }(w, d, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    }
    // meta-ads-loader com o mesmo pixel já faz o init (com advanced matching)
    var mc = w.cvtMetaConfig;
    if (!(mc && String(mc.pixelId || '').replace(/\D/g, '') === PIXEL)) { w.fbq('init', PIXEL, matchData()); log('Meta init', PIXEL); }
  }

  /* ---------------- envio ---------------- */
  function source() {
    var p = w.location.pathname;
    if (p === '/' || p === '') return 'home';
    if (/\/p$/.test(p)) return 'product';
    if (/\/c$/.test(p)) return 'category';
    return p;
  }

  function fire(name, params) {
    params = params || {};
    if (!('source' in params)) params.source = source();
    if (CFG.dataLayer) { var o = { event: name }; for (var k in params) o[k] = params[k]; dl.push(o); }
    var cfg = EVENTS[name];
    if (!cfg) { log(name, '(detectado, não configurado)', params); return; }
    var data = {};
    if (SEND_PARAMS) for (var p in params) if (params.hasOwnProperty(p) && params[p] != null) data[p] = params[p];
    if (cfg.extra) for (var x in cfg.extra) if (cfg.extra.hasOwnProperty(x)) data[x] = cfg.extra[x];

    if (MID && cfg.ga4) {
      var gd = { send_to: MID }; for (var a in data) gd[a] = data[a];
      ga()(args('event', String(cfg.ga4), gd));
      log('GA4', cfg.ga4, gd);
    }
    if (PIXEL && cfg.meta) {
      meta();
      var mn = String(cfg.meta), md = {}; for (var b in data) md[b] = data[b];
      w.fbq(STANDARD[mn] ? 'trackSingle' : 'trackSingleCustom', PIXEL, mn, md);
      log('Meta', STANDARD[mn] ? 'trackSingle' : 'trackSingleCustom', mn, md);
    }
  }

  /* ---------------- begin_login: pop-up de cadastro e /login ---------------- */
  var lastTrigger = 'unknown', lastSource = null, loginStartFired = false;
  function matches(el, sel) { try { return !!(el && el.matches && sel && el.matches(sel)); } catch (e) { return false; } }

  d.addEventListener('click', function (ev) {
    var el = ev.target, t = null;
    while (el && el !== d && !t) {
      if (matches(el, SEL.verPreco)) t = 'ver_preco';
      else if (matches(el, SEL.criarConta)) t = 'header_criar_conta';
      else if (matches(el, SEL.vitrine)) t = 'vitrine';
      el = el.parentElement;
    }
    if (t) { lastTrigger = t; lastSource = source(); } // guarda a página de origem do clique
    // cliques personalizados
    (CFG.clicks || []).forEach(function (c) {
      var t = ev.target;
      while (t && t !== d) { if (matches(t, c.selector)) { fire(c.event, c.params ? JSON.parse(JSON.stringify(c.params)) : {}); break; } t = t.parentElement; }
    });
  }, true);

  function beginLogin() {
    loginStartFired = false;
    var t = lastTrigger, src = lastSource || source(); lastTrigger = 'unknown'; lastSource = null;
    fire('begin_login', { trigger: t, source: src });
    if (t === 'ver_preco') fire('ver_preco', { trigger: t, source: src });
  }

  function popupVisible() {
    var o = d.querySelector(SEL.popup);
    return !!(o && o.parentElement && o.parentElement.querySelector(SEL.popupContent));
  }
  var wasVisible = false, pending = false;
  function checkPopup() {
    pending = false;
    var v = popupVisible();
    if (v && !wasVisible) beginLogin();
    wasVisible = v;
  }
  function startObserver() {
    wasVisible = popupVisible();
    if (!w.MutationObserver || !d.body) return;
    new w.MutationObserver(function () { if (!pending) { pending = true; setTimeout(checkPopup, 0); } })
      .observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  if (d.body) startObserver(); else d.addEventListener('DOMContentLoaded', startObserver);

  var lastPath = w.location.pathname;
  function checkRoute() {
    var p = w.location.pathname;
    if (p === '/login' && lastPath !== '/login') beginLogin();
    lastPath = p;
  }
  if (lastPath === '/login') beginLogin();
  ['pushState', 'replaceState'].forEach(function (m) {
    var o = w.history && w.history[m]; if (!o) return;
    w.history[m] = function () { var r = o.apply(this, arguments); try { checkRoute(); } catch (e) {} return r; };
  });
  w.addEventListener('popstate', checkRoute);

  /* ---------------- login_start / sign_up: chamadas de API ---------------- */
  function onApi(method, url, status) {
    if (!(status >= 200 && status < 300)) return;
    url = String(url || ''); method = String(method || 'GET').toUpperCase();
    API.forEach(function (r) {
      if (url.indexOf(r.url) === -1 || method !== String(r.method || 'GET').toUpperCase()) return;
      if (r.exclude && url.indexOf(r.exclude) !== -1) return;
      if (r.once) {
        if (r.event === 'login_start') { if (loginStartFired) return; loginStartFired = true; } // reabre a cada begin_login
        else { if (r.__fired) return; r.__fired = true; }                                      // 1x por página
      }
      fire(r.event, r.params ? JSON.parse(JSON.stringify(r.params)) : {});
    });
  }
  var XO = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
  if (XO) {
    var oOpen = XO.open, oSend = XO.send;
    XO.open = function (m, u) { this.__cvtB2b = [m, u]; return oOpen.apply(this, arguments); };
    XO.send = function () {
      var x = this;
      if (x.__cvtB2b) x.addEventListener('load', function () { try { onApi(x.__cvtB2b[0], x.__cvtB2b[1], x.status); } catch (e) {} });
      return oSend.apply(this, arguments);
    };
  }
  if (w.fetch) {
    var oFetch = w.fetch;
    w.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
      var method = (init && init.method) || (input && input.method) || 'GET';
      var r = oFetch.apply(this, arguments);
      if (r && r.then) r.then(function (res) { try { onApi(method, url, res.status); } catch (e) {} }, function () {});
      return r;
    };
  }

  w.cvtB2b = { version: '1.1.0', fire: fire, events: EVENTS };
  log('pronto | GA4:', MID || '—', '| Meta:', PIXEL || '—', '| eventos:', Object.keys(EVENTS).map(function (k) { return k + '→' + (EVENTS[k].ga4 || '—') + '/' + (EVENTS[k].meta || '—'); }));
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);

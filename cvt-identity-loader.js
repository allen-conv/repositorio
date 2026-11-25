/*!
 * cvt-identity-loader v0.1.3 (TESTE) — Convertr / Performance
 * Mede quanto dá para reconhecer o mesmo visitante sem login e sem envolver a plataforma:
 *   - ID do aparelho (cookie first-party gravado por JS + espelho no localStorage)
 *   - sessão e número da visita
 *   - fingerprint próprio (sem biblioteca externa): um "estável" e um "completo"
 *   - IDs das plataformas já presentes (_fbp, _fbc, _ga, gclid) e UTMs
 *   - token _cv_t dos links de e-mail/WhatsApp (limpo da URL depois de lido)
 *   - e-mail/telefone/customer_id SÓ em SHA-256, lidos do cvt_ud (cvt-user-data-loader)
 * Envia cada evento para um coletor (n8n) com sendBeacon. Não grava dado pessoal em texto puro.
 *
 * Sem consentimento: ID só da sessão (sessionStorage), sem fingerprint e sem dados do cvt_ud.
 *
 * Configuração opcional ANTES do script:
 *   window.cvtIdentityConfig = { endpoint: 'https://.../webhook/cv-identity-test', consent: 'auto', debug: false };
 *   consent: 'auto' (banner LGPD da Convertr / Consent Mode / cvt-user-data-loader), true, false ou function(){}
 */
(function (w, d) {
  'use strict';
  if (!w || w.cvtIdentity) return;

  var V = '0.1.3';
  var CFG = w.cvtIdentityConfig || {};
  var ENDPOINT = CFG.endpoint || 'https://n8n.srv771010.hstgr.cloud/webhook/cv-identity-test';
  var DEBUG = !!CFG.debug;
  var CONSENT_CFG = CFG.consent == null ? 'auto' : CFG.consent;
  var DID_KEY = 'cvt_did';
  var SID_KEY = 'cvt_sid';
  var VN_KEY = 'cvt_vn';
  var TOKEN_KEY = 'cvt_tok';
  var TOKEN_PARAM = CFG.tokenParam || '_cv_t';
  var SESSION_MS = 30 * 60 * 1000;
  var COOKIE_MAX_AGE = 400 * 86400; // teto do Chrome

  function log() { if (DEBUG && w.console) console.log.apply(console, ['[cvt-identity]'].concat([].slice.call(arguments))); }
  function sGet(st, k) { try { return w[st].getItem(k); } catch (e) { return null; } }
  function sSet(st, k, v) { try { w[st].setItem(k, v); } catch (e) {} }
  function sDel(st, k) { try { w[st].removeItem(k); } catch (e) {} }
  function getCookie(n) {
    try {
      var m = d.cookie.match(new RegExp('(?:^|; )' + n.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function setCookie(n, v, maxAge) {
    try {
      d.cookie = n + '=' + encodeURIComponent(v) + '; path=/; max-age=' + maxAge + '; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) {}
  }
  function delCookie(n) { try { d.cookie = n + '=; path=/; max-age=0'; } catch (e) {} }
  function uuid() {
    try { if (w.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var b = new Uint8Array(16);
    try { crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = [].map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function sha256(str) {
    try {
      if (!w.crypto || !crypto.subtle || !w.TextEncoder) return Promise.resolve('');
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
        return [].map.call(new Uint8Array(buf), function (x) { return (x + 256).toString(16).slice(1); }).join('');
      }).catch(function () { return ''; });
    } catch (e) { return Promise.resolve(''); }
  }

  /* ---------------- consentimento ---------------- */
  function nuxtConsent() {
    try {
      var st = w.$nuxt && w.$nuxt.$store && w.$nuxt.$store.state;
      if (!st || !st.lgpd || !st.lgpd.lgpd || !('expire_at' in st.lgpd.lgpd)) return null;
      var exp = st.lgpd.lgpd.expire_at;
      if (!exp) return false;
      var t = typeof exp === 'number' ? exp : Date.parse(exp);
      if (!t || isNaN(t)) return true;
      if (t < 1e12) t = t * 1000;
      return t > Date.now();
    } catch (e) { return null; }
  }
  function hasConsent() {
    if (typeof CONSENT_CFG === 'function') { try { return !!CONSENT_CFG(); } catch (e) { return false; } }
    if (CONSENT_CFG === true || CONSENT_CFG === false) return CONSENT_CFG;
    try { if (w.cvtUserData && w.cvtUserData.consent) return !!w.cvtUserData.consent(); } catch (e) {}
    var n = nuxtConsent();
    if (n !== null) return n;
    try {
      var m = JSON.parse(sGet('localStorage', 'cvt_consent') || 'null');
      if (m && m.granted && (!m.expire_at || m.expire_at > Date.now())) return true;
    } catch (e) {}
    return false;
  }

  /* ---------------- ID do aparelho ---------------- */
  // valor: "<uuid>.<criado_em_ms>"
  function parseDid(v) {
    if (!v || typeof v !== 'string') return null;
    var i = v.lastIndexOf('.');
    var id = i > 0 ? v.slice(0, i) : v, ts = i > 0 ? parseInt(v.slice(i + 1), 10) : NaN;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { id: id, created: isNaN(ts) ? Date.now() : ts };
  }
  function resolveDid(consent) {
    if (!consent) {
      var sv = parseDid(sGet('sessionStorage', DID_KEY));
      if (sv) return { id: sv.id, created: sv.created, origin: 'sessao' };
      var n = { id: uuid(), created: Date.now() };
      sSet('sessionStorage', DID_KEY, n.id + '.' + n.created);
      return { id: n.id, created: n.created, origin: 'sessao_novo' };
    }
    var c = parseDid(getCookie(DID_KEY)), l = parseDid(sGet('localStorage', DID_KEY));
    var s = parseDid(sGet('sessionStorage', DID_KEY)); // ID de sessão de antes do aceite
    var pick, origin;
    if (c && l) { pick = c.created <= l.created ? c : l; origin = c.id === l.id ? 'cookie+ls' : 'cookie+ls_divergente'; }
    else if (c) { pick = c; origin = 'cookie'; }
    else if (l) { pick = l; origin = 'ls'; }
    else if (s) { pick = s; origin = 'sessao_promovida'; }
    else { pick = { id: uuid(), created: Date.now() }; origin = 'novo'; }
    var v = pick.id + '.' + pick.created;
    setCookie(DID_KEY, v, COOKIE_MAX_AGE);
    sSet('localStorage', DID_KEY, v);
    sDel('sessionStorage', DID_KEY);
    return { id: pick.id, created: pick.created, origin: origin };
  }
  function forgetDid() { delCookie(DID_KEY); sDel('localStorage', DID_KEY); sDel('localStorage', VN_KEY); sDel('localStorage', TOKEN_KEY); }

  /* ---------------- sessão e visitas ---------------- */
  function session(consent) {
    var now = Date.now(), s = null;
    try { s = JSON.parse(sGet('sessionStorage', SID_KEY) || 'null'); } catch (e) {}
    var isNew = !s || !s.id || now - (s.last || 0) > SESSION_MS;
    if (isNew) s = { id: uuid(), last: now };
    s.last = now;
    sSet('sessionStorage', SID_KEY, JSON.stringify(s));
    var vn = parseInt(sGet(consent ? 'localStorage' : 'sessionStorage', VN_KEY) || '0', 10) || 0;
    if (isNew) { vn += 1; sSet(consent ? 'localStorage' : 'sessionStorage', VN_KEY, String(vn)); }
    return { id: s.id, visit: vn || 1, isNew: isNew };
  }

  /* ---------------- IDs de plataformas, UTMs e token ---------------- */
  function qp() { try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return null; } }; } }
  function platformIds() {
    var p = qp(), out = {};
    out.fbp = getCookie('_fbp') || '';
    out.fbc = getCookie('_fbc') || (p.get('fbclid') ? 'fb.1.' + Date.now() + '.' + p.get('fbclid') : '');
    var ga = getCookie('_ga');
    out.ga_cid = ga ? ga.split('.').slice(-2).join('.') : '';
    var gaw = getCookie('_gcl_aw');
    out.gclid = p.get('gclid') || (gaw ? gaw.split('.').slice(2).join('.') : '');
    var utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) { var v = p.get(k); if (v) utm[k.slice(4)] = v; });
    out.utm = Object.keys(utm).length ? JSON.stringify(utm) : '';
    return out;
  }
  function readToken(consent) {
    var t = null;
    try {
      var u = new URL(location.href);
      t = u.searchParams.get(TOKEN_PARAM);
      if (t) {
        u.searchParams.delete(TOKEN_PARAM);
        history.replaceState(history.state, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
        if (consent) sSet('localStorage', TOKEN_KEY, t);
        return { token: t, fresh: true };
      }
    } catch (e) {}
    return { token: consent ? (sGet('localStorage', TOKEN_KEY) || '') : '', fresh: false };
  }

  /* ---------------- dados do cliente (só hash) ---------------- */
  function userHashes() {
    try {
      var ud = (w.cvtUserData && w.cvtUserData.get && w.cvtUserData.get()) ||
        JSON.parse(sGet('localStorage', 'cvt_ud') || sGet('sessionStorage', 'cvt_ud') || 'null');
      if (!ud || !ud.hashed) return { email_sha256: '', customer_id: '' };
      return { email_sha256: ud.hashed.email || '', customer_id: ud.hashed.customer_id || '' };
    } catch (e) { return { email_sha256: '', customer_id: '' }; }
  }

  /* ---------------- fingerprint ---------------- */
  function webgl() {
    try {
      var c = d.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return 'nogl';
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      var vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      var renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      return vendor + '~' + renderer + '~' + gl.getParameter(gl.MAX_TEXTURE_SIZE);
    } catch (e) { return 'err'; }
  }
  function canvasPrint() {
    try {
      var c = d.createElement('canvas'); c.width = 240; c.height = 60;
      var x = c.getContext('2d');
      x.textBaseline = 'top'; x.font = "16px 'Arial'"; x.fillStyle = '#f60'; x.fillRect(100, 1, 62, 20);
      x.fillStyle = '#069'; x.fillText('Convertr ç ã 😀 <canvas> 1.0', 2, 15);
      x.fillStyle = 'rgba(102,204,0,0.7)'; x.fillText('Convertr ç ã 😀 <canvas> 1.0', 4, 17);
      x.globalCompositeOperation = 'multiply'; x.fillStyle = 'rgb(255,0,255)'; x.beginPath(); x.arc(50, 50, 50, 0, Math.PI * 2); x.fill();
      return c.toDataURL();
    } catch (e) { return 'err'; }
  }
  function fonts() {
    try {
      var list = ['Arial', 'Helvetica Neue', 'Segoe UI', 'Roboto', 'Calibri', 'Cambria', 'Georgia', 'Verdana', 'Tahoma', 'Trebuchet MS',
        'Courier New', 'Consolas', 'Menlo', 'Monaco', 'SF Pro Text', 'Ubuntu', 'Noto Sans', 'Garamond', 'Futura', 'Gill Sans', 'Lucida Grande', 'Comic Sans MS'];
      var c = d.createElement('canvas').getContext('2d'), txt = 'mmmmmmmmmmlli10OO', base = {}, found = [];
      ['monospace', 'sans-serif', 'serif'].forEach(function (b) { c.font = '72px ' + b; base[b] = c.measureText(txt).width; });
      list.forEach(function (f) {
        for (var b in base) { c.font = "72px '" + f + "'," + b; if (c.measureText(txt).width !== base[b]) { found.push(f); break; } }
      });
      return found.join(',');
    } catch (e) { return 'err'; }
  }
  function fingerprint() {
    var n = w.navigator || {}, sc = w.screen || {};
    var dims = [sc.width || 0, sc.height || 0].sort(function (a, b) { return b - a; }).join('x');
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var stableParts = {
      plat: n.platform || '', cores: n.hardwareConcurrency || 0, mem: n.deviceMemory || 0, touch: n.maxTouchPoints || 0,
      screen: dims + '@' + (sc.colorDepth || 0) + '@' + (w.devicePixelRatio || 1), tz: tz,
      langs: (n.languages || [n.language || '']).join(','), gl: webgl()
    };
    var fullParts = { canvas: canvasPrint(), fonts: fonts(), ua: n.userAgent || '' };
    function joinParts(o) { return Object.keys(o).map(function (k) { return k + '=' + o[k]; }).join('|'); }
    var all = {};
    Object.keys(stableParts).forEach(function (k) { all[k] = stableParts[k]; });
    Object.keys(fullParts).forEach(function (k) { all[k] = fullParts[k]; });
    var keys = Object.keys(all);
    return Promise.all([sha256(joinParts(stableParts)), sha256(joinParts(all))].concat(keys.map(function (k) { return sha256(String(all[k])); })))
      .then(function (r) {
        var parts = keys.map(function (k, i) { return k + ':' + (r[i + 2] || '').slice(0, 6); }).join('|');
        return { stable: (r[0] || '').slice(0, 32), full: (r[1] || '').slice(0, 32), parts: parts };
      });
  }

  /* ---------------- IP público (opcional) ----------------
   * O coletor no n8n fica atrás de um proxy que não repassa o IP real do visitante.
   * Para o teste, o IP é obtido no navegador (o mesmo serviço que a loja já chama) e guardado na sessão. */
  var IP_URL = CFG.ipLookupUrl || 'https://get.geojs.io/v1/ip.json';
  var ipPromise = null;
  function publicIp(consent) {
    if (!consent || CFG.ipLookup === false) return Promise.resolve('');
    var cached = sGet('sessionStorage', 'cvt_ip');
    if (cached) return Promise.resolve(cached);
    if (typeof fetch !== 'function') return Promise.resolve('');
    ipPromise = ipPromise || fetch(IP_URL, { credentials: 'omit' }).then(function (r) { return r.json(); })
      .then(function (j) { var ip = (j && j.ip) || ''; if (ip) sSet('sessionStorage', 'cvt_ip', ip); return ip; })
      .catch(function () { return ''; });
    return ipPromise;
  }

  /* ---------------- envio ---------------- */
  function send(payload) {
    var body = 'd=' + encodeURIComponent(JSON.stringify(payload));
    log('evento', payload.event, payload);
    try {
      if (n8nBeacon(body)) return;
    } catch (e) {}
    try { fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body }); } catch (e) {}
  }
  function n8nBeacon(body) {
    if (!navigator.sendBeacon) return false;
    var blob = new Blob([body], { type: 'application/x-www-form-urlencoded' });
    return navigator.sendBeacon(ENDPOINT, blob);
  }

  /* ---------------- estado e eventos ---------------- */
  var state = { consent: false, did: null, fp: null, lastIdentity: '' };
  var fpPromise = null;

  function storeId() {
    try { return String(w.$nuxt.$store.state.store.id || ''); } catch (e) { return ''; }
  }
  function base(eventName, extra) {
    var consent = hasConsent();
    if (consent !== state.consent || !state.did) {
      if (!consent && state.consent) forgetDid();
      state.consent = consent;
      state.did = resolveDid(consent);
    }
    var s = session(consent), ids = platformIds(), u = consent ? userHashes() : { email_sha256: '', customer_id: '' };
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var sc = w.screen || {};
    var p = {
      v: V, event: eventName, ts: new Date().toISOString(),
      did: state.did.id, did_origin: state.did.origin, did_age_days: Math.round((Date.now() - state.did.created) / 864e4) / 10,
      sid: s.id, visit_n: s.visit, consent: consent,
      url: location.origin + location.pathname, referrer: d.referrer ? d.referrer.split('?')[0] : '',
      fbp: ids.fbp, fbc: ids.fbc, ga_cid: ids.ga_cid, gclid: ids.gclid, utm: ids.utm,
      cv_token: (extra && extra.cv_token) || '', email_sha256: u.email_sha256, customer_id: u.customer_id,
      lang: (navigator.language || ''), tz: tz, screen: (sc.width || 0) + 'x' + (sc.height || 0) + '@' + (w.devicePixelRatio || 1),
      store_id: storeId(), fp_stable: '', fp_full: '', fp_parts: ''
    };
    if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
    return p;
  }
  function track(eventName, extra) {
    var p = null;
    try { p = base(eventName, extra); } catch (e) { log('erro base', e); return; }
    try { trackFull(p); } catch (e) { log('erro track', e); p.err = String(e && e.message || e).slice(0, 120); send(p); }
  }
  function trackFull(p) {
    if (!p.consent) { send(p); return; }
    if (CFG.fingerprint !== false && !fpPromise) {
      try { fpPromise = fingerprint().catch(function () { return null; }); } catch (e) { fpPromise = Promise.resolve(null); }
    }
    // nunca segura o evento: fingerprint e IP têm até 1,5 s; depois disso o evento sai sem eles
    function capped(pr, fallback) {
      return Promise.race([pr.catch(function () { return fallback; }), new Promise(function (res) { setTimeout(function () { res(fallback); }, 1500); })]);
    }
    Promise.all([capped(fpPromise || Promise.resolve(null), null), capped(publicIp(p.consent), '')]).then(function (r) {
      var fp = r[0];
      if (fp) { state.fp = fp; p.fp_stable = fp.stable; p.fp_full = fp.full; p.fp_parts = fp.parts; }
      p.ip_client = r[1] || '';
      send(p);
    });
  }

  var tok = null;
  function pageView() {
    if (!tok) tok = readToken(hasConsent());
    track('page_view', { cv_token: tok.token, token_fresh: tok.fresh });
    tok.fresh = false;
  }
  function checkIdentity() {
    if (!hasConsent()) return;
    var u = userHashes(), key = u.email_sha256 + '|' + u.customer_id;
    if ((u.email_sha256 || u.customer_id) && key !== state.lastIdentity) {
      state.lastIdentity = key;
      sSet('sessionStorage', 'cvt_id_last', key);
      track('identify', { cv_token: tok ? tok.token : '' });
    }
  }

  var api = {
    version: V,
    state: function () { return { consent: state.consent, did: state.did, fp: state.fp }; },
    track: track,
    reset: function () { forgetDid(); sDel('sessionStorage', SID_KEY); sDel('sessionStorage', DID_KEY); state.did = null; }
  };
  w.cvtIdentity = api;

  // ?_cv_reset=1 na URL: apaga ID, sessão, visitas e token deste navegador (recomeçar o teste sem devtools)
  try {
    var ru = new URL(location.href);
    if (ru.searchParams.has('_cv_reset')) {
      api.reset();
      sDel('sessionStorage', 'cvt_ip'); sDel('sessionStorage', 'cvt_id_last'); sDel('sessionStorage', VN_KEY);
      ru.searchParams.delete('_cv_reset');
      history.replaceState(history.state, '', ru.pathname + (ru.searchParams.toString() ? '?' + ru.searchParams.toString() : '') + ru.hash);
      log('reset feito');
    }
  } catch (e) {}

  state.lastIdentity = sGet('sessionStorage', 'cvt_id_last') || '';
  pageView();
  checkIdentity();

  // navegação SPA (Nuxt) e mudanças de identidade
  var lastPath = location.pathname + location.search;
  function onRoute() {
    var now = location.pathname + location.search;
    if (now !== lastPath) { lastPath = now; pageView(); }
  }
  function hookRouter() {
    try {
      if (w.$nuxt && w.$nuxt.$router && w.$nuxt.$router.afterEach) {
        w.$nuxt.$router.afterEach(function () { setTimeout(onRoute, 50); });
        return true;
      }
    } catch (e) {}
    return false;
  }
  if (!hookRouter()) {
    try { if (typeof w.onNuxtReady === 'function') w.onNuxtReady(function () { hookRouter(); }); } catch (e) {}
    try { w.addEventListener('popstate', onRoute); } catch (e) {}
    setInterval(onRoute, 1500);
  }
  try { if (w.cvtUserData && w.cvtUserData.onChange) w.cvtUserData.onChange(function () { setTimeout(checkIdentity, 0); }); } catch (e) {}
  setInterval(checkIdentity, 5000);
  log('pronto', V, '| consentimento:', state.consent, '| did:', state.did && state.did.id, state.did && state.did.origin);
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);

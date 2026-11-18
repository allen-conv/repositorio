/*!
 * cvt-user-data-loader v1.1.1 — Convertr / Performance
 * SOMENTE captura, padroniza e armazena os dados fornecidos pelo próprio usuário
 * durante a navegação (formulários, dataLayer nativo e API da loja/checkout).
 * Os dados ficam em localStorage ("cvt_ud") com hash SHA-256. Este script NÃO envia
 * nada para nenhuma plataforma: o uso fica a cargo de outros scripts / tags do GTM.
 *
 * NÃO captura nem guarda: CPF/CNPJ, RG, data de nascimento, senha, cartão, rua/número,
 * e nunca grava e-mail/telefone/nome em texto puro.
 *
 * Configuração opcional ANTES do script:
 *   window.cvtUDConfig = { ttlDays: 180, purgeLegacy: false, debug: false };
 */
(function (w, d) {
  'use strict';
  if (!w || w.cvtUserData) return;

  var CFG = w.cvtUDConfig || {};
  var KEY = CFG.storageKey || 'cvt_ud';
  var TTL = (CFG.ttlDays || 180) * 864e5;
  var DEBUG = !!CFG.debug;
  var DL_NAME = CFG.dataLayerName || 'dataLayer';
  var COUNTRY = (CFG.defaultCountry || 'br').toLowerCase();
  var DDI = CFG.defaultDDI || '55';
  // Chaves antigas em texto puro (tentativas anteriores via GTM / tema)
  var LEGACY = CFG.legacyKeys || ['user_data', 'meta_user_data'];

  function log() { if (DEBUG && w.console) console.log.apply(console, ['[cvt-ud]'].concat([].slice.call(arguments))); }

  /* ---------------- storage ---------------- */
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!o || o.v !== 2) return null;
      if (o.expires_at && o.expires_at < Date.now()) { localStorage.removeItem(KEY); return null; }
      return o;
    } catch (e) { return null; }
  }
  function empty() { return { v: 2, hashed: {}, plain: {} }; }
  var state = load() || empty();

  /* ---------------- SHA-256 ---------------- */
  var subtle = w.crypto && w.crypto.subtle;
  function hex(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }
  // Fallback síncrono (navegadores sem crypto.subtle / contexto não seguro)
  function sha256js(str) {
    var K = [], H = [], i, j, p = 2, n = 0;
    function frac(x) { return ((x - Math.floor(x)) * 4294967296) | 0; }
    while (n < 64) { for (j = 2; j * j <= p; j++) if (p % j === 0) break; if (j * j > p) { if (n < 8) H[n] = frac(Math.pow(p, 1 / 2)); K[n++] = frac(Math.pow(p, 1 / 3)); } p++; }
    var bytes = unescape(encodeURIComponent(str)), l = bytes.length, words = [];
    for (i = 0; i < l; i++) words[i >> 2] |= bytes.charCodeAt(i) << (24 - (i % 4) * 8);
    words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    words[(((l + 8) >> 6) << 4) + 15] = l * 8;
    for (i = 0; i < words.length; i += 16) {
      var W = [], a = H[0], b = H[1], c = H[2], dd = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        if (j < 16) W[j] = words[i + j] | 0;
        else {
          var x = W[j - 15], y = W[j - 2];
          W[j] = (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + W[j - 16] +
                 (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) + W[j - 7] | 0;
        }
        var t1 = h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[j] + W[j] | 0;
        var t2 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c)) | 0;
        h = g; g = f; f = e; e = dd + t1 | 0; dd = c; c = b; b = a; a = t1 + t2 | 0;
      }
      H[0] = H[0] + a | 0; H[1] = H[1] + b | 0; H[2] = H[2] + c | 0; H[3] = H[3] + dd | 0;
      H[4] = H[4] + e | 0; H[5] = H[5] + f | 0; H[6] = H[6] + g | 0; H[7] = H[7] + h | 0;
    }
    var out = '';
    for (i = 0; i < 8; i++) out += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
    return out;
  }
  function sha256(str) {
    if (subtle && w.TextEncoder) {
      return subtle.digest('SHA-256', new TextEncoder().encode(str)).then(hex, function () { return sha256js(str); });
    }
    return Promise.resolve(sha256js(str));
  }

  /* ---------------- normalização ---------------- */
  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  var UF = 'ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to'.split(' ');
  var UF_NAMES = { 'acre': 'ac', 'alagoas': 'al', 'amapa': 'ap', 'amazonas': 'am', 'bahia': 'ba', 'ceara': 'ce', 'distrito federal': 'df', 'espirito santo': 'es', 'goias': 'go', 'maranhao': 'ma', 'mato grosso': 'mt', 'mato grosso do sul': 'ms', 'minas gerais': 'mg', 'para': 'pa', 'paraiba': 'pb', 'parana': 'pr', 'pernambuco': 'pe', 'piaui': 'pi', 'rio de janeiro': 'rj', 'rio grande do norte': 'rn', 'rio grande do sul': 'rs', 'rondonia': 'ro', 'roraima': 'rr', 'santa catarina': 'sc', 'sao paulo': 'sp', 'sergipe': 'se', 'tocantins': 'to' };
  function str(v) { return v == null ? '' : String(v).trim(); }
  function noAccent(s) { return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s; }

  var N = {
    email: function (v) { v = str(v).toLowerCase(); return RE_EMAIL.test(v) ? v : ''; },
    phone: function (v) { // retorna só dígitos com DDI (ex. 5511912345678)
      var p = str(v).replace(/\D/g, '');
      if (!p) return '';
      if (p.indexOf('00') === 0) p = p.slice(2);
      if (p.length === 10 || p.length === 11) p = DDI + p.replace(/^0/, '');
      return p.length >= 12 && p.length <= 15 ? p : '';
    },
    name: function (v) { // minúsculas, sem pontuação/dígitos; mantém acentos (UTF-8)
      v = str(v).toLowerCase().replace(/[0-9_.,;:!?"'()\[\]{}<>@#$%^&*+=\/\\|~`-]/g, ' ').replace(/\s+/g, ' ').trim();
      return v.length >= 2 && v.length <= 60 ? v : '';
    },
    zip: function (v) { v = str(v).replace(/\D/g, ''); return v.length === 8 ? v : ''; },
    city: function (v) { v = str(v).toLowerCase().replace(/\s+/g, ' '); return /\d/.test(v) || v.length < 2 ? '' : v; },
    region: function (v) {
      v = noAccent(str(v).toLowerCase());
      if (UF.indexOf(v) > -1) return v;
      return UF_NAMES[v] || '';
    },
    country: function (v) {
      v = noAccent(str(v).toLowerCase());
      if (v === 'brasil' || v === 'brazil' || v === 'bra') return 'br';
      return /^[a-z]{2}$/.test(v) ? v : '';
    },
    id: function (v) { v = str(v); return /^[\w-]{1,64}$/.test(v) ? v : ''; }
  };

  /* ---------------- pipeline de gravação ---------------- */
  var pending = {}, timer = null, listeners = [];

  // raw: {email, phone, first_name, last_name, full_name, zip, city, region, country, customer_id}
  function ingest(raw, source) {
    if (!raw) return;
    var x = {};
    if (raw.full_name && !(raw.first_name && raw.last_name)) {
      var parts = N.name(raw.full_name).split(' ');
      if (parts[0] && !raw.first_name) raw.first_name = parts[0];
      if (parts.length > 1 && !raw.last_name) raw.last_name = parts.slice(1).join(' ');
    }
    var map = { email: 'email', phone: 'phone', first_name: 'name', last_name: 'name', zip: 'zip', city: 'city', region: 'region', country: 'country', customer_id: 'id' };
    for (var k in map) { if (raw[k] != null) { var v = N[map[k]](raw[k]); if (v) x[k] = v; } }
    if (!Object.keys(x).length) return;
    log('ingest', source, Object.keys(x));
    for (var y in x) pending[y] = x[y];
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }

  /*
   * Esquema salvo em localStorage["cvt_ud"]:
   * {
   *   v: 2, updated_at: <ms>, expires_at: <ms>,
   *   hashed: {                       // SHA-256 hex do valor normalizado
   *     email,                        // "maria@exemplo.com"
   *     email_gmail,                  // só gmail/googlemail: sem pontos antes do @
   *     phone,                        // só dígitos com DDI: "5547999998888"
   *     phone_e164,                   // "+5547999998888"
   *     first_name, last_name,        // minúsculas, sem pontuação, com acentos
   *     city,                         // minúsculas, sem espaços: "são paulo" -> "sãopaulo"
   *     region,                       // UF minúscula: "sp"
   *     postal_code,                  // 8 dígitos
   *     country,                      // "br"
   *     customer_id                   // ID do cliente na loja (quando logado)
   *   },
   *   plain: { city, region, postal_code, country }   // não sensíveis, normalizados
   * }
   */
  function flush() {
    var p = pending; pending = {};
    var jobs = [], h = {}, g = {};
    function H(field, value) { jobs.push(sha256(value).then(function (r) { h[field] = r; })); }

    if (p.email) {
      H('email', p.email);
      var m = p.email.match(/^([^@]+)@(gmail|googlemail)\.com$/);
      if (m) H('email_gmail', m[1].replace(/\./g, '') + '@' + m[2] + '.com');
    }
    if (p.phone) { H('phone', p.phone); H('phone_e164', '+' + p.phone); }
    if (p.first_name) H('first_name', p.first_name);
    if (p.last_name) H('last_name', p.last_name);
    if (p.city) { H('city', p.city.replace(/[^a-z\u00e0-\u00ff]/g, '')); g.city = p.city; }
    if (p.region) { H('region', p.region); g.region = p.region; }
    if (p.zip) { H('postal_code', p.zip); g.postal_code = p.zip; }
    var country = p.country || (state.plain.country ? '' : COUNTRY);
    if (country) { H('country', country); g.country = country; }
    if (p.customer_id) H('customer_id', p.customer_id);

    Promise.all(jobs).then(function () {
      var changed = false, k;
      if (h.email && !h.email_gmail && state.hashed.email_gmail) { delete state.hashed.email_gmail; changed = true; }
      for (k in h) if (state.hashed[k] !== h[k]) { state.hashed[k] = h[k]; changed = true; }
      for (k in g) if (state.plain[k] !== g[k]) { state.plain[k] = g[k]; changed = true; }
      if (!changed) return;
      state.v = 2; state.updated_at = Date.now(); state.expires_at = state.updated_at + TTL;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
      for (var i = 0; i < listeners.length; i++) { try { listeners[i](api.get()); } catch (e) {} }
    });
  }

  /* ---------------- leitura (o uso é responsabilidade de outros scripts/tags) ---------------- */
  var api = {
    get: function () { return JSON.parse(JSON.stringify(state)); },
    has: function () { return !!(state.hashed.email || state.hashed.phone); },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    ingest: ingest, // captura manual: cvtUserData.ingest({email:'...', phone:'...'}, 'manual')
    clear: function () { state = empty(); try { localStorage.removeItem(KEY); } catch (e) {} },
    version: '1.1.1'
  };

  /* ---------------- fonte 1: objetos (dataLayer / API / legado) ---------------- */
  var ALIAS = {
    email: /^(e-?mail|customer_?email|email_?address|username)$/i,
    phone: /^(phone|phone_?number|telephone|telefone|cellphone|celular|mobile|whatsapp)$/i,
    first_name: /^(first_?name|firstname|primeiro_?nome|given_?name)$/i,
    last_name: /^(last_?name|lastname|sobrenome|surname|family_?name)$/i,
    full_name: /^(name|nome|full_?name|nome_?completo)$/i,
    zip: /^(postcode|post_?code|postal_?code|zip|zip_?code|zipcode|cep)$/i,
    city: /^(city|cidade|delivery_city)$/i,
    region: /^(region|state|estado|uf|region_?code|delivery_region)$/i,
    country: /^(country|country_?code|pais)$/i
  };
  var BLOCK_KEY = /(cpf|cnpj|taxvat|document|rg$|birth|nascimento|password|senha|token|card|cvv|cvc)/i;

  function pick(obj) {
    var out = {}, hit = false;
    for (var k in obj) {
      if (!obj.hasOwnProperty(k) || BLOCK_KEY.test(k)) continue;
      var v = obj[k];
      if (v == null || typeof v === 'object') continue;
      for (var f in ALIAS) if (ALIAS[f].test(k)) { out[f] = v; hit = true; break; }
    }
    if (!hit) return null;
    // Só aceita objetos que claramente descrevem uma pessoa/endereço (evita "name" de produto)
    var personLike = out.email || out.phone || (out.zip && (out.city || out.first_name));
    if (!personLike) return null;
    if (out.email && !RE_EMAIL.test(str(out.email))) delete out.email; // "username" pode ser CPF
    return out;
  }

  function scan(obj, source, depth, customerCtx) {
    if (!obj || typeof obj !== 'object' || depth > 6) return;
    if (Array.isArray(obj)) { for (var i = 0; i < obj.length && i < 50; i++) scan(obj[i], source, depth + 1, customerCtx); return; }
    var got = pick(obj);
    if (got) {
      if (customerCtx && obj.id != null && got.email) got.customer_id = obj.id;
      ingest(got, source);
    }
    for (var k in obj) {
      if (!obj.hasOwnProperty(k) || BLOCK_KEY.test(k)) continue;
      if (obj[k] && typeof obj[k] === 'object') scan(obj[k], source, depth + 1, customerCtx || /^customer$/i.test(k));
    }
  }

  /* ---------------- fonte 2: dataLayer ---------------- */
  function hookDataLayer() {
    var dl = w[DL_NAME] = w[DL_NAME] || [];
    function handle(entry) {
      try {
        if (!entry) return;
        // gtag('event', ..., {customer:{...}}) chega como Arguments
        if (entry.length && typeof entry[0] === 'string' && entry[2]) scan(entry[2], 'gtag', 0, false);
        else scan(entry, 'dataLayer', 0, false);
      } catch (e) {}
    }
    for (var i = 0; i < dl.length; i++) handle(dl[i]);
    var orig = dl.push;
    dl.push = function () {
      for (var j = 0; j < arguments.length; j++) handle(arguments[j]);
      return orig.apply(dl, arguments);
    };
  }

  /* ---------------- fonte 3: fetch / XHR da loja e do checkout ---------------- */
  var API_RE = CFG.apiPattern || /\/(checkout-api|api)\/.*(customer|account|auth|address|checkout|order|newsletter|subscriber|lead|cart|me\b)/i;
  var MAX_BODY = 200000;
  function sameOrigin(url) {
    try { return new URL(url, location.href).origin === location.origin; } catch (e) { return false; }
  }
  function tryJSON(t) { if (!t || t.length > MAX_BODY) return null; try { return JSON.parse(t); } catch (e) { return null; } }
  function inspect(url, reqBody, resText) {
    if (!sameOrigin(url) || !API_RE.test(url)) return;
    var isCustomer = /customer|account|auth/i.test(url);
    if (typeof reqBody === 'string') { var rb = tryJSON(reqBody); if (rb) scan(rb, 'request', 0, false); }
    var rj = tryJSON(resText);
    if (rj) scan(rj, 'response', 0, isCustomer);
  }
  function hookFetch() {
    if (!w.fetch) return;
    var of = w.fetch;
    w.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var body = init && init.body;
      var p = of.apply(this, arguments);
      try {
        if (sameOrigin(url) && API_RE.test(url)) {
          p.then(function (res) {
            var ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
            if (ct.indexOf('json') === -1) { inspect(url, body, ''); return; }
            res.clone().text().then(function (t) { inspect(url, body, t); }, function () {});
          }, function () {});
        }
      } catch (e) {}
      return p;
    };
  }
  function hookXHR() {
    var X = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
    if (!X) return;
    var oo = X.open, os = X.send;
    X.open = function (m, url) { this.__cvtUrl = url; return oo.apply(this, arguments); };
    X.send = function (body) {
      var xhr = this, url = xhr.__cvtUrl || '';
      try {
        if (sameOrigin(url) && API_RE.test(url)) {
          xhr.addEventListener('load', function () {
            try {
              var t = (xhr.responseType === '' || xhr.responseType === 'text') ? xhr.responseText
                    : (xhr.responseType === 'json' ? JSON.stringify(xhr.response) : '');
              inspect(url, body, t);
            } catch (e) {}
          });
        }
      } catch (e) {}
      return os.apply(this, arguments);
    };
  }

  /* ---------------- fonte 4: formulários (sem acionador do GTM) ---------------- */
  var FIELD = [
    ['email', /e-?mail/],
    ['zip', /\bcep\b|postcode|postal|zip/],
    ['phone', /celular|telefone|\bfone\b|phone|whats|\btel\b|mobile/],
    ['last_name', /sobrenome|last.?name|surname|lastname/],
    ['first_name', /first.?name|firstname|primeiro.?nome/],
    ['full_name', /nome.?completo|full.?name|(^|[\s:_\-])(name|nome)($|[\s:_\-])/],
    ['city', /cidade|\bcity\b/],
    ['region', /\bestado\b|\buf\b|region|\bstate\b/],
    ['country', /\bpa[ií]s\b|country/]
  ];
  var BLOCK_FIELD = /cpf|cnpj|taxvat|documento|document|\brg\b|senha|password|card|cart[aã]o|cvv|cvc|validade|nascimento|birth|cupom|coupon|token|search|busca|empresa|company|raz[aã]o|destinat|presente|gift|rua|street|logradouro|n[uú]mero|number|complemento|bairro|neighbo/;

  function describe(el) {
    var lbl = '';
    try {
      if (el.id) { var l = d.querySelector('label[for="' + (w.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]'); if (l) lbl = l.textContent; }
      if (!lbl && el.closest) { var p = el.closest('label'); if (p) lbl = p.textContent; }
    } catch (e) {}
    return noAccent([el.name, el.id, el.getAttribute('autocomplete'), el.getAttribute('placeholder'), el.getAttribute('aria-label'), lbl].join(' ').toLowerCase());
  }
  function classify(el) {
    var tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT') return null;
    var type = (el.type || '').toLowerCase();
    if (/password|hidden|checkbox|radio|submit|button|file|date|number|range/.test(type)) return null;
    var desc = describe(el);
    var ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    // autocomplete padrão tem prioridade
    if (/\bemail\b/.test(ac) || type === 'email') return 'email';
    if (/\btel/.test(ac)) return 'phone';
    if (/postal-code/.test(ac)) return 'zip';
    if (/given-name/.test(ac)) return 'first_name';
    if (/family-name/.test(ac)) return 'last_name';
    if (/(^|\s)name$/.test(ac)) return 'full_name';
    if (/address-level2/.test(ac)) return 'city';
    if (/address-level1/.test(ac)) return 'region';
    // campos mistos "CPF ou e-mail" / login: só vira e-mail se o valor digitado for e-mail
    if (/e-?mail|user|login/.test(desc) && RE_EMAIL.test(str(el.value))) return 'email';
    if (BLOCK_FIELD.test(desc)) return null;
    for (var i = 0; i < FIELD.length; i++) if (FIELD[i][1].test(desc)) return FIELD[i][0];
    // campo de login "username": só se o valor for e-mail
    if (/user|login/.test(desc) && RE_EMAIL.test(str(el.value))) return 'email';
    return null;
  }
  function onField(ev) {
    var el = ev.target;
    if (!el || !el.tagName) return;
    var f = classify(el);
    if (!f) return;
    var val = el.tagName === 'SELECT' ? ((el.options[el.selectedIndex] || {}).value || (el.options[el.selectedIndex] || {}).text) : el.value;
    if (!str(val)) return;
    var o = {}; o[f] = val;
    ingest(o, 'form');
  }
  function onSubmit(ev) {
    var form = ev.target;
    if (!form || !form.elements) return;
    for (var i = 0; i < form.elements.length; i++) onField({ target: form.elements[i] });
  }
  function hookForms() {
    d.addEventListener('change', onField, true);
    d.addEventListener('focusout', onField, true);
    d.addEventListener('submit', onSubmit, true);
  }

  /* ---------------- legado: migra e (opcional) remove texto puro ---------------- */
  function migrateLegacy() {
    for (var i = 0; i < LEGACY.length; i++) {
      try {
        var raw = localStorage.getItem(LEGACY[i]);
        if (!raw) continue;
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          var p = pick(o);
          if (p) ingest(p, 'legacy:' + LEGACY[i]);
        }
        if (CFG.purgeLegacy) localStorage.removeItem(LEGACY[i]);
      } catch (e) {}
    }
  }

  /* ---------------- init ---------------- */
  w.cvtUserData = api;
  try { hookDataLayer(); } catch (e) {}
  try { hookFetch(); } catch (e) {}
  try { hookXHR(); } catch (e) {}
  try { hookForms(); } catch (e) {}
  try { migrateLegacy(); } catch (e) {}
  log('ready', api.has() ? 'com dados' : 'vazio');
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);

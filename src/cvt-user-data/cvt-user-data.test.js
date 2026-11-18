const { JSDOM } = require('jsdom');
const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert');
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const file = process.argv[2] || __dirname + '/cvt-user-data-loader.js';
const code = fs.readFileSync(file, 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));

const FORM = `<!doctype html><body>
  <form id="f">
    <input name="newsletter4081:name" placeholder="Seu nome">
    <input name="newsletter4081:email" placeholder="Seu e-mail">
    <label for="login-username">CPF ou e-mail</label><input id="login-username" name="username">
    <input name="cpf" placeholder="CPF">
    <input type="password" name="password">
    <input type="tel" name="cep" placeholder="Digite seu CEP">
    <input type="tel" name="celular">
    <input name="rua" placeholder="Rua">
  </form></body>`;

function boot(opts) {
  const dom = new JSDOM(FORM, { url: 'https://hocks.com.br/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  if (opts.before) opts.before(w);
  w.dataLayer = w.dataLayer || [];
  w.gtagCalls = [];
  w.gtag = function () { w.gtagCalls.push([...arguments]); };
  w.fetch = async () => ({ headers: { get: () => 'application/json' }, clone() { return { text: async () => JSON.stringify({ error: false, data: { id: 98765, first_name: 'João', last_name: 'da Silva', email: 'Joao.Silva@Gmail.com', phone: '(11) 91234-5678', taxvat: '12345678900', addresses: [{ postcode: '01310-100', city: 'São Paulo', region: 'SP', street: 'Av Paulista' }] } }) }; } });
  w.cvtUDConfig = Object.assign({ debug: false }, opts.cfg || {});
  w.eval(code);
  return w;
}
const ls = (w, st) => JSON.parse(w[st].getItem('cvt_ud') || 'null');

(async () => {
  /* ---------- 1. sem consentimento: só sessionStorage ---------- */
  let w = boot({ before: w => w.localStorage.setItem('meta_user_data', JSON.stringify({ email: 'Legacy@Test.com', phone: '54996339814', taxvat: '01353849074', first_name: 'Allen' })) });
  await wait(400);
  let s = w.cvtUserData.get();
  assert.strictEqual(s.data.email, 'legacy@test.com', 'legado email');
  assert.strictEqual(s.data.phone, '5554996339814', 'legado phone');
  assert.strictEqual(s.consent, false);
  assert.ok(ls(w, 'sessionStorage') && !ls(w, 'localStorage'), 'sem consentimento -> só sessionStorage');
  assert.ok(!JSON.stringify(s).includes('01353849074') && !JSON.stringify(s).includes(sha('01353849074')), 'sem CPF');

  const f = w.document.getElementById('f');
  const set = (n, v, ev) => { const el = f.querySelector(`[name="${n}"]`); el.value = v; el.dispatchEvent(new w.Event(ev || 'change', { bubbles: true })); };
  set('cpf', '111.222.333-44'); set('password', 'segredo123'); set('rua', 'Rua X');
  set('newsletter4081:name', 'Maria Clara Souza'); set('newsletter4081:email', ' MARIA@exemplo.com.br ');
  set('cep', '88372-502'); set('celular', '(47) 99999-8888');
  await wait(400);
  s = w.cvtUserData.get();
  assert.strictEqual(s.data.email, 'maria@exemplo.com.br');
  assert.strictEqual(s.hashed.email, sha('maria@exemplo.com.br'));
  assert.strictEqual(s.data.first_name, 'maria');
  assert.strictEqual(s.data.last_name, 'clara souza');
  assert.strictEqual(s.data.phone, '5547999998888');
  assert.strictEqual(s.data.phone_e164, '+5547999998888');
  assert.strictEqual(s.hashed.phone_e164, sha('+5547999998888'));
  assert.strictEqual(s.data.postal_code, '88372502');
  const raw = w.sessionStorage.getItem('cvt_ud');
  ['111.222.333-44', '11122233344', 'segredo123', 'Rua X'].forEach(x => assert.ok(!raw.includes(x), 'vazou ' + x));

  // login "CPF ou e-mail": CPF ignorado, e-mail captado
  set('username', '12345678900', 'focusout'); await wait(300);
  assert.strictEqual(w.cvtUserData.get().data.email, 'maria@exemplo.com.br', 'CPF no login ignorado');
  set('username', 'Login@Exemplo.com', 'focusout'); await wait(300);
  assert.strictEqual(w.cvtUserData.get().data.email, 'login@exemplo.com', 'e-mail no login captado');

  // API do checkout
  await w.fetch('/checkout-api/auth/customers/me'); await wait(400);
  s = w.cvtUserData.get();
  assert.strictEqual(s.data.email, 'joao.silva@gmail.com');
  assert.strictEqual(s.hashed.email_gmail, sha('joaosilva@gmail.com'));
  assert.strictEqual(s.data.first_name, 'joão');
  assert.strictEqual(s.data.customer_id, '98765');
  assert.strictEqual(s.hashed.customer_id, sha('98765'));
  assert.strictEqual(s.data.city, 'são paulo');
  assert.strictEqual(s.hashed.city, sha('sãopaulo'));
  assert.strictEqual(s.data.region, 'sp');
  assert.ok(!JSON.stringify(s).includes('12345678900') && !JSON.stringify(s).includes(sha('12345678900')), 'sem CPF da API');

  // dataLayer nativo
  w.dataLayer.push({ event: 'purchase', eventModel: { customer: { email: 'dl@teste.com', phone: '11988887777' } }, items: [{ name: 'Tênis', price: 10 }] });
  await wait(400);
  assert.strictEqual(w.cvtUserData.get().data.email, 'dl@teste.com');

  /* ---------- 2. aceite no banner Convertr (Vuex) -> migra para localStorage ---------- */
  let cb = null;
  w.$nuxt = { $store: { state: { lgpd: { lgpd: { expire_at: null } } }, watch: (getter, fn) => { cb = fn; } } };
  w.cvtUserData.recheckConsent();
  assert.ok(!ls(w, 'localStorage'), 'banner sem aceite -> continua na sessão');
  w.$nuxt.$store.state.lgpd.lgpd.expire_at = new Date(Date.now() + 30 * 864e5).toISOString();
  w.cvtUserData.recheckConsent();
  assert.ok(ls(w, 'localStorage') && !ls(w, 'sessionStorage'), 'aceite -> localStorage');
  assert.strictEqual(ls(w, 'localStorage').data.email, 'dl@teste.com');
  assert.strictEqual(ls(w, 'localStorage').consent, true);
  assert.ok(JSON.parse(w.localStorage.getItem('cvt_consent')).granted, 'marca de aceite para o checkout');

  // nova captura com aceite vai direto para o localStorage
  w.cvtUserData.ingest({ email: 'novo@x.com' }, 'manual'); await wait(400);
  assert.strictEqual(ls(w, 'localStorage').data.email, 'novo@x.com');

  // não envia nada
  assert.strictEqual(w.gtagCalls.length, 0, 'não chama gtag');
  assert.ok(!w.dataLayer.some(e => e.event === 'cvt_user_data'), 'não faz push');

  /* ---------- 3. aceite expirado -> volta para a sessão ---------- */
  w.$nuxt.$store.state.lgpd.lgpd.expire_at = new Date(Date.now() - 1000).toISOString();
  w.cvtUserData.recheckConsent();
  assert.ok(!ls(w, 'localStorage') && ls(w, 'sessionStorage'), 'consentimento expirado -> sessionStorage');
  assert.ok(!w.localStorage.getItem('cvt_consent'), 'marca removida');

  /* ---------- 4. checkout (sem Nuxt) com marca de aceite -> localStorage ---------- */
  let w2 = boot({ before: w => w.localStorage.setItem('cvt_consent', JSON.stringify({ granted: true, expire_at: Date.now() + 864e5 })) });
  w2.cvtUserData.ingest({ email: 'checkout@x.com' }, 'manual'); await wait(400);
  assert.ok(ls(w2, 'localStorage') && !ls(w2, 'sessionStorage'), 'checkout com marca -> localStorage');

  /* ---------- 5. Consent Mode do Google ---------- */
  let w3 = boot({ before: w => { w.dataLayer = [['consent', 'default', { ad_user_data: 'denied' }]]; } });
  w3.cvtUserData.ingest({ email: 'cm@x.com' }, 'manual'); await wait(400);
  assert.ok(ls(w3, 'sessionStorage') && !ls(w3, 'localStorage'), 'consent mode negado -> sessão');
  w3.gtag = function () { w3.dataLayer.push(arguments); };
  w3.gtag('consent', 'update', { ad_user_data: 'granted' }); await wait(50);
  assert.ok(ls(w3, 'localStorage') && !ls(w3, 'sessionStorage'), 'consent mode concedido -> localStorage');

  /* ---------- 6. consent: true forçado ---------- */
  let w4 = boot({ cfg: { consent: true } });
  w4.cvtUserData.ingest({ phone: '(47) 98888-7777' }, 'manual'); await wait(400);
  assert.strictEqual(ls(w4, 'localStorage').data.phone, '5547988887777');

  console.log(JSON.stringify(ls(w, 'sessionStorage').data));
  console.log('ALL TESTS PASSED:', file.split('/').pop());
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

const { JSDOM } = require('jsdom');
const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert');
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const file = process.argv[2] || __dirname + '/../src/cvt-user-data/cvt-user-data-loader.js';
const code = fs.readFileSync(file, 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <form id="f">
      <input name="newsletter4081:name" placeholder="Seu nome">
      <input name="newsletter4081:email" placeholder="Seu e-mail">
      <input id="login-username" name="username">
      <input name="cpf" placeholder="CPF">
      <input type="password" name="password">
      <input type="tel" name="cep" placeholder="Digite seu CEP">
      <input type="tel" name="celular">
      <input name="rua" placeholder="Rua">
    </form></body>`, { url: 'https://hocks.com.br/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  // legado em texto puro, inclusive CPF
  w.localStorage.setItem('meta_user_data', JSON.stringify({ email: 'Legacy@Test.com', phone: '54996339814', taxvat: '01353849074', first_name: 'Allen' }));
  w.dataLayer = [];
  const gtagCalls = [];
  w.gtag = function () { gtagCalls.push([...arguments]); };
  // fetch falso do checkout
  w.fetch = async (url) => ({ headers: { get: () => 'application/json' }, clone() { return { text: async () => JSON.stringify({ error: false, data: { id: 98765, first_name: 'João', last_name: 'da Silva', email: 'Joao.Silva@Gmail.com', phone: '(11) 91234-5678', taxvat: '12345678900', addresses: [{ postcode: '01310-100', city: 'São Paulo', region: 'SP', street: 'Av Paulista' }] } }) }; } });
  w.cvtUDConfig = { purgeLegacy: true, debug: false };
  w.eval(code);

  await wait(400);
  let s = w.cvtUserData.get();
  assert.strictEqual(s.hashed.email, sha('legacy@test.com'), 'legado email');
  assert.strictEqual(s.hashed.phone, sha('5554996339814'), 'legado phone');
  assert.ok(!w.localStorage.getItem('meta_user_data'), 'legado removido');
  assert.ok(!JSON.stringify(s).includes('01353849074') && !JSON.stringify(s).includes(sha('01353849074')), 'sem CPF');

  // formulário
  const f = w.document.getElementById('f');
  const set = (n, v) => { const el = f.querySelector(`[name="${n}"]`); el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  set('cpf', '111.222.333-44'); set('password', 'segredo123'); set('rua', 'Rua X');
  set('newsletter4081:name', 'Maria Clara Souza'); set('newsletter4081:email', ' MARIA@exemplo.com.br ');
  set('cep', '88372-502'); set('celular', '(47) 99999-8888');
  await wait(400);
  s = w.cvtUserData.get();
  assert.strictEqual(s.hashed.email, sha('maria@exemplo.com.br'));
  assert.strictEqual(s.hashed.first_name, sha('maria'));
  assert.strictEqual(s.hashed.last_name, sha('clara souza'));
  assert.strictEqual(s.hashed.phone, sha('5547999998888'));
  assert.strictEqual(s.hashed.phone_e164, sha('+5547999998888'));
  assert.strictEqual(s.plain.postal_code, '88372502');
  const raw = w.localStorage.getItem('cvt_ud');
  ['111.222.333-44', '11122233344', 'segredo123', 'maria@', 'Rua X', 'Maria'].forEach(x => assert.ok(!raw.includes(x), 'vazou ' + x));

  // username com CPF não vira email
  const u = f.querySelector('[name="username"]'); u.value = '12345678900'; u.dispatchEvent(new w.Event('focusout', { bubbles: true }));
  await wait(300);
  assert.strictEqual(w.cvtUserData.get().hashed.email, sha('maria@exemplo.com.br'));

  // checkout API
  await w.fetch('/checkout-api/auth/customers/me');
  await wait(400);
  s = w.cvtUserData.get();
  assert.strictEqual(s.hashed.email, sha('joao.silva@gmail.com'));
  assert.strictEqual(s.hashed.email_gmail, sha('joaosilva@gmail.com'));
  assert.strictEqual(s.hashed.first_name, sha('joão'));
  assert.strictEqual(s.hashed.customer_id, sha('98765'));
  assert.strictEqual(s.hashed.city, sha('sãopaulo'));
  assert.strictEqual(s.plain.city, 'são paulo');
  assert.strictEqual(s.plain.region, 'sp');
  assert.ok(!JSON.stringify(s).includes(sha('12345678900')));

  // dataLayer nativo (gtag event com customer)
  w.dataLayer.push({ event: 'purchase', eventModel: { customer: { email: 'dl@teste.com', phone: '11988887777' } }, items: [{ name: 'Tênis', price: 10 }] });
  await wait(400);
  assert.strictEqual(w.cvtUserData.get().hashed.email, sha('dl@teste.com'));

  // não envia nada: sem gtag, sem push no dataLayer, sem formatos por plataforma
  assert.strictEqual(gtagCalls.length, 0, 'não deve chamar gtag');
  assert.ok(!w.dataLayer.some(e => e.event === 'cvt_user_data'), 'não deve fazer push');
  ['google','meta','tiktok','pinterest'].forEach(f => assert.ok(!(f in w.cvtUserData), 'sem ' + f));
  let got = null; w.cvtUserData.onChange(st => got = st);
  w.cvtUserData.ingest({ email: 'novo@x.com' }, 'manual'); await wait(400);
  assert.strictEqual(got.hashed.email, sha('novo@x.com'));
  assert.strictEqual(JSON.parse(w.localStorage.getItem('cvt_ud')).v, 2);
  console.log(JSON.stringify(w.cvtUserData.get()));
  console.log('ALL TESTS PASSED:', file.split('/').pop());
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

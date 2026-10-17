const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
const source = fs.readFileSync(path.join(dist, 'shop.js'), 'utf8');
const catalogSource = fs.readFileSync(path.join(dist, 'catalog.js'), 'utf8');
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function visitFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(e =>
    e.isDirectory() ? visitFiles(path.join(directory, e.name)) : [path.join(directory, e.name)]);
}
const files = visitFiles(dist);
function verifyLinks(markup, context) {
  for (const match of markup.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const value = match[1];
    if (!value.startsWith('/')) continue;
    const local = decodeURIComponent(new URL(value, 'https://example.test').pathname);
    const target = path.join(dist, local, local.endsWith('/') ? 'index.html' : '');
    check(fs.existsSync(target), `${context}: missing ${local}`);
  }
}
for (const filename of files.filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(filename, 'utf8');
  check(html.includes('lang="ar" dir="rtl"'), `${filename}: RTL`);
  check(!html.includes('codex-preview'), `${filename}: no preview metadata`);
  check(html.includes('/catalog.js') && html.includes('/shop.js'), `${filename}: scripts`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  check(ids.length === new Set(ids).size, `${filename}: unique IDs`);
  verifyLinks(html, filename);
}
for (const p of catalog.products) {
  check(catalog.categories.some(c => c.id === p.category), `${p.id}: category`);
  check(fs.existsSync(path.join(dist, 'products', p.id, 'index.html')), `${p.id}: page`);
  check(fs.existsSync(path.join(dist, 'assets', p.image)), `${p.id}: photo`);
  check(p.specs.length >= 4 && p.description.length > 30, `${p.id}: details`);
  check(/^https:\/\//.test(p.source) && /^https:\/\//.test(p.market), `${p.id}: sources`);
  for (const state of ['new', 'used']) {
    const prices = p.prices[state];
    check(prices.length === 2 && prices[0] > 0 && prices[1] >= prices[0], `${p.id}: ${state} prices`);
  }
}
check(catalog.products.length === new Set(catalog.products.map(p => p.id)).size, 'unique models');
const css = files.filter(f => f.endsWith('.css')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
check((css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length, 'CSS balanced braces');
check(!css.includes("500;600;700;800;900&display=swap'),"), 'no broken external font import');
for (const weight of ['light', 'regular', 'medium', 'bold']) {
  check(fs.existsSync(path.join(dist, 'assets/fonts', `hayyakum-${weight}.woff`)), `${weight} font`);
}

// Execute the real client script against a small, deterministic DOM substitute.
// This verifies behavior without launching a browser or contacting WhatsApp.
class Element {
  constructor() {
    this.value = ''; this.innerHTML = ''; this.dataset = {}; this.attrs = {};
    this.handlers = {}; this.nodes = {}; this.hidden = false; this.textContent = '';
    const classes = new Set();
    this.classList = {add: v => classes.add(v), toggle: (v, state) => state ? classes.add(v) : classes.delete(v), contains: v => classes.has(v)};
  }
  addEventListener(type, listener) { (this.handlers[type] ||= []).push(listener); }
  fire(type, target = this) { for (const listener of this.handlers[type] || []) listener({target, preventDefault() {}}); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  querySelector(key) { return this.nodes[key] ||= new Element(); }
  after(node) { this.afterNode = node; }
  focus() { this.focused = true; }
  scrollBy(options) { this.lastScroll = options; }
}
function clickTarget(data) { return {dataset: data, closest(selector) {
  const key = selector.slice(6, -1).replace(/-([a-z])/g, (_, x) => x.toUpperCase());
  return Object.hasOwn(data, key) ? this : null;
}}; }
function setup(page, suffix = '') {
  let current = new URL(`https://example.test/${page === 'home' ? '' : page.startsWith('product:') ? 'products/' + page.slice(8) + '/' : page + '/'}${suffix}`);
  const nodes = new Map();
  const document = new Element();
  document.body = new Element(); document.body.dataset.page = page;
  const menu = new Element();
  const shelves = catalog.categories.map(c => { const e = new Element(); e.dataset.shelf = c.id; return e; });
  const categoryLinks = catalog.categories.map(c => { const e = new Element(); e.pathname = '/' + c.id + '/'; return e; });
  document.querySelectorAll = selector => selector === '.all-departments' ? [menu] : selector === '[data-shelf]' ? shelves : selector === '.category-bar a' ? categoryLinks : [];
  document.createElement = () => new Element();
  document.querySelector = selector => {
    if (selector === '#sell-form' && page !== 'sell') return null;
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  const location = {get search() {return current.search}, get href() {return current.href}, get pathname() {return current.pathname}, get hash() {return current.hash}, get origin() {return current.origin}, replace(url) {location.replaced = url}};
  const opened = []; const stored = new Map();
  const context = vm.createContext({document, location, URL, URLSearchParams, console,
    history: {replaceState(_a, _b, value) {current = new URL(value)}},
    window: {open(...args) {opened.push(args)}},
    matchMedia() {return {matches: false}},
    localStorage: {getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value)}});
  vm.runInContext(catalogSource + '\n' + source, context);
  return {context, nodes, document, shelves, menu, location, opened, stored};
}
const cards = element => (element.innerHTML.match(/<article class="product">/g) || []).length;
const home = setup('home');
for (const shelf of home.shelves) {
  const items = catalog.products.filter(p => p.category === shelf.dataset.shelf);
  const strip = shelf.querySelector('.product-strip');
  check(cards(strip) === items.length * 2, `${shelf.dataset.shelf}: home cards`);
  shelf.fire('click', clickTarget({shelfCondition: 'used'}));
  check(cards(strip) === items.length, `${shelf.dataset.shelf}: used shelf filter`);
  check(!strip.innerHTML.includes('condition-tag new'), 'no new cards in used filter');
  shelf.fire('click', clickTarget({sub: items[0].sub}));
  check(cards(strip) === items.filter(p => p.sub === items[0].sub).length, 'shelf type filter');
  shelf.fire('click', clickTarget({shift: '1'}));
  check(strip.lastScroll.left < 0, 'RTL next products');
  verifyLinks(strip.innerHTML, 'home shelf');
}
for (const c of catalog.categories) {
  const items = catalog.products.filter(p => p.category === c.id);
  const env = setup(c.id);
  const get = id => env.nodes.get('#' + id);
  check(cards(get('category-products')) === items.length * 2, c.id + ': all results');
  get('condition-filter').value = 'used'; get('condition-filter').fire('change');
  check(cards(get('category-products')) === items.length, c.id + ': used results');
  get('brand-filter').value = items[0].brand; get('brand-filter').fire('change');
  check(cards(get('category-products')) === items.filter(p => p.brand === items[0].brand).length, c.id + ': brand results');
  get('catalog-search').value = 'impossible-query-948122'; get('catalog-search').fire('input');
  check(cards(get('category-products')) === 0 && !get('no-results').hidden, c.id + ': empty state');
  get('reset-filters').fire('click');
  check(cards(get('category-products')) === items.length * 2 && get('no-results').hidden, c.id + ': reset');
  get('sort-filter').value = 'low'; get('sort-filter').fire('change');
  const order = [...get('category-products').innerHTML.matchAll(/class="product-art photo-art" href="\/products\/([^/]+)\/\?condition=(new|used)"/g)].map(m => catalog.products.find(p => p.id === m[1]).prices[m[2]][0]);
  check(order.every((p, i) => !i || p >= order[i - 1]), c.id + ': ascending prices');
  get('sort-filter').value = 'high'; get('sort-filter').fire('change');
  check(env.location.search.includes('sort=high'), c.id + ': persisted sort');
  verifyLinks(get('category-products').innerHTML, c.id);
  const deep = setup(c.id, '?condition=new&brand=' + encodeURIComponent(items[0].brand) + '&q=' + encodeURIComponent(items[0].name));
  check(cards(deep.nodes.get('#category-products')) === 1, c.id + ': shared deep link');
  const invalid = setup(c.id, '?condition=invalid&sub=missing&brand=missing&sort=invalid');
  check(cards(invalid.nodes.get('#category-products')) === items.length * 2, c.id + ': invalid filters recover');
}
for (const p of catalog.products) {
  for (const condition of ['new', 'used']) {
    const env = setup('product:' + p.id, '?condition=' + condition);
    const product = env.nodes.get('#product-page');
    check(product.innerHTML.includes(p.description) && product.innerHTML.includes(p.variant), p.id + ': description');
    check(product.innerHTML.includes(p.prices[condition][0].toLocaleString('en-US')), p.id + ': displayed price');
    check(product.innerHTML.includes('صورة مرجعية للموديل'), p.id + ': photo disclosure');
    check(product.innerHTML.includes('تقديرات تحريرية'), p.id + ': price disclosure');
    verifyLinks(product.innerHTML, p.id);
    const waLinks = [...product.innerHTML.matchAll(/href="(https:\/\/wa.me\/[^\"]+)"/g)];
    check(waLinks.some(m => decodeURIComponent(m[1]).includes(p.name)), p.id + ': WhatsApp product message');
    const other = condition === 'new' ? 'used' : 'new';
    product.fire('click', clickTarget({condition: other}));
    check(env.location.search.includes('condition=' + other), p.id + ': condition switch URL');
  }
}
const sell = setup('sell');
sell.nodes.get('#kind').value = 'جهاز ألعاب';
sell.document.querySelector('#model').value = 'PlayStation 5';
sell.document.querySelector('#condition').value = 'مستعمل بحالة جيدة';
sell.nodes.get('#sell-form').fire('submit');
check(sell.opened.length === 1 && decodeURIComponent(sell.opened[0][0]).includes('PlayStation 5'), 'sell message opens with model');
check(sell.opened[0][0].startsWith('https://wa.me/9647722282272'), 'correct WhatsApp number');
setup('branches');
const motion = home.nodes.get('#motion-toggle');
motion.fire('click'); check(home.stored.get('dubai-motion') === 'off', 'motion setting saved');
motion.fire('click'); check(home.stored.get('dubai-motion') === 'on', 'motion resumes');
const legacy = setup('home', '#phones/used/Apple');
check(legacy.location.replaced === 'https://example.test/phones/?condition=used&brand=Apple', 'legacy links redirect');
home.menu.open = true; home.document.fire('click', {closest() {return null}});
check(!home.menu.open, 'menu closes outside');
console.log(`PASS: ${checks} checks; ${catalog.categories.length} category pages, ${catalog.products.length} product pages. Browser layout QA is not included.`);

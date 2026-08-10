import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const htmlPath = new URL('../public/index.html', import.meta.url);
const html = await readFile(htmlPath, 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!source) throw new Error('game script not found');

class Classes {
  constructor(value = '') { this.values = new Set(value.split(/\s+/).filter(Boolean)); }
  add(...xs) { xs.forEach(x => this.values.add(x)); }
  remove(...xs) { xs.forEach(x => this.values.delete(x)); }
  contains(x) { return this.values.has(x); }
  toggle(x, force) { const on = force ?? !this.contains(x); on ? this.add(x) : this.remove(x); return on; }
}
function element(id = '', classes = '') {
  const listeners = new Map();
  const target = { id, style: { setProperty(key, value) { this[key] = value; } }, dataset: {}, classList: new Classes(classes), children: [], firstElementChild: null,
    textContent: '', innerHTML: '', value: '', checked: false, disabled: false, width: 300, height: 150,
    appendChild(child) { this.children.push(child); this.firstElementChild ||= child; return child; },
    append(...children) { children.forEach(child => this.appendChild(child)); },
    prepend(child) { this.children.unshift(child); this.firstElementChild = child; },
    remove() {}, focus() {}, blur() {}, setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    addEventListener(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
    dispatchEvent(event) { event.target ||= this; for (const fn of listeners.get(event.type) || []) fn(event); return true; },
    querySelector() { return element(); }, querySelectorAll() { return []; },
    getContext() { return new Proxy({ measureText: s => ({ width: String(s).length * 8 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), createPattern: () => ({}) }, { get: (o, k) => o[k] || (() => {}) }); },
  };
  return target;
}

export async function createGame() {
  const stored = new Map(); let context, document, now, timers;
  const boot = () => {
    now = 0; timers = []; const nodes = new Map();
    for (const match of html.matchAll(/<[^>]+\sid="([^"]+)"[^>]*>/g)) {
      const tag = match[0], node = element(match[1], tag.match(/class="([^"]*)"/)?.[1]);
      for (const [, key, value] of tag.matchAll(/data-([\w-]+)="([^"]*)"/g)) node.dataset[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      nodes.set(node.id, node);
    }
    for (const id of ['stick']) { const n = nodes.get(id); if (n && !n.firstElementChild) n.appendChild(element()); }
    document = { body: element('body'), documentElement: element('html'),
      getElementById: id => nodes.get(id) || (nodes.set(id, element(id)), nodes.get(id)),
      createElement: tag => element('', tag), querySelector: sel => sel.startsWith('#') ? nodes.get(sel.slice(1)) || null : null,
      querySelectorAll: () => [], addEventListener() {} };
    const localStorage = { getItem: k => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, String(v)), removeItem: k => stored.delete(k) };
    const schedule = (fn, delay = 0) => { const timer = { id: Symbol(), at: now + delay, fn }; timers.push(timer); return timer.id; };
    const sandbox = { console, document, localStorage, navigator: {}, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
      performance: { now: () => now }, Date, Math, JSON, Object, Array, Map, Set, Uint8Array,
      setTimeout: schedule, clearTimeout: id => { timers = timers.filter(t => t.id !== id); },
      setInterval: (fn, delay = 0) => schedule(fn, delay), clearInterval: id => { timers = timers.filter(t => t.id !== id); },
      requestAnimationFrame: fn => schedule(() => fn(now), 1000 / 60), cancelAnimationFrame: id => { timers = timers.filter(t => t.id !== id); },
      addEventListener() {}, removeEventListener() {}, getComputedStyle: () => ({}),
    };
    sandbox.window = sandbox; sandbox.globalThis = sandbox;
    context = vm.createContext(sandbox); vm.runInContext(source, context, { filename: 'public/index.html' });
  };
  boot();
  const evaluate = async (fn, arg) => {
    context.__arg = arg;
    return vm.runInContext(`(${fn.toString()})(__arg)`, context);
  };
  return { evaluate, async reload() { boot(); }, clearTimers() { timers = []; },
    advance(ms) { const end = now + ms; let guard = 0; while (guard++ < 100000) { timers.sort((a,b)=>a.at-b.at); const timer=timers[0]; if(!timer || timer.at>end) break; timers.shift(); now=timer.at; timer.fn(); } now=end; },
    dispatch(id, type, init={}) { const event={ type, preventDefault(){}, stopPropagation(){}, ...init }; return document.getElementById(id.replace(/^#/, '')).dispatchEvent(event); }
  };
}

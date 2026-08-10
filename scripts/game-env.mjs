/** ゲーム本体を Node だけで動かすための実行環境。
 *
 * 検査はブラウザを必要としない。enterFloor() や update() は描画を呼ばないため、
 * DOM を最小限にスタブすれば public/index.html の <script> をそのまま評価できる。
 * Playwright への依存を外すことで、ネットワークやブラウザバイナリが無い環境でも
 * npm run check が完走する。
 *
 * 検証の原則は守る: ここにゲーム本体の式・定数・確率は一切書かない。
 * すべての計測は sandbox 内のゲーム関数を呼んで行う。
 */
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const gamePath = new URL('../public/index.html', import.meta.url);
const noop = () => {};

function makeStyle() {
  return new Proxy({}, {
    get: (t, k) => (k === 'setProperty' || k === 'removeProperty' ? noop : (t[k] ?? '')),
    set: (t, k, v) => (t[k] = v, true),
  });
}

function makeContext2D() {
  return new Proxy({}, {
    get(target, key) {
      if (key === 'canvas') return { width: 390, height: 844 };
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') {
        return () => ({ addColorStop: noop });
      }
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return typeof target[key] === 'undefined' ? noop : target[key];
    },
    set: () => true,
  });
}

/** イベントは実際に配送する。長押しやポインタ操作の検査を Node のまま行えるようにするため。 */
function makeElement(document, tag = 'div') {
  const listeners = new Map();
  const element = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [], dataset: {}, style: makeStyle(),
    textContent: '', innerHTML: '', value: '', className: '', id: '', type: '', autocomplete: '',
    readOnly: false, checked: false, min: 0, max: 0, parentNode: null,
    classList: {
      set: new Set(),
      add(...names) { for (const name of names) this.set.add(name); },
      remove(...names) { for (const name of names) this.set.delete(name); },
      toggle(name, force) {
        if (force === undefined) return this.set.has(name) ? this.set.delete(name) : this.set.add(name);
        return force ? this.set.add(name) : this.set.delete(name);
      },
      contains(name) { return this.set.has(name); },
    },
    appendChild(child) { child.parentNode = element; element.children.push(child); return child; },
    append(...nodes) { for (const node of nodes) if (node && typeof node === 'object') element.appendChild(node); },
    prepend(...nodes) { for (const node of nodes.reverse()) if (node && typeof node === 'object') { node.parentNode = element; element.children.unshift(node); } },
    replaceChildren(...nodes) { element.children = []; element.append(...nodes); },
    insertBefore(child) { return element.appendChild(child); },
    insertAdjacentHTML: noop, after: noop, before: noop,
    removeChild(child) {
      const index = element.children.indexOf(child);
      if (index >= 0) element.children.splice(index, 1);
      return child;
    },
    remove() { if (element.parentNode) element.parentNode.removeChild(element); },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type);
      if (list) list.splice(list.indexOf(fn) >>> 0, 1);
    },
    dispatchEvent(event) {
      const list = listeners.get(event.type) || [];
      for (const fn of list.slice()) fn(event);
      return !event.defaultPrevented;
    },
    setAttribute(name, value) { element[name] = value; },
    getAttribute(name) { return element[name] ?? null; },
    focus: noop, blur: noop, select: noop, scrollIntoView: noop, click: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0 }),
    querySelector: selector => document.querySelector(selector),
    querySelectorAll: () => [],
    closest: () => null,
    getContext: () => document.context2d,
  };
  return element;
}

function makeDocument() {
  const cache = new Map();
  const document = {
    context2d: makeContext2D(),
    getElementById(id) {
      if (!cache.has(id)) {
        const element = makeElement(document);
        element.id = id;
        cache.set(id, element);
      }
      return cache.get(id);
    },
    /** #id はゲーム側の $("id") と同じ要素に解決する。それ以外は文字列ごとに同じスタブを返す。 */
    querySelector(selector) {
      if (typeof selector === 'string' && /^#[\w-]+$/.test(selector)) return document.getElementById(selector.slice(1));
      return document.getElementById(`selector:${selector}`);
    },
    querySelectorAll: () => [],
    createElement: tag => makeElement(document, tag),
    createElementNS: (_ns, tag) => makeElement(document, tag),
    createDocumentFragment: () => makeElement(document),
    addEventListener: noop, removeEventListener: noop, execCommand: noop,
    hidden: false, visibilityState: 'visible',
  };
  document.body = makeElement(document, 'body');
  document.documentElement = makeElement(document, 'html');
  document.head = makeElement(document, 'head');
  return document;
}

/** touches / changedTouches は渡されたときだけ生やす。
 *  実ブラウザの PointerEvent は touches を持たず、ゲーム側は
 *  `e.touches ? e.touches[0] : e` で分岐しているため、空配列を既定で置くと誤判定する。 */
function makeEvent(type, init = {}) {
  return {
    type, defaultPrevented: false, bubbles: true, cancelable: true,
    clientX: 0, clientY: 0, pointerId: 1, button: 0,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation: noop,
    ...init,
  };
}

/** localStorage はリロードをまたいで残す必要があるので呼び出し側から渡せるようにする。 */
function makeStorage(initial = new Map()) {
  return {
    map: initial,
    getItem(key) { return initial.has(key) ? initial.get(key) : null; },
    setItem(key, value) { initial.set(key, String(value)); },
    removeItem(key) { initial.delete(key); },
    clear() { initial.clear(); },
    get length() { return initial.size; },
    key(index) { return [...initial.keys()][index] ?? null; },
  };
}

let cachedSource = null;
async function gameSource() {
  if (cachedSource) return cachedSource;
  const html = await readFile(gamePath, 'utf8');
  const start = html.indexOf('<script>');
  const end = html.lastIndexOf('</script>');
  if (start < 0 || end < 0) throw new Error('public/index.html から <script> を取り出せない');
  cachedSource = html.slice(start + '<script>'.length, end);
  return cachedSource;
}

/**
 * ゲームを読み込んだサンドボックスを返す。
 *   run(fn, ...args)  ゲームのグローバルを見える状態で fn を実行し、戻り値を得る
 *   reload()          localStorage を保ったまま読み込み直す（セーブ移行の検査用）
 *   storage           localStorage の中身
 */
export async function loadGame(options = {}) {
  const source = await gameSource();
  const store = options.store ?? new Map();
  let sandbox;

  /** 仮想タイマー。実時間を待たずに advance(ms) で決定的に進める。 */
  let clock = 0, timerId = 0, timers = [];

  const build = () => {
    clock = 0; timerId = 0; timers = [];
    const document = makeDocument();
    const context = {
      document, console,
      localStorage: makeStorage(store),
      requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
      setTimeout(fn, delay = 0) { timers.push({ id: ++timerId, at: clock + delay, fn, every: 0 }); return timerId; },
      setInterval(fn, delay = 0) { timers.push({ id: ++timerId, at: clock + delay, fn, every: Math.max(1, delay) }); return timerId; },
      clearTimeout(id) { timers = timers.filter(t => t.id !== id); },
      clearInterval(id) { timers = timers.filter(t => t.id !== id); },
      queueMicrotask: noop,
      performance: { now: () => clock },
      navigator: { vibrate: noop, userAgent: 'node', clipboard: { writeText: () => Promise.resolve() } },
      devicePixelRatio: 2, innerWidth: 390, innerHeight: 844,
      addEventListener: noop, removeEventListener: noop,
      matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop, removeListener: noop }),
      AudioContext: function AudioContext() {
        return new Proxy({}, { get: () => () => new Proxy({}, { get: () => noop }) });
      },
      alert: noop, confirm: () => true, prompt: () => null,
      location: { reload: noop, href: '', search: '' },
      MouseEvent: function MouseEvent(type, init) { return makeEvent(type, init); },
      PointerEvent: function PointerEvent(type, init) { return makeEvent(type, init); },
      TouchEvent: function TouchEvent(type, init) { return makeEvent(type, init); },
      Event: function Event(type, init) { return makeEvent(type, init); },
      Image: function Image() { return makeElement(document, 'img'); },
    };
    context.webkitAudioContext = context.AudioContext;
    context.window = context;
    context.globalThis = context;
    context.self = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'public/index.html' });
    return context;
  };

  sandbox = build();

  return {
    get sandbox() { return sandbox; },
    storage: store,
    /** ゲームのグローバルスコープで fn を実行する。fn は外側の変数を参照できない。 */
    run(fn, ...args) {
      const call = `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`;
      return vm.runInContext(call, sandbox, { filename: 'check' });
    },
    /** 同じ localStorage で読み込み直す。 */
    reload() { sandbox = build(); },
    /** 未発火のタイマーを捨てる。
     *  大量の試行を回すと、仮想時間が進まないまま登録だけが積み上がる。
     *  その状態で advance() すると数千件が一度に発火して状態を壊すため、
     *  操作系の検査に入る前にここで切り離す。 */
    clearTimers() { timers = []; },
    /** 仮想時間を進め、期限の来た setTimeout / setInterval を発火する。 */
    advance(ms) {
      const target = clock + ms;
      for (let guard = 0; guard < 10000; guard++) {
        const due = timers.filter(t => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        clock = due.at;
        if (due.every) due.at += due.every; else timers = timers.filter(t => t !== due);
        due.fn();
      }
      clock = target;
    },
    /** 実際にイベントを配送する。長押しやポインタ操作の検査用。 */
    dispatch(elementId, type, init) {
      return this.run(function (id, eventType, eventInit) {
        const element = document.getElementById(id);
        const event = new PointerEvent(eventType, eventInit || {});
        return element.dispatchEvent(event);
      }, elementId, type, init);
    },
  };
}

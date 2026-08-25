/* 画面の作りが壊れていないかを機械的に見る検査。
   毎回ここで指摘が出ていた5種類を、人が気付く前に落とす。

     1. 同じ並びの枠なのに大きさが違う
     2. 内容がはみ出しているのにスクロールできない
     3. 画面を閉じても演出や状態が残る
     4. 文字が枠からはみ出す・枠と중心がズレる
     5. 色やフォントが指定漏れで別物になる

   実機と同じ 390x844 で、実際のDOMを測る。 */
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('playwright が無いためUI検査をスキップ'); process.exit(0); }

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const problems = [];
const notes = [];
const add = m => problems.push(m);

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => add(`未捕捉の例外: ${e.message}`));
await page.goto('file:///home/user/Hack_and_Slash/public/index.html');
await page.waitForTimeout(700);

/* 検査用に、そこそこ物を持った状態を作る */
await page.evaluate(() => {
  S.tutorial.done = true; S.tutorial.phase = null;
  ['scStart', 'scTitle', 'askPop', 'itPop'].forEach(id => document.getElementById(id)?.classList.remove('on'));
  S.deepest = 300; S.premium = 4800; S.gold = 182400;
  S.unlockedCharacters = CHARACTERS.warrior.map(c => 'warrior:' + c.id).concat(CHARACTERS.mage.map(c => 'mage:' + c.id));
  setLevelForAll(78);
  S.formation = ['warrior:leon', 'mage:noa', 'warrior:gerd'];
  S.consumables = { mend1: 5, mend2: 2, edge2: 3, ward1: 4, lamp1: 2 };
  S.stock = { ashfang: 22, gloomsilk: 9, hexbead: 4, voidlens: 3, riftcore: 1 };
  S.mats = { crystal: { 4: 880, 5: 61 }, core: { 4: 12 } };
  S.stash = []; for (let i = 0; i < 34; i++) S.stash.push(makeItem(120 + i * 4, 0, 0, i % 5));
  S.gear = Object.fromEntries(SLOTK.map(k => [k, null]));
  for (const slot of SLOTK) { let it; do it = makeItem(140, 0, 0, 3); while (it.slot !== slot || (it.ac && it.ac !== 'warrior')); it.lv = 8; S.gear[slot] = it; }
  S.p = newPlayer(); save();
});

/* 画面を開く手順。ここに足すだけで全検査の対象になる。 */
const SCREENS = [
  ['拠点', () => { S.tab = 'prep'; openTown(); }],
  ['装備', () => { S.tab = 'gear'; S.gearSub = 'equip'; openTown(); }],
  ['技', () => { S.tab = 'gear'; S.gearSub = 'skill'; openTown(); }],
  ['能力', () => { S.tab = 'gear'; S.gearSub = 'ability'; openTown(); }],
  ['倉庫:装備', () => { S.tab = 'inv'; S.invSub = 'gear'; openTown(); }],
  ['倉庫:道具', () => { S.tab = 'inv'; S.invSub = 'item'; openTown(); }],
  ['倉庫:結晶', () => { S.tab = 'inv'; S.invSub = 'mat'; openTown(); }],
  ['倉庫:調合', () => { S.tab = 'inv'; S.invSub = 'craft'; openTown(); }],
  ['商店', () => { S.tab = 'shop'; S.shopSub = 'gacha'; openTown(); }],
  ['設定', () => { S.tab = 'conf'; openTown(); }],
];

/* ---------- 1〜2・4〜5: 各画面をまとめて測る ---------- */
for (const [name, open] of SCREENS) {
  await page.evaluate(open);
  await page.waitForTimeout(180);
  const r = await page.evaluate(() => {
    const seen = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const body = document.getElementById('townBody');
    const out = { uneven: [], overflowX: [], clipped: [], badFont: [], lowContrast: [], scroll: null,
      tinyFont: [], collide: [], outside: [] };

    /* 1. 同じ並びの枠は同じ大きさであること。
          横に並ぶ兄弟（グリッド／フレックス）の高さを比べる。 */
    const rows = ['.g3', '.formation', '.loadout', '.innerTabs', '.charBar', '.craftBtns', '.matGrid'];
    for (const sel of rows) {
      for (const box of document.querySelectorAll(sel)) {
        const kids = [...box.children].filter(seen);
        if (kids.length < 2) continue;
        const hs = kids.map(k => Math.round(k.getBoundingClientRect().height));
        const ws = kids.map(k => Math.round(k.getBoundingClientRect().width));
        const spread = a => Math.max(...a) - Math.min(...a);
        /* 1行に収まっている並びだけを見る（折り返していれば高さが揃わなくて当然） */
        const tops = new Set(kids.map(k => Math.round(k.getBoundingClientRect().top / 4)));
        if (tops.size === 1 && spread(hs) > 2) out.uneven.push(`${sel} 高さ ${hs.join('/')}`);
        /* 横並びのキャラ切替は名前の長さで幅が変わってよい（最小幅だけ揃えている）。 */
        if (tops.size === 1 && spread(ws) > 2 && !box.classList.contains('charBar')) out.uneven.push(`${sel} 幅 ${ws.join('/')}`);
      }
    }

    /* 2. 内容がはみ出しているのにスクロールできない */
    if (body) {
      const cs = getComputedStyle(body);
      const over = body.scrollHeight - body.clientHeight;
      out.scroll = { over, oy: cs.overflowY };
      if (over > 2 && !/auto|scroll/.test(cs.overflowY)) out.scroll.stuck = true;
      /* 最後の子が本当に届く位置にあるか（負のマージンや固定要素で隠れていないか） */
      const last = body.lastElementChild;
      if (last) {
        const lb = last.getBoundingClientRect(), bb = body.getBoundingClientRect();
        out.scroll.lastBottomBeyond = Math.round(lb.bottom - (bb.top + body.scrollHeight));
      }
    }

    /* 4. 文字が枠からはみ出していないか（横方向）／親からあふれていないか */
    for (const el of document.querySelectorAll('#scTown .nm,#scTown .ty,#scTown .st,#scTown .btn,#scTown .tag,#scTown .mlv,#scTown b')) {
      if (!seen(el)) continue;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'auto' && cs.overflowX !== 'auto'
        && cs.textOverflow !== 'ellipsis' && cs.whiteSpace !== 'nowrap') {
        out.overflowX.push(`${el.className || el.tagName}「${(el.textContent || '').trim().slice(0, 14)}」`);
      }
      /* 親が overflow:hidden なのに、子の文字が外へ出ている */
      const p = el.parentElement;
      if (p) {
        const pc = getComputedStyle(p);
        if (/hidden|clip/.test(pc.overflow + pc.overflowY)) {
          const a = el.getBoundingClientRect(), b = p.getBoundingClientRect();
          if (a.bottom > b.bottom + 2 || a.top < b.top - 2) {
            out.clipped.push(`${p.className || p.tagName} 内「${(el.textContent || '').trim().slice(0, 14)}」`);
          }
        }
      }
    }

    /* 5. フォントと色。指定漏れで既定の serif に落ちていないか、
          文字が地に埋もれていないか。 */
    const lum = c => {
      const m = String(c).match(/[\d.]+/g); if (!m) return null;
      const [r, g, b] = m.map(Number);
      const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
    };
    const parse = c => { const m = String(c).match(/[\d.]+/g); if (!m) return null;
      return { r: +m[0], g: +m[1], b: +m[2], a: m[3] == null ? 1 : +m[3] }; };
    const bgOf = el => {
      /* 半透明の地は、親の地に重ねた結果で見る。透過を無視すると
         「金文字の上に12%の金地」を同色と誤判定する。 */
      const stack = [];
      let e = el;
      while (e) { const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0) { stack.push(c); if (c.a >= .999) break; } e = e.parentElement; }
      let out = { r: 10, g: 8, b: 14 };
      for (let i = stack.length - 1; i >= 0; i--) { const c = stack[i];
        out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a) }; }
      return `rgb(${out.r}, ${out.g}, ${out.b})`;
    };
    for (const el of document.querySelectorAll('#scTown *')) {
      if (!seen(el)) continue;
      const t = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!t) continue;
      const cs = getComputedStyle(el);
      if (/serif/i.test(cs.fontFamily) && !/sans-serif/i.test(cs.fontFamily)) {
        out.badFont.push(`${el.className || el.tagName}: ${cs.fontFamily.slice(0, 30)}`);
      }
      /* 文字を背景で塗る技法（background-clip:text）は color:transparent になるので、
         文字色と地の比では測れない。除外する。 */
      if (/text/.test(cs.webkitBackgroundClip || cs.backgroundClip || '')) continue;
      if (/rgba\(0, 0, 0, 0\)|transparent/.test(cs.color)) continue;
      const a = lum(cs.color), b = lum(bgOf(el));
      if (a != null && b != null) {
        const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        if (ratio < 2.2) out.lowContrast.push(`${el.className || el.tagName}「${(el.textContent || '').trim().slice(0, 12)}」比${ratio.toFixed(1)}`);
      }
    }
    /* 6. 文字の大きさの下限。7px や 8px は実機で潰れて読めない。 */
    for (const el of document.querySelectorAll('#scTown *')) {
      if (!seen(el)) continue;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 11) out.tinyFont.push(`${el.className || el.tagName}「${(el.textContent || '').trim().slice(0, 10)}」${px}px`);
    }

    /* 7. 印どうしの重なり。角に絶対配置した印が増えると必ずぶつかる。
          同じ親の中で重なっている small な要素を探す。 */
    for (const box of document.querySelectorAll('#scTown .slot,#scTown .cell,#scTown .member,#scTown .charChip,#scTown .loadSlot')) {
      const marks = [...box.querySelectorAll('*')].filter(e => {
        const cs = getComputedStyle(e);
        return seen(e) && cs.position === 'absolute' && (e.textContent || '').trim();
      });
      for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) {
        const a = marks[i].getBoundingClientRect(), b2 = marks[j].getBoundingClientRect();
        const ox = Math.min(a.right, b2.right) - Math.max(a.left, b2.left);
        const oy = Math.min(a.bottom, b2.bottom) - Math.max(a.top, b2.top);
        if (ox > 2 && oy > 2) out.collide.push(`${box.className.split(' ')[0]}: 「${marks[i].textContent.trim()}」と「${marks[j].textContent.trim()}」`);
      }
      /* 子が親の枠から外へ出ていないか（角の丸バッジがはみ出す事故） */
      const pb = box.getBoundingClientRect();
      for (const e of box.querySelectorAll('*')) {
        if (!seen(e)) continue;
        const cs = getComputedStyle(e);
        if (cs.position !== 'absolute') continue;
        const r2 = e.getBoundingClientRect();
        if (r2.left < pb.left - 1 || r2.right > pb.right + 1 || r2.top < pb.top - 1 || r2.bottom > pb.bottom + 1) {
          out.outside.push(`${box.className.split(' ')[0]} の「${(e.textContent || '').trim().slice(0, 6)}」が枠の外`);
        }
      }
    }
    return out;
  });

  if (r.tinyFont.length) add(`[${name}] 文字が小さすぎる（11px未満）: ${[...new Set(r.tinyFont)].slice(0, 4).join(' / ')}`);
  if (r.collide.length) add(`[${name}] 印どうしが重なっている: ${[...new Set(r.collide)].slice(0, 3).join(' / ')}`);
  if (r.outside.length) add(`[${name}] 印が枠からはみ出している: ${[...new Set(r.outside)].slice(0, 3).join(' / ')}`);
  if (r.uneven.length) add(`[${name}] 同じ並びの枠の大きさが違う: ${[...new Set(r.uneven)].slice(0, 3).join(' / ')}`);
  if (r.scroll?.stuck) add(`[${name}] 内容が ${r.scroll.over}px あふれているのにスクロールできない`);
  if (r.overflowX.length) add(`[${name}] 文字が枠から横にはみ出す: ${[...new Set(r.overflowX)].slice(0, 3).join(' / ')}`);
  if (r.clipped.length) add(`[${name}] 枠に切られて文字が読めない: ${[...new Set(r.clipped)].slice(0, 3).join(' / ')}`);
  if (r.badFont.length) add(`[${name}] フォント指定漏れ: ${[...new Set(r.badFont)].slice(0, 2).join(' / ')}`);
  if (r.lowContrast.length) add(`[${name}] 地に埋もれて読めない文字: ${[...new Set(r.lowContrast)].slice(0, 3).join(' / ')}`);
}
notes.push(`画面 ${SCREENS.length}面: 枠の大きさ・スクロール・文字のはみ出し・フォント・コントラスト・文字の下限・印の重なりを検査`);

/* ---------- 強調ボタンが地の色に埋もれていないこと ----------
   一括の面指定で .gold や .pri を上書きすると、「潜る」が普通のボタンと
   同じ見た目になる。実際にこれで色が消えたことがあるので検査に置く。 */
{
  const same = await page.evaluate(() => {
    S.tab = 'prep'; openTown();
    const bg = el => getComputedStyle(el).backgroundImage + '|' + getComputedStyle(el).backgroundColor;
    const plain = [...document.querySelectorAll('#scTown .btn.gh')][0];
    const out = [];
    if (!plain) return ['基準になる通常ボタンが無い'];
    for (const sel of ['.btn.gold', '.btn.pri', '#diveBar .go', '.nextCard .btn']) {
      for (const el of document.querySelectorAll('#scTown ' + sel + ', ' + sel)) {
        if (!el.getBoundingClientRect().width) continue;
        if (bg(el) === bg(plain)) out.push(`${sel}「${(el.textContent || '').trim().slice(0, 8)}」が通常ボタンと同じ面`);
      }
    }
    return [...new Set(out)];
  });
  for (const m of same) add(`強調ボタンの色が消えている: ${m}`);
  notes.push('強調ボタン（潜る・おすすめ等）が通常ボタンと区別できること');
}

/* ---------- 選択処分ドックは下部タブの上に1行で収まること ---------- */
{
  const dock = await page.evaluate(() => {
    S.tab = 'inv'; S.invSub = 'gear';
    F.sellMode = true; F.dismantleMode = false; F.sellSel = [];
    openTown();
    const el = document.querySelector('.sellDock');
    const tabs = document.querySelector('#scTown > .tabs');
    if (!el || !tabs) return null;
    const children = [...el.children].map(x => {
      const r = x.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, center: (r.top + r.bottom) / 2 };
    });
    const r = el.getBoundingClientRect(), t = tabs.getBoundingClientRect();
    return {
      count: children.length,
      centerSpread: Math.max(...children.map(x => x.center)) - Math.min(...children.map(x => x.center)),
      height: r.height,
      tabGap: t.top - r.bottom,
    };
  });
  if (!dock) add('売却選択ドックが表示されない');
  else {
    if (dock.count !== 3) add(`売却選択ドックの要素数が${dock.count}（合計／実行／キャンセルの3つではない）`);
    if (dock.centerSpread > 2) add(`売却選択ドックが1行ではない（中心差 ${dock.centerSpread.toFixed(1)}px）`);
    if (dock.height > 66) add(`売却選択ドックが高すぎる（${dock.height.toFixed(1)}px）`);
    if (Math.abs(dock.tabGap) > 3) add(`売却選択ドックと下部タブが接していない（間隔 ${dock.tabGap.toFixed(1)}px）`);
  }
  notes.push('売却・分解ドック: 合計／実行／キャンセルが1行で下部タブ直上に収まること');
}

/* ---------- 3. 演出と状態が残らないこと ---------- */
{
  const leftover = await page.evaluate(async () => {
    const out = {};
    /* 潜行 → 被弾 → 帰還 で、演出・弾・粒子・HUDが残らないこと */
    beginRun(80); S.paused = false;
    for (let i = 0; i < 40; i++) update(1 / 60);
    S.p.hp = S.p.max * .3; hurtP(50, 't', true);
    for (let i = 0; i < 10; i++) update(1 / 60);
    out.duringVig = +(document.getElementById('hurtVig')?.style.opacity || 0);
    /* 開いて、閉じて、開いたままにする（帰還で片付くかを見るため） */
    S.mapBig = false; toggleMap(); out.opened = S.mapBig;
    toggleMap(); out.closed = S.mapBig;
    toggleMap();
    endRun(true);
    await new Promise(r => setTimeout(r, 60));
    document.getElementById('scEnd')?.classList.remove('on');
    openTown();
    out.town = {
      vig: +(document.getElementById('hurtVig')?.style.opacity || 0),
      mapBig: !!S.mapBig,
      mapBigClass: document.getElementById('mmW').classList.contains('big'),
      fx: S.fx.length, bullets: S.bullets.length, parts: S.parts.length, nums: S.nums.length,
      enemies: S.enemies.length, drops: S.drops.length,
      openPopups: ['itPop', 'askPop', 'lvPop', 'scPause', 'scEnd']
        .filter(id => document.getElementById(id)?.classList.contains('on')),
      paused: S.paused, scene: S.scene,
    };
    return out;
  });
  const t = leftover.town;
  if (!(leftover.duringVig > 0)) add('被弾しても画面の縁が赤くならない');
  if (t.vig > 0) add(`帰還後も被弾の赤が残っている（不透明度 ${t.vig}）`);
  if (!leftover.opened) add('地図を押しても開かない');
  if (leftover.closed) add('地図をもう一度押しても閉じない');
  if (t.mapBig || t.mapBigClass) add('帰還後も大きい地図が開いたまま');
  for (const [k, label] of [['fx', '演出'], ['bullets', '弾'], ['nums', 'ダメージ表示'], ['enemies', '敵'], ['drops', '落ちている物']]) {
    if (t[k] > 0) add(`帰還後も${label}が残っている（${t[k]}件）`);
  }
  if (t.openPopups.length) add(`帰還後も開いたままの画面がある: ${t.openPopups.join(', ')}`);
  if (t.scene !== 'town') add(`帰還後の scene が ${t.scene}`);
  notes.push(`演出の後始末: 潜行→被弾→帰還で残留なし（演出${t.fx}/弾${t.bullets}/敵${t.enemies}）`);
}

/* ---------- ポップアップを開いて閉じたら必ず消えること ---------- */
{
  const pops = await page.evaluate(() => {
    const out = [];
    const close = () => document.getElementById('itPop').classList.remove('on');
    const cases = [
      ['装備枠', () => openGearDetail('weapon', false)],
      ['持ち込み枠', () => openLoadoutSlot(0)],
      ['キャラ選択', () => openCharacterPick()],
      ['提供割合', () => openGachaRates('gear')],
    ];
    for (const [n, fn] of cases) {
      try { fn(); } catch (e) { out.push(`${n}: 例外 ${e.message.slice(0, 40)}`); continue; }
      const opened = document.getElementById('itPop').classList.contains('on');
      const c = document.getElementById('itC');
      const empty = !c.textContent.trim();
      const overflow = c.scrollHeight - c.clientHeight;
      const cs = getComputedStyle(c);
      close();
      if (!opened) out.push(`${n}: 開かない`);
      if (empty) out.push(`${n}: 中身が空`);
      if (overflow > 2 && !/auto|scroll/.test(cs.overflowY)) out.push(`${n}: 内容が${overflow}pxあふれているのにスクロールできない`);
    }
    return out;
  });
  for (const p of pops) add(`ポップアップ ${p}`);
  notes.push('ポップアップ4種: 開閉・中身・スクロールを検査');
}

await browser.close();

console.log('=== 画面の作りの検査 ===');
for (const n of notes) console.log('  ' + n);
if (problems.length) {
  console.log('\n=== 問題 ===');
  for (const p of problems) console.log('・' + p);
  process.exit(1);
}
console.log('問題なし');

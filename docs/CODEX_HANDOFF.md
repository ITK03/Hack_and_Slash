# Codex handoff

Codex で作業するときは、`claude/diablo-style-hackslash-game-khlbrr` という名前のブランチや
`claude/` ディレクトリを探さなくてよい。この作業ブランチには、Claude 側で作られた簡易版の
ハクスラプロトタイプを取り込み済み。

## 読む順番

1. `README.md` — 遊び方、検証したい仮説、公開方法、実プレイURL。
2. `public/index.html` — ゲーム本体。HTML/CSS/JavaScript が 1 ファイルにまとまっている。
3. `docs/PLAN.md` — 長期設計。
4. `docs/HYPOTHESES.md` — プロトタイプで検証する仮説。

## ローカル起動

依存を入れなくても、静的ファイルとして確認できる。

```bash
npm run check
npm run serve
```

Cloudflare Workers と同じ形で確認したい場合だけ、依存を入れてから以下を使う。

```bash
npm install
npx wrangler dev
```

## 実プレイURL

Cloudflare Workers で公開している実プレイURLは以下。

```text
https://hack-and-slash.luyinshele.workers.dev
```

## 注意

- 公開対象は `wrangler.jsonc` の `assets.directory` で指定している `./public` のみ。
- `docs/` には設計・戦略メモがあるため、配信対象へ含めない。
- `public/index.html` 冒頭の `CFG` に調整値が集まっている。

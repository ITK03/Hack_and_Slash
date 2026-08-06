# Claude / Codex 連携ログ

このプロジェクトは Claude Code と Codex の両方で進める。片方の AI が作業した内容を、もう片方が
すぐ読めるようにするための共有メモ。

## 共有ルール

- 作業を始める前に、このファイルの「最新状況」と「直近の作業ログ」を読む。
- 変更を入れたら、何を変えたか・確認コマンド・次に見るべき点を追記する。
- ゲーム本体は現状 `public/index.html` の 1 ファイル。仕様や検証観点は `README.md`、
  長期設計は `docs/PLAN.md`、仮説は `docs/HYPOTHESES.md` を参照する。
- 大きな仕様変更をした場合は、README か PLAN/HYPOTHESES の該当箇所も更新する。

## 最新状況

- Claude 側で作られた簡易版プロトタイプは、Codex が読める現在の作業ブランチに取り込み済み。
- 現在のゲーム本体は `public/index.html`。HTML/CSS/JavaScript が 1 ファイルにまとまっている。
- 実プレイURLは `https://hack-and-slash.luyinshele.workers.dev`。Cloudflare Workers で `./public` を配信している。
- 起動前の読み取り確認は `npm run check`、ローカル起動は `npm run serve`。
- Cloudflare Workers の公開対象は `wrangler.jsonc` の `assets.directory` で指定している `./public` のみ。

## ゲーム仕様の要約

- スマホ縦画面向けの無限降下型ハクスラ。
- コアループは「拠点 → 潜る → 敵を倒す → 未鑑定品を拾う → 帰るかさらに潜るか判断 → 帰還後に鑑定」。
- 検証中の中核仮説は、戦闘の手応え、縦画面アイソメの視認性、帰還判断のジレンマ、未鑑定品の期待感、
  ラン内 3 択の多様性、レアドロップ演出。
- 現プロトタイプは製品コードではなく、仮説検証用。答えが出たら作り直す前提。

## 直近の作業ログ

### Codex: 2026-08-06 / 操作・戦闘・ドロップ・能力表示の調整

- 移動スティック非表示時も入力領域を維持し、案内矢印とボスHP表示を整理。
- 接触ダメージを移動後の位置で即時判定し、ドロップに0.7秒の回収禁止時間と1mの低速吸着を追加。
- 戦士スキルと魔術師MP回復を再調整し、デバッグ/管理者レベル設定にも通常レベルアップ相当のポイント獲得を追加。
- 能力値を16項目へ整理し、防御・攻撃系の旧重複オプションを統合。能力ポイントの効果説明と基準速度表示を修正。

確認コマンド:

```bash
npm run check
npm run check:pr12
```


### Codex: 2026-08-05 / PR #12 統合

- 最新の `claude/diablo-style-hackslash-game-khlbrr` 相当を取り込んだ現在の作業ブランチをベースとして扱う前提を README とハンドオフに明記。
- PR #12 のハンドオフ内容を `public/index.html` / `README.md` / `docs/` / `scripts/` / `package.json` へ集約し、分割 PR によるマージコンフリクトを避ける方針にした。
- `npm run check:pr12` を追加し、統合メタデータとコンフリクトマーカーの残存を自動確認できるようにした。

確認済み:

```bash
npm run check
npm run check:pr12
```

### Codex: 2026-08-05

- README に Codex で読む場所を追加し、ゲーム本体が `public/index.html` であることを明記。
- `docs/CODEX_HANDOFF.md` を追加し、読む順番と起動方法を整理。
- `npm run check` と `npm run serve` を追加。
- `scripts/check-prototype.mjs` を追加し、ゲーム本体と配信設定が読めるかを自動確認できるようにした。

確認済み:

```bash
npm run check
npm run serve
```

## 次に見る候補

- 実プレイURLまたは `npm run serve` のローカル版でプレイして、最初に違和感が出る操作・戦闘・UI を 1 つ選んで直す。
- `public/index.html` 冒頭の `CFG` を使い、敵の強さ、ドロップ率、攻撃テンポなどを小さく調整する。
- 大きな改修に入る前に、現在の 1 ファイル構成を維持するか、TypeScript/Vite 構成へ移行するかを決める。

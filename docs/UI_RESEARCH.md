# UI/UX ベンチマーク（2026-08-25）

## 目的

Descent の画面を、カードを縦に積むだけの試作UIから、縦持ちモバイルRPGとして短時間で判断・操作できる構成へ直すための比較記録。装飾そのものをコピーせず、情報の優先順位、画面遷移、タップ密度、文字の扱いだけを抽出する。

## 比較対象（33タイトル）

| 観点 | タイトル |
|---|---|
| ホーム / ロビー | ブルーアーカイブ、勝利の女神:NIKKE、アークナイツ、グランブルーファンタジー、Fate/Grand Order、アズールレーン、Reverse: 1999、Path to Nowhere、ガーディアンテイルズ、CookieRun: Kingdom、ヘブンバーンズレッド、ブラウンダスト2 |
| 任務 / 日課 | ウマ娘 プリティーダービー、プリンセスコネクト！Re:Dive、ブルーアーカイブ、アークナイツ |
| 装備 / 倉庫 | Diablo Immortal、Torchlight: Infinite、UNDECEMBER、Epic Seven、AFK Journey、Wuthering Waves、Monster Hunter Now、Summoners War、Sword of Convallaria、Last Cloudia |
| 能力 / 育成 | Pokémon Masters EX、Fire Emblem Heroes、Another Eden、OCTOPATH TRAVELER 大陸の覇者、FINAL FANTASY BRAVE EXVIUS、ドラゴンクエストタクト |
| 設定 / 情報設計 | Honkai: Star Rail、Zenless Zone Zero、Genshin Impact |

重複タイトルは、複数の画面観点で比較している。

## 抽出した共通パターン

### 1. ホームは「今日すること」と「出撃」を先にする

- キャラクターや背景を主役にしても、現在の目的・イベント・出撃入口は画面端か固定位置に残る。
- 編成や持ち物の詳細をホームへ全文表示せず、現在値と入口だけを見せる。
- 小さい正方形へ長い品名を押し込まない。品名が必要な場合は横長行にして、アイコン・名称・数量を分ける。

Descent では「次の行動 → 編成 → 持ち込み → 任務/記録」とし、出撃は固定バーへ分離する。持ち込みは4列の小枠から2列の横長行へ変更する。

### 2. 任務はカテゴリと行内操作の位置を固定する

- デイリー / 恒常 / 実績などのカテゴリは同じ高さのタブで切り替える。
- 任務名、進捗、報酬、受取操作の順序を全行で揃える。
- 押せる状態だけ強調し、未達成行へ強い無効ボタンを並べない。

Descent では3カテゴリ名と受取ボタンを縦横中央へ揃え、状態記号を絵文字から共通線画SVGへ変更する。

### 3. 装備と全ステータスは同じ判断画面に置く

- Diablo Immortal、Epic Seven、Wuthering Waves、Summoners War などは、装備スロットと装備結果の能力値を同じ作業面で比較できる。
- 「装備を替える → 別タブへ移る → 数値を確認する」という往復を要求しない。
- 全項目を1列の大カードへせず、2列の表、左右ペイン、要約＋詳細などで密度を上げる。

Descent では全16ステータスを装備タブへ戻し、2列8段の表にする。能力タブからは全ステータスを完全に削除する。

### 4. 能力割り振りは独立した短い操作面にする

- 育成画面では、残り資源、対象能力、増減、確定の順に視線が流れる。
- 同じ説明文を6回分の大きな行として常駐させず、ヘルプや詳細へ退避する。
- 少量は±、大量は数値指定や最大指定で処理できる。

Descent では残りポイントを最上部に固定し、6能力を2列×3段、確定/取消を1段、振り直しを1段に収める。数値タップの直接指定と長押し加速は残す。

### 5. 倉庫の操作記号は同じアイコン体系で統一する

- 絞込、並替、売却、分解のような機能アイコンは、同じ線幅・角処理・表示寸法で並ぶ。
- `▽`、`↕`、`G`、`◇`、`?` のような文字の寄せ集めは、フォント差とベースライン差で整列しない。
- アイコンだけにせず短い日本語ラベルを併記する。

Descent では24×24座標、stroke 2 の線画SVGへ統一し、日本語ラベルを残す。

### 6. 設定は目的別カテゴリ＋同じ行構造にする

- 表示、操作、音、データなどを先に選び、1カテゴリだけを見る。
- タブ、択一ボタン、ON/OFF行の高さと文字の重心を揃える。
- ON/OFFと現在選択を同じ強調色にしない。

Descent では「表示 / 操作 / データ / その他」を維持し、全カテゴリボタンを中央揃え、切替行を同じ44pxの構造へ揃える。

## 今回の受け入れ条件

- 持ち込み品名が `...` または `…` だけにならず、全品名を読める。
- ミッション3カテゴリ、任務行、受取ボタン、装備8枠目の「おすすめ」、設定4カテゴリが縦中央に揃う。
- 装備タブに全16ステータスがあり、能力タブには1件もない。
- 能力割り振りは2列×3段で、操作部分全体が300px以下に収まる。
- 倉庫の操作アイコンがすべて共通線画SVGである。
- 390×844で、拠点、装備一覧、能力割り振り、ガチャ、表示設定に不要な縦スクロールがない。

## 参照した画面例

- [Diablo Immortal inventory](https://www.148apps.com/diablo-immortal/first-impressions-of-diablo-immortal/)
- [Torchlight: Infinite inventory](https://www.4gamers.com.tw/news/detail/55476/torchlight-infinite-review)
- [UNDECEMBER Zodiac stats](https://guide.floor.line.games/UD/en_US/detail/1166916632826400044)
- [Wuthering Waves Echoes](https://clutchpoints.com/gaming/wuthering-waves-echoes-guide-everything-you-need-to-know)
- [Monster Hunter Now equipment](https://community.monsterhunternow.com/t/faster-way-of-equipping-weapons-and-armor/35064)
- [Uma Musume missions](https://note.com/baicagame/n/nc8ae501b9a55)
- [Princess Connect missions](https://gamewith.jp/pricone-re/article/show/112451)
- [Heaven Burns Red micro-interactions](https://appgameui.hatenablog.com/entry/2023/05/15/004027)
- [Pokémon Masters EX progression](https://www.pokemon.com/es/estrategia/pokemon-masters-ex-niveles-maximos-tableros-piedra-compi-niveles-mas-altos-evolucion-y-mucho-mas)

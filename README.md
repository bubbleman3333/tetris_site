# 絶対に倒れないテトリス

https://taorenai-tetris.pages.dev/

自己対戦で学習したテトリス AI が、**ブラウザの中で**延々と積み続ける。見ている人は「おじゃまブロック」を
送りつけて AI を倒しに行く。倒せた人は殿堂入りし、世界中の挑戦者の戦績を公開する。

- AI の本体は [game_ai_lab](https://github.com/bubbleman3333/game_ai_lab) で学習した価値ネットワーク（`v3-selfplay:best`）。
  重みを JSON に書き出し、**候補手の列挙から評価まで全部 TypeScript に移植して Web Worker で動かしている**。
  サーバーは使わない（Cloudflare Pages の静的配信だけ）。
- 戦績の保存・集計は [minna_api](https://github.com/bubbleman3333/minna_api)（Cloudflare Workers + D1）。

## いちばん大事なこと: Python 版と TS 版の一致

AI が強いのは「学習したとおりの手を選ぶ」からで、移植がどこか 1 か所ずれるだけで目に見えて弱くなる。
そこで **Python 版の出した答えをそのままテストデータにして、TS 版が同じ手を選ぶことを確かめている**
（`tests/parity.test.ts`）。42 局面 × 2,053 候補手について、次の 4 つをすべて突き合わせる。

| 突き合わせるもの | 結果 |
|---|---|
| 候補手の列挙（順番・置く場所・回転・spin・操作列・置いた後の盤面 40 行・火力・相殺・せり上がり） | 完全一致 |
| 特徴量 43 次元（float32） | 完全一致（差 0） |
| 評価値 `報酬 + γV`（ニューラルネットの出力） | 差 2e-3 未満（float32 の足し算の順番のぶん） |
| **選んだ手**（先読み 0 / 1 / 2 / 3 手） | 42 局面すべてで一致 |

テストデータの作り直し（game_ai_lab の venv を使う。**あちらのコードは読むだけで変更しない**）:

```powershell
cd tetris_site
..\game_ai_lab\backend\.venv\Scripts\python tools\export_weights.py v3-selfplay:best   # public/ai/*.json
..\game_ai_lab\backend\.venv\Scripts\python tools\export_cases.py   v3-selfplay:best   # tests/fixtures/parity.json
npm test
```

重みは **float32 のバイト列を base64** にして入れてある。JSON の数値だと丸めで差が出て、
「完全一致」のテストができなくなるため。

## 動かす

```powershell
npm install
npm run dev      # http://localhost:5173
npm test         # Python 版との一致テスト（30 秒ほどかかる）
npx tsc -b       # 型チェック
npm run build    # dist/
```

## 中身

| 場所 | 中身 |
|---|---|
| `src/engine/` | ルールエンジン。game_ai_lab の TS 版を**そのままコピー**（[README](src/engine/README.md)） |
| `src/ai/` | AI。候補手の列挙・特徴量・価値ネットワーク・ビームサーチ（[README](src/ai/README.md)） |
| `src/ai/worker.ts` | AI を動かす Web Worker。画面を止めないため |
| `src/ui/` | 描画（canvas）と戦績 API のクライアント |
| `src/balance.ts` | **おじゃまの強さはここ 1 か所**。下の実測表と対応する |
| `src/main.ts` | 画面の組み立てとゲームの進行 |
| `tools/` | 重みと一致テストデータの書き出し・AI の耐久の実測・OGP 画像（Python） |
| `tests/` | Python 版との一致テスト |

## AI の耐久（実測）

`tools/measure_ai.py` が、サイトと同じ条件（AI は 0.4 秒に 1 手、挑戦者は 4 段ずつまとめて送る）で
シミュレーションする。8 局の平均、900 手（6 分）で打ち切り。

```powershell
..\game_ai_lab\backend\.venv\Scripts\python tools\measure_ai.py v3-selfplay:best --lookahead 2
```

### 先読み 2 手（画面で使っている設定）

| 挑戦者の火力 | 撃破率 | 平均生存 | 倒せた局の平均 |
|---|---|---|---|
| おじゃま無し | 0% | 5 分打ち切りまで生存（297 ライン） | - |
| 毎秒 1.5 段 | 17% | 260 秒 | 62 秒 |
| 毎秒 2.0 段 | 100% | 125 秒 | 125 秒 |
| 毎秒 2.5 段 | 100% | 56 秒 | 56 秒 |
| 毎秒 3.0 段 | 100% | 30 秒 | 30 秒 |

### 先読み 1 手（比べるため）

| 挑戦者の火力 | 撃破率 | 平均生存 |
|---|---|---|
| おじゃま無し | 33% | 255 秒 |
| 毎秒 1.5 段 | 83% | 195 秒 |
| 毎秒 2.0 段 | 100% | 57 秒 |

先読みを 1 手増やすだけで別物になる（おじゃま無しの自滅が 33% → 0%）。ブラウザでの 1 手は
**先読み 2 手で 200〜260ms**（PC）なので、0.4 秒に 1 手のペースに収まる範囲でいちばん深くしてある。

### おじゃまのバランス（`src/balance.ts`）

エネルギーは毎秒 23 回復し、上限 100。ボタンは 1 段 = 14 / 2 段 = 25 / 4 段 = 44。
まとめて送るほど 1 段あたりが安いので、**溜めて 4 段で撃つのが上手い打ち方**になる。

| 撃ち方 | 出せる火力 | 上の表でいうと |
|---|---|---|
| 1 段を連打 | 毎秒 1.64 段 | ほとんど倒せない |
| 2 段を連打 | 毎秒 1.84 段 | 粘れば倒せる |
| **4 段を溜めて撃つ** | 毎秒 2.09 段 | 2 分ほどで倒せる |

狙いは「上手い人が 2〜3 分かけて倒せる」。実測でもおおむねその線に乗っている。
なお回復量は**厳密には「AI の 1 手あたり」**で配っている（`avgPieceMs`）。遅い端末だと AI の 1 手が
0.4 秒より長くかかるので、秒で配ると端末の速さで難しさが変わってしまうため。

生存時間も壁掛け時計ではなく「画面が動いていた時間」で数える。タブを裏に回すと AI も止まるので、
放置しただけで最長生存記録になってしまうのを防ぐ。

## 配備

初回だけ:

```powershell
npx wrangler pages project create taorenai-tetris --production-branch main --force
```

以後:

```powershell
npm run build
npx wrangler pages deploy dist --project-name taorenai-tetris --branch main
```

### GitHub Actions から自動配備したいとき

`.github/workflows/deploy.yml` を置いてある。動かすには GitHub の
**Settings → Secrets and variables → Actions** に次の 2 つを入れる（API トークンは人が作るしかない）。

| Secret | 値 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare のダッシュボード → My Profile → API Tokens → Create Token。権限は「アカウント > Cloudflare Pages > 編集」だけでよい |
| `CLOUDFLARE_ACCOUNT_ID` | `269737194926079a2f7f7b523c51094b` |

入れるまでは、push のたびに**テストとビルドだけ**が走る（配備の手順は飛ばされる）。

## 戦績 API

[minna_api](https://github.com/bubbleman3333/minna_api) に足した 3 つを使う。

| メソッド・パス | 用途 |
|---|---|
| `POST /v1/tetris/result` | 1 回の挑戦を記録。`{killed, seconds, garbage, lines, name?}`。同じ IP から 1 分 5 件まで。名前は倒したときだけ保存 |
| `GET /v1/tetris/stats` | 挑戦回数・撃破回数・撃破率・最速撃破・AI の最長生存（60 秒キャッシュ） |
| `GET /v1/tetris/hall` | 殿堂（最速撃破の上位 100 件） |

荒らし対策は投稿 API と同じ仕組み（NG ワード・ハニーポット・回数制限・`hidden` で手動非表示）。

## 直すときの注意

- **`src/engine/` は直さない。** ルールを変えたくなったら game_ai_lab 側を直してコピーし直す
  （Python 版・TS 版・このサイトの 3 つがずれると AI が弱くなる）。
- `src/ai/` を触ったら必ず `npm test` を通す。一致テストが落ちたまま配備しないこと。
- 重みを差し替えたら `tools/export_weights.py` と `tools/export_cases.py` を**両方**動かし直す
  （テストデータは重みとセット）。`src/main.ts` の `WEIGHTS_URL` も変える。
- おじゃまの強さを変えたら `tools/measure_ai.py` で測り直し、この README の表も直す。
- コメント・README は日本語。

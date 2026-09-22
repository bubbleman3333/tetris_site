# src/ai/ ブラウザで動くテトリス AI

game_ai_lab の `backend/rl/tetris/` を TypeScript に移植したもの。**手の選び方まで 1 対 1 に対応する**。

| ファイル | 元の Python | 中身 |
|---|---|---|
| `shapes.ts` | `games/tetris/pieces.py` の `Shape` | ミノの形を行ビットマスクに前計算 |
| `board.ts` | `games/tetris/board.py` | 探索用の盤面（色を持たないぶん軽い） |
| `lock.ts` | `games/tetris/lock.py` + `rules.detect_spin` | 固定したときの処理と T-Spin 判定 |
| `movegen.ts` | `games/tetris/movegen.py` | 置ける場所の幅優先探索 `findPlacements` |
| `features.ts` | `games/tetris/features.py` | 盤面の特徴量（穴・高さ・凸凹・T-Spin の穴…） |
| `position.ts` | `rl/tetris/position.py` | 局面と候補手の列挙 `enumerateCandidates` |
| `encoding.ts` | `rl/tetris/encoding.py` | 候補手 → 43 次元（バージョン 2 なら 52 次元）の入力ベクトル |
| `net.ts` | `rl/tetris/model.py` | 学習済み MLP の推論（重みは base64 の float32） |
| `agent.ts` | `rl/tetris/agent.py` | `報酬 + γV` が最大の手を選ぶ。先読みはビームサーチ |
| `worker.ts` | （新規） | 上を Web Worker で動かす |

## 手の選び方

1. 今のミノと HOLD したミノで、置ける場所を全部出す（`findPlacements`）
2. 置いた後の盤面を 43 個の数にする（`encodeMany`）
3. 価値ネットワーク V に通し、`報酬 + γ × V(置いた後)` が最大の手を選ぶ
4. 先読みありなら、NEXT を使って 2 手先まで読む（各段で上位 8 個だけ残すビームサーチ）

報酬は学習時と同じ `生き残り +0.1 / 1 列 +0.2 / 火力 1 段 +1.0 / 死 -5`（重みの JSON に入っている）。

## 盤面が 2 つある理由

画面に出す盤面（`src/engine/board.ts`）はマスの色を持っている。AI は 1 手の探索で盤面を何百回もコピーするので、
色まで一緒に複製すると重い。そこで**色を持たない `AiBoard`** を別に用意した。中身は Python 版の `Board` と
同じで、一致していることは `tests/parity.test.ts` が毎回確かめている。

## 特徴量のバージョン

game_ai_lab の `FEATURE_VERSION` と同じ番号。1 = 43 次元（自分の盤面だけ）、2 = 52 次元（相手の様子 9 個を追加）。
このサイトに相手の盤面は無い（挑戦者はおじゃまを送るだけ）ので、バージョン 2 の重みを使っても
相手の 9 個は常に 0 になる。Python 側で `opponent=None` にしたときと同じ扱い。

**重みを差し替えたら、一致テストのデータも作り直すこと**（README のコマンド）。

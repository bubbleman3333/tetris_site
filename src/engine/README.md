# src/engine/ ルールエンジン（game_ai_lab からのコピー）

`game_ai_lab/frontend/src/games/tetris/engine/` から **そのままコピーした**もの。
仕様は `game_ai_lab/docs/TETRIS_RULES.md`。

| ファイル | 中身 |
|---|---|
| `pieces.ts` | ミノの形・SRS の壁蹴り表・T の四隅 |
| `rng.ts` | mulberry32 と 7-bag（Python 版と同じ順番） |
| `board.ts` | 盤面（1 行 = 10bit）。表示用の色も持つ |
| `rules.ts` | T-Spin 判定・火力・相殺・せり上がり・`resolveLock` |
| `game.ts` | 1 人分の状態と操作 |

**ここは直さない**。ルールを変えたくなったら game_ai_lab 側を直してコピーし直すこと
（Python 版・TS 版・このサイトの 3 つがずれると AI が弱くなる）。

AI の探索は速さのために色を持たない別の盤面（`src/ai/board.ts`）を使う。
そちらが Python 版と一致していることは `tests/parity.test.ts` で確かめている。

// おじゃまのバランス。**数字はここ 1 か所だけ**に置く（README の実測表と対応）。
//
// 調整のしかた:
//   ..\game_ai_lab\backend\.venv\Scripts\python tools\measure_ai.py v3-selfplay:best --lookahead 2
// で「毎秒 N 段送り続けたときに AI が何秒もつか」を測り、上手い人が 2〜3 分で倒せる線を狙う。
// 挑戦者が出せる最大の毎秒段数は ENERGY_REGEN / (4 段ボタンの 1 段あたりのコスト)。

/** AI が 1 手にかける時間（ミリ秒）。速すぎると何をしているか見えない */
export const MOVE_MS = 400

/** AI の先読み（NEXT を何個使うか）。ブラウザで 1 手 200ms ほど。0 にすると目に見えて弱くなる */
export const LOOKAHEAD = 2
export const BEAM = 8

export const ENERGY_MAX = 100
/**
 * 1 秒あたりの回復量。ただし遅い端末では AI の 1 手が 400ms より長くかかるので、
 * 実際には「AI の 1 手あたり ENERGY_REGEN × MOVE_MS / 1000」を配る
 * （端末の速さで難しさが変わらないようにするため。main.ts の avgPieceMs）。
 */
export const ENERGY_REGEN = 23

export interface AttackButton {
  lines: number
  cost: number
  label: string
}

/** まとめて送るほど 1 段あたりが安い（溜めて撃つのが上手い打ち方） */
export const ATTACKS: AttackButton[] = [
  { lines: 1, cost: 14, label: 'おじゃま 1 段' },
  { lines: 2, cost: 25, label: 'おじゃま 2 段' },
  { lines: 4, cost: 44, label: 'おじゃま 4 段' },
]

/** 上手い人が出せる理論上の毎秒段数（README の表と突き合わせる） */
export const MAX_LINES_PER_SEC = (ENERGY_REGEN * 4) / ATTACKS[2].cost

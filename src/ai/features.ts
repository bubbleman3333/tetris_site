// 盤面の特徴量（穴・高さ・凸凹など）。backend/games/tetris/features.py と同じ。

import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/pieces'
import { AiBoard, FULL_ROW } from './board'
import { detectSpin } from './lock'
import { SHAPES } from './shapes'

export interface BoardFeatures {
  heights: number[] // 各列の高さ（10 個）
  holes: number // 上が埋まっている空きマスの数
  holeRows: number // 穴がある行の数
  holeDepth: number // 穴の上に積まれているブロック数の合計
  bumpiness: number // 隣り合う列の高さの差の合計
  maxHeight: number
  aggHeight: number
  rowTransitions: number // 横方向に 空き/埋まり が切り替わる回数
  colTransitions: number // 縦方向の切り替わり回数
  wells: number // 両隣より低い列の深さの合計（1+2+...+d）
  tSlots: number // T-Spin Double ができる穴の数
}

export function boardFeatures(board: AiBoard): BoardFeatures {
  const rows = board.rows
  const top = VISIBLE_HEIGHT + 4
  const heights = new Array<number>(BOARD_WIDTH).fill(0)
  for (let y = top - 1; y >= 0; y--) {
    const r = rows[y]
    if (!r) continue
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (heights[x] === 0 && (r >> x) & 1) heights[x] = y + 1
    }
  }

  let holes = 0
  let holeRows = 0
  let holeDepth = 0
  const maxH = Math.max(...heights)
  for (let y = 0; y < maxH; y++) {
    const r = rows[y]
    let rowHasHole = false
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (!((r >> x) & 1) && heights[x] > y) {
        holes++
        rowHasHole = true
        for (let yy = y + 1; yy < heights[x]; yy++) holeDepth += (rows[yy] >> x) & 1
      }
    }
    if (rowHasHole) holeRows++
  }

  let bump = 0
  for (let i = 0; i < BOARD_WIDTH - 1; i++) bump += Math.abs(heights[i] - heights[i + 1])

  let rowTr = 0
  for (let y = 0; y < maxH; y++) {
    // 左右の壁は埋まっている扱い
    const r = rows[y] | (1 << BOARD_WIDTH)
    let prev = 1
    for (let x = 0; x <= BOARD_WIDTH; x++) {
      const cur = (r >> x) & 1
      if (cur !== prev) rowTr++
      prev = cur
    }
  }

  let colTr = 0
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let prev = 1 // 床
    for (let y = 0; y <= heights[x]; y++) {
      const cur = (rows[y] >> x) & 1
      if (cur !== prev) colTr++
      prev = cur
    }
  }

  let wells = 0
  for (let x = 0; x < BOARD_WIDTH; x++) {
    const left = x > 0 ? heights[x - 1] : 99
    const right = x < BOARD_WIDTH - 1 ? heights[x + 1] : 99
    const d = Math.min(left, right) - heights[x]
    if (d > 0) wells += (d * (d + 1)) / 2
  }

  let aggHeight = 0
  for (const h of heights) aggHeight += h

  return {
    heights, holes, holeRows, holeDepth, bumpiness: bump, maxHeight: maxH, aggHeight,
    rowTransitions: rowTr, colTransitions: colTr, wells, tSlots: countTsdSlots(board, heights),
  }
}

/** 下向きの T を入れると T-Spin で 2 列以上消える場所の数（到達できるかは見ない簡易版） */
export function countTsdSlots(board: AiBoard, heights: number[]): number {
  const shape = SHAPES.T[2]
  let count = 0
  for (let x = 1; x < BOARD_WIDTH - 1; x++) {
    // T の中心が入る高さの候補: 中央列の上から、左右の列の高いほうまで
    const from = Math.max(1, heights[x] + 1)
    const to = Math.max(heights[x - 1], heights[x + 1])
    for (let y = from; y <= to; y++) {
      if (board.collides('T', 2, x, y) || !board.collides('T', 2, x, y - 1)) continue
      if (detectSpin(board, 'T', 2, x, y, 0) !== 'full') continue
      let filled = 0
      for (const [dy, mask] of shape.rowMasks) {
        if ((board.rows[y + dy] | (mask << (x + shape.minDx))) === FULL_ROW) filled++
      }
      if (filled >= 2) count++
    }
  }
  return count
}

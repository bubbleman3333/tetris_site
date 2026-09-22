// ミノの形を「行ごとのビットマスク」に前計算したもの。
// backend/games/tetris/pieces.py の Shape クラスと同じ内容。

import { CELLS, PIECE_TYPES, type Cell, type PieceType } from '../engine/pieces'

export interface Shape {
  cells: readonly Cell[]
  minDx: number
  maxDx: number
  minDy: number
  maxDy: number
  /** [dy, minDx を基準にしたマスク] を dy の小さい順に */
  rowMasks: readonly (readonly [number, number])[]
  /** 左下を原点にした形。回転が違っても同じ形なら同じ文字列（S/Z/I/O の重複判定に使う） */
  form: string
}

function makeShape(cells: readonly Cell[]): Shape {
  const xs = cells.map((c) => c[0])
  const ys = cells.map((c) => c[1])
  const minDx = Math.min(...xs)
  const maxDx = Math.max(...xs)
  const minDy = Math.min(...ys)
  const maxDy = Math.max(...ys)

  const masks = new Map<number, number>()
  for (const [dx, dy] of cells) masks.set(dy, (masks.get(dy) ?? 0) | (1 << (dx - minDx)))
  const rowMasks = [...masks.entries()].sort((a, b) => a[0] - b[0]).map(([dy, m]) => [dy, m] as const)

  // Python 側は (dx, dy) のタプルを sorted() で並べる。同じ順になるよう dx → dy で並べる
  const form = cells
    .map(([dx, dy]) => [dx - minDx, dy - minDy] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([dx, dy]) => `${dx},${dy}`)
    .join('|')

  return { cells, minDx, maxDx, minDy, maxDy, rowMasks, form }
}

export const SHAPES: Record<PieceType, Shape[]> = Object.fromEntries(
  PIECE_TYPES.map((p) => [p, CELLS[p].map(makeShape)]),
) as Record<PieceType, Shape[]>

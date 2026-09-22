// AI の探索用の盤面。色を持たないぶん軽い（1 手の探索で何百回もコピーするため）。
// backend/games/tetris/board.py と 1 対 1 に対応する。

import { BOARD_HEIGHT, BOARD_WIDTH, type PieceType, type Rotation } from '../engine/pieces'
import { SHAPES } from './shapes'

export const FULL_ROW = (1 << BOARD_WIDTH) - 1

export class AiBoard {
  rows: number[]

  constructor(rows?: readonly number[]) {
    this.rows = rows ? rows.slice() : new Array<number>(BOARD_HEIGHT).fill(0)
  }

  copy(): AiBoard {
    return new AiBoard(this.rows)
  }

  /** 盤外（左右の壁・床）は埋まっている扱い。盤面の上（y>=40）は空き */
  isFilled(x: number, y: number): boolean {
    if (x < 0 || x >= BOARD_WIDTH || y < 0) return true
    if (y >= BOARD_HEIGHT) return false
    return ((this.rows[y] >> x) & 1) === 1
  }

  collides(piece: PieceType, rot: Rotation, x: number, y: number): boolean {
    const s = SHAPES[piece][rot]
    const left = x + s.minDx
    if (left < 0 || x + s.maxDx >= BOARD_WIDTH || y + s.minDy < 0) return true
    for (const [dy, mask] of s.rowMasks) {
      const yy = y + dy
      if (yy < BOARD_HEIGHT && this.rows[yy] & (mask << left)) return true
    }
    return false
  }

  isEmpty(): boolean {
    for (const r of this.rows) if (r !== 0) return false
    return true
  }

  place(piece: PieceType, rot: Rotation, x: number, y: number): void {
    const s = SHAPES[piece][rot]
    const left = x + s.minDx
    for (const [dy, mask] of s.rowMasks) this.rows[y + dy] |= mask << left
  }

  clearLines(): number {
    const kept = this.rows.filter((r) => r !== FULL_ROW)
    const cleared = BOARD_HEIGHT - kept.length
    if (cleared) {
      this.rows = kept
      for (let i = 0; i < cleared; i++) this.rows.push(0)
    }
    return cleared
  }

  /** 下から lines 段せり上げる。上から押し出されたら false（top out） */
  addGarbage(lines: number, hole: number): boolean {
    let overflow = false
    for (let y = BOARD_HEIGHT - lines; y < BOARD_HEIGHT; y++) {
      if (this.rows[y] !== 0) {
        overflow = true
        break
      }
    }
    const row = FULL_ROW & ~(1 << hole)
    const kept = this.rows.slice(0, BOARD_HEIGHT - lines)
    this.rows = new Array<number>(lines).fill(row).concat(kept)
    return !overflow
  }
}

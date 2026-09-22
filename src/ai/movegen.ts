// 置ける場所を全部探す（幅優先探索）。backend/games/tetris/movegen.py と同じ順番・同じ結果を返す。
//
// 出現位置から L / R / CW / CCW / SDB で探索し、床に接した状態を「置き場所」として集める。
// 回転で入り込む T-Spin の位置も見つかる。path をそのまま Game.apply() に流して最後に HD すれば同じ場所に置ける。

import { kicks, SPAWN_X, SPAWN_Y, type PieceType, type Rotation } from '../engine/pieces'
import type { Spin } from '../engine/rules'
import { AiBoard } from './board'
import { detectSpin } from './lock'
import { SHAPES } from './shapes'

export type Action = 'L' | 'R' | 'CW' | 'CCW' | 'SD' | 'SDB' | 'HD' | 'HOLD'

export interface Placement {
  piece: PieceType
  rot: Rotation
  x: number
  y: number
  spin: Spin
  /** HD の直前までの操作列 */
  path: Action[]
}

/** 訪問済みの印。x は -2 まで負になりうるので下駄をはかせる */
const stateKey = (x: number, y: number, rot: number): number => (y * 4 + rot) * 16 + (x + 2)

function dropY(board: AiBoard, piece: PieceType, rot: Rotation, x: number, y: number): number {
  while (!board.collides(piece, rot, x, y - 1)) y--
  return y
}

export function findPlacements(board: AiBoard, piece: PieceType): Placement[] {
  if (board.collides(piece, 0, SPAWN_X, SPAWN_Y)) return []

  const shapes = SHAPES[piece]
  const results = new Map<string, Placement>()

  const record = (x: number, y: number, rot: Rotation, path: Action[], kick: number | null): void => {
    if (!board.collides(piece, rot, x, y - 1)) return // まだ宙に浮いている
    const spin = detectSpin(board, piece, rot, x, y, kick)
    const s = shapes[rot]
    // 同じマスを占める置き方（回転違いの S/Z/I/O など）は 1 つにまとめる
    const key = `${s.form}#${x + s.minDx},${y + s.minDy},${spin}`
    if (!results.has(key)) results.set(key, { piece, rot, x, y, spin, path })
  }

  const visited = new Map<number, Action[]>()
  const queue: [number, number, Rotation][] = [[SPAWN_X, SPAWN_Y, 0]]
  visited.set(stateKey(SPAWN_X, SPAWN_Y, 0), [])
  record(SPAWN_X, SPAWN_Y, 0, [], null)

  for (let head = 0; head < queue.length; head++) {
    const [x, y, rot] = queue[head]
    const path = visited.get(stateKey(x, y, rot))!
    const successors: [Action, number, number, Rotation, number | null][] = []

    for (const [act, dx] of [['L', -1], ['R', 1]] as const) {
      if (!board.collides(piece, rot, x + dx, y)) successors.push([act, x + dx, y, rot, null])
    }
    for (const [act, d] of [['CW', 1], ['CCW', -1]] as const) {
      const toRot = (((rot + d) % 4) + 4) % 4 as Rotation
      const tests = kicks(piece, rot, toRot)
      for (let i = 0; i < tests.length; i++) {
        const [kx, ky] = tests[i]
        if (!board.collides(piece, toRot, x + kx, y + ky)) {
          successors.push([act, x + kx, y + ky, toRot, i])
          break
        }
      }
    }
    const dy = dropY(board, piece, rot, x, y)
    if (dy !== y) successors.push(['SDB', x, dy, rot, null])

    for (const [act, nx, ny, nrot, kick] of successors) {
      const newPath = path.concat(act)
      record(nx, ny, nrot, newPath, kick)
      const key = stateKey(nx, ny, nrot)
      if (!visited.has(key)) {
        visited.set(key, newPath)
        queue.push([nx, ny, nrot])
      }
    }
  }

  return [...results.values()]
}

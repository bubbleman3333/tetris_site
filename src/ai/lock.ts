// AI の探索用の「固定したときの処理」。backend/games/tetris/lock.py と rules.py の detect_spin と同じ。
// 火力の計算（computeAttack）と相殺（cancelGarbage）は盤面に触らないので engine/rules.ts をそのまま使う。

import { T_ALL_CORNERS, T_FRONT_CORNERS, type PieceType, type Rotation } from '../engine/pieces'
import {
  cancelGarbage,
  computeAttack,
  GARBAGE_CAP_PER_LOCK,
  type PendingGarbage,
  type Spin,
} from '../engine/rules'
import { AiBoard } from './board'

export function detectSpin(
  board: AiBoard, piece: PieceType, rot: Rotation, x: number, y: number, lastKick: number | null,
): Spin {
  if (piece !== 'T' || lastKick === null) return 'none'
  let filled = 0
  for (const [dx, dy] of T_ALL_CORNERS) if (board.isFilled(x + dx, y + dy)) filled++
  if (filled < 3) return 'none'
  let front = 0
  for (const [dx, dy] of T_FRONT_CORNERS[rot]) if (board.isFilled(x + dx, y + dy)) front++
  return front === 2 || lastKick === 4 ? 'full' : 'mini'
}

export interface AiLockOutcome {
  board: AiBoard
  lines: number
  attack: number
  sent: number
  combo: number
  b2b: boolean
  b2bBonus: boolean
  perfectClear: boolean
  pending: PendingGarbage[]
  garbageReceived: number
  /** せり上がりで押し出された（top out）。出現できるかは呼び出し側で確認する */
  dead: boolean
}

/** 予告を最大 8 段まで盤面に入れる（board を直接変更する） */
function applyPendingGarbage(
  board: AiBoard, pending: readonly PendingGarbage[],
): [PendingGarbage[], number, boolean] {
  const remaining = pending.map((p) => [p[0], p[1]] as PendingGarbage)
  let received = 0
  while (remaining.length && received < GARBAGE_CAP_PER_LOCK) {
    const [amount, hole] = remaining[0]
    const n = Math.min(amount, GARBAGE_CAP_PER_LOCK - received)
    received += n
    if (n === amount) remaining.shift()
    else remaining[0][0] -= n
    if (!board.addGarbage(n, hole)) return [remaining, received, true]
  }
  return [remaining, received, false]
}

export function resolveLock(
  board: AiBoard, piece: PieceType, rot: Rotation, x: number, y: number, spin: Spin,
  combo: number, b2b: boolean, pending: readonly PendingGarbage[],
): AiLockOutcome {
  const b = board.copy()
  b.place(piece, rot, x, y)
  const lines = b.clearLines()
  const perfect = lines > 0 && b.isEmpty()
  const atk = computeAttack(lines, spin, combo, b2b, perfect)
  let [remaining, sent] = cancelGarbage(pending, atk.attack)
  let received = 0
  let topOut = false
  if (lines === 0) [remaining, received, topOut] = applyPendingGarbage(b, remaining)
  return {
    board: b, lines, attack: atk.attack, sent, combo: atk.combo, b2b: atk.b2b,
    b2bBonus: atk.b2bBonus, perfectClear: perfect, pending: remaining,
    garbageReceived: received, dead: topOut,
  }
}

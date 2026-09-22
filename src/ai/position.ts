// AI が判断に使う「局面」と、そこから打てる手（候補）の列挙。
// backend/rl/tetris/position.py と同じ（同じ順番で候補手を返す）。

import { SPAWN_X, SPAWN_Y, type PieceType } from '../engine/pieces'
import type { PendingGarbage } from '../engine/rules'
import { AiBoard } from './board'
import { boardFeatures } from './features'
import { resolveLock, type AiLockOutcome } from './lock'
import { findPlacements, type Action, type Placement } from './movegen'

/** 相手の様子。盤面そのものではなく「どれだけ追い詰められているか」を持つ（特徴量バージョン 2 用） */
export interface OpponentView {
  maxHeight: number
  aggHeight: number
  holes: number
  bumpiness: number
  pending: number
  combo: number
  b2b: boolean
}

export function opponentFromBoard(
  board: AiBoard, pending: number, combo: number, b2b: boolean,
): OpponentView {
  const f = boardFeatures(board)
  return {
    maxHeight: f.maxHeight, aggHeight: f.aggHeight, holes: f.holes, bumpiness: f.bumpiness,
    pending, combo, b2b,
  }
}

export interface Position {
  board: AiBoard
  current: PieceType
  hold: PieceType | null
  canHold: boolean
  next: PieceType[]
  combo: number
  b2b: boolean
  pending: PendingGarbage[]
  /** null ならひとり遊び（このサイトは常に null。挑戦者は盤面を持たない） */
  opponent: OpponentView | null
}

export interface Candidate {
  placement: Placement
  useHold: boolean
  outcome: AiLockOutcome
  holdAfter: PieceType | null
  nextAfter: PieceType | null
  dead: boolean
  /** nextAfter より後のツモ（先読み用） */
  queueAfter: PieceType[]
  opponent: OpponentView | null
}

/** この手を打った後の相手（送った段数を保留に足したもの） */
export function opponentAfter(c: Candidate): OpponentView | null {
  if (!c.opponent) return null
  if (c.outcome.sent <= 0) return c.opponent
  return { ...c.opponent, pending: c.opponent.pending + c.outcome.sent }
}

export function candidatePath(c: Candidate): Action[] {
  return (c.useHold ? (['HOLD'] as Action[]) : []).concat(c.placement.path, ['HD'])
}

export function enumerateCandidates(pos: Position): Candidate[] {
  const options: [boolean, PieceType, PieceType | null, PieceType[]][] = [
    [false, pos.current, pos.hold, pos.next],
  ]
  if (pos.canHold) {
    if (pos.hold === null) {
      if (pos.next.length) options.push([true, pos.next[0], pos.current, pos.next.slice(1)])
    } else if (pos.hold !== pos.current) {
      options.push([true, pos.hold, pos.current, pos.next])
    }
  }

  const result: Candidate[] = []
  for (const [useHold, piece, holdAfter, queue] of options) {
    const nextAfter = queue.length ? queue[0] : null
    const rest = queue.slice(1)
    for (const pl of findPlacements(pos.board, piece)) {
      const out = resolveLock(
        pos.board, pl.piece, pl.rot, pl.x, pl.y, pl.spin, pos.combo, pos.b2b, pos.pending,
      )
      const dead = out.dead || (nextAfter !== null && out.board.collides(nextAfter, 0, SPAWN_X, SPAWN_Y))
      result.push({
        placement: pl, useHold, outcome: out, holdAfter, nextAfter, dead,
        queueAfter: rest, opponent: pos.opponent,
      })
    }
  }
  return result
}

/** 手 c を打った後の局面（次のミノが出た状態）。死ぬ手・NEXT が分からないときは null */
export function positionAfter(c: Candidate): Position | null {
  if (c.dead || c.nextAfter === null) return null
  const o = c.outcome
  return {
    board: o.board, current: c.nextAfter, hold: c.holdAfter, canHold: true, next: c.queueAfter,
    combo: o.combo, b2b: o.b2b, pending: o.pending.map((p) => [p[0], p[1]] as PendingGarbage),
    opponent: opponentAfter(c),
  }
}

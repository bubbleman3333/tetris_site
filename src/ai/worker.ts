// AI を動かす Web Worker。画面を止めないように、手を考えるのはこちらで行う。
//
// やりとり:
//   → { type: 'init', url, lookahead, beam }      重みを読み込む
//   ← { type: 'ready', agent, episode, featureVersion, featureDim }
//   → { type: 'think', id, position }             この局面の手を考えて
//   ← { type: 'move', id, path, ms, lines, attack, spin }   path が null なら打てる手が無い（詰み）
//   ← { type: 'error', message }

import { AiBoard } from './board'
import { NeuralAgent } from './agent'
import { ValueNet, type WeightsJson } from './net'
import { candidatePath, type Position } from './position'
import type { PieceType } from '../engine/pieces'
import type { PendingGarbage } from '../engine/rules'

export interface ThinkPosition {
  rows: number[]
  current: PieceType
  hold: PieceType | null
  canHold: boolean
  next: PieceType[]
  combo: number
  b2b: boolean
  pending: PendingGarbage[]
}

let agent: NeuralAgent | null = null

function toPosition(p: ThinkPosition): Position {
  return {
    board: new AiBoard(p.rows),
    current: p.current,
    hold: p.hold,
    canHold: p.canHold,
    next: p.next,
    combo: p.combo,
    b2b: p.b2b,
    pending: p.pending.map((g) => [g[0], g[1]] as PendingGarbage),
    // このサイトに相手の盤面は無い（挑戦者はおじゃまを送るだけ）
    opponent: null,
  }
}

self.onmessage = async (ev: MessageEvent): Promise<void> => {
  const msg = ev.data
  try {
    if (msg.type === 'init') {
      const res = await fetch(msg.url)
      if (!res.ok) throw new Error(`重みが読めません（${res.status}）`)
      const data: WeightsJson = await res.json()
      const net = new ValueNet(data)
      agent = new NeuralAgent(net, msg.lookahead ?? 2, msg.beam ?? 8)
      self.postMessage({
        type: 'ready', agent: net.agent, episode: net.episode,
        featureVersion: net.featureVersion, featureDim: net.featureDim,
      })
      return
    }

    if (msg.type === 'think') {
      if (!agent) throw new Error('AI がまだ読み込まれていません')
      const t0 = performance.now()
      const pos = toPosition(msg.position as ThinkPosition)
      const chosen = agent.choose(pos)
      self.postMessage({
        type: 'move',
        id: msg.id,
        path: chosen ? candidatePath(chosen.candidate) : null,
        ms: Math.round(performance.now() - t0),
        lines: chosen?.candidate.outcome.lines ?? 0,
        attack: chosen?.candidate.outcome.attack ?? 0,
        spin: chosen?.candidate.placement.spin ?? 'none',
      })
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

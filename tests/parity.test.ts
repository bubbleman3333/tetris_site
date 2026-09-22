// TypeScript 版の AI が Python 版（game_ai_lab）と同じ手を選ぶことを確かめる。
//
// **このテストがこのサイトで一番大事**。候補手の列挙・特徴量・ニューラルネット・先読みのどれかが
// ずれると、AI は「学習していない手」を打つようになって目に見えて弱くなる。
//
// テストデータの作り直し:
//   ..\game_ai_lab\backend\.venv\Scripts\python tools\export_cases.py v3-selfplay:best
//   ..\game_ai_lab\backend\.venv\Scripts\python tools\export_weights.py v3-selfplay:best

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import type { PieceType } from '../src/engine/pieces'
import type { PendingGarbage } from '../src/engine/rules'
import { AiBoard } from '../src/ai/board'
import { NeuralAgent } from '../src/ai/agent'
import { encodeMany } from '../src/ai/encoding'
import { ValueNet, type WeightsJson } from '../src/ai/net'
import { candidatePath, enumerateCandidates, type Position } from '../src/ai/position'

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

interface CaseCandidate {
  piece: PieceType
  rot: number
  x: number
  y: number
  spin: string
  useHold: boolean
  path: string[]
  holdAfter: PieceType | null
  nextAfter: PieceType | null
  dead: boolean
  lines: number
  attack: number
  sent: number
  combo: number
  b2b: boolean
  perfectClear: boolean
  garbageReceived: number
  topOut: boolean
  pendingAfter: number[][]
  rowsAfter: number[]
}

interface ParityCase {
  id: number
  position: {
    rows: number[]
    current: PieceType
    hold: PieceType | null
    canHold: boolean
    next: PieceType[]
    combo: number
    b2b: boolean
    pending: number[][]
  }
  candidates: CaseCandidate[]
  features: number[][]
  scores: number[]
  choice: Record<string, number>
}

interface ParityData {
  agent: string
  featureVersion: number
  featureNames: string[]
  lookaheads: number[]
  beam: number
  gamma: number
  cases: ParityCase[]
}

const data: ParityData = JSON.parse(read('./fixtures/parity.json'))
const weights: WeightsJson = JSON.parse(read('../public/ai/v3-selfplay-best.json'))
const net = new ValueNet(weights)

function toPosition(p: ParityCase['position']): Position {
  return {
    board: new AiBoard(p.rows),
    current: p.current,
    hold: p.hold,
    canHold: p.canHold,
    next: p.next,
    combo: p.combo,
    b2b: p.b2b,
    pending: p.pending.map((g) => [g[0], g[1]] as PendingGarbage),
    opponent: null,
  }
}

describe('重みファイル', () => {
  it('テストデータと同じ AI・同じ特徴量バージョン', () => {
    expect(weights.agent).toBe(data.agent)
    expect(net.featureVersion).toBe(data.featureVersion)
    expect(net.featureDim).toBe(data.featureNames.length)
    expect(net.gamma).toBeCloseTo(data.gamma, 10)
  })
})

describe(`Python 版との一致（${data.cases.length} 局面）`, () => {
  it('候補手が同じ順番・同じ内容で出る', () => {
    for (const c of data.cases) {
      const got = enumerateCandidates(toPosition(c.position))
      expect(got.length, `case ${c.id} の候補手の数`).toBe(c.candidates.length)
      for (let i = 0; i < got.length; i++) {
        const g = got[i]
        const e = c.candidates[i]
        const where = `case ${c.id} / 候補 ${i}`
        expect({
          piece: g.placement.piece, rot: g.placement.rot, x: g.placement.x, y: g.placement.y,
          spin: g.placement.spin, useHold: g.useHold, path: candidatePath(g),
          holdAfter: g.holdAfter, nextAfter: g.nextAfter, dead: g.dead,
        }, where).toEqual({
          piece: e.piece, rot: e.rot, x: e.x, y: e.y, spin: e.spin, useHold: e.useHold,
          path: e.path, holdAfter: e.holdAfter, nextAfter: e.nextAfter, dead: e.dead,
        })
        expect({
          lines: g.outcome.lines, attack: g.outcome.attack, sent: g.outcome.sent,
          combo: g.outcome.combo, b2b: g.outcome.b2b, perfectClear: g.outcome.perfectClear,
          garbageReceived: g.outcome.garbageReceived, topOut: g.outcome.dead,
        }, where).toEqual({
          lines: e.lines, attack: e.attack, sent: e.sent, combo: e.combo, b2b: e.b2b,
          perfectClear: e.perfectClear, garbageReceived: e.garbageReceived, topOut: e.topOut,
        })
        expect(g.outcome.board.rows, `${where} の置いた後の盤面`).toEqual(e.rowsAfter)
        expect(g.outcome.pending.map((p) => [p[0], p[1]]), `${where} の予告`).toEqual(e.pendingAfter)
      }
    }
  })

  it('特徴量が一致する（float32 なので完全一致を期待）', () => {
    let worst = 0
    for (const c of data.cases) {
      const cands = enumerateCandidates(toPosition(c.position))
      const feats = encodeMany(cands, net.featureVersion)
      const dim = net.featureDim
      for (let i = 0; i < cands.length; i++) {
        for (let k = 0; k < dim; k++) {
          const diff = Math.abs(feats[i * dim + k] - c.features[i][k])
          if (diff > worst) worst = diff
          if (diff > 1e-6) {
            throw new Error(
              `case ${c.id} 候補 ${i} の特徴量 ${data.featureNames[k]}: ` +
              `TS=${feats[i * dim + k]} Python=${c.features[i][k]}`,
            )
          }
        }
      }
    }
    expect(worst).toBeLessThan(1e-6)
  })

  it('評価値（報酬 + γV）が一致する', () => {
    const agent = new NeuralAgent(net, 0, data.beam)
    let worst = 0
    for (const c of data.cases) {
      const cands = enumerateCandidates(toPosition(c.position))
      const got = agent.scores(cands)
      for (let i = 0; i < cands.length; i++) {
        worst = Math.max(worst, Math.abs(got[i] - c.scores[i]))
      }
    }
    // float32 の足し算の順番が違うぶんだけずれる。点数の差（ふつう 0.01 以上）よりずっと小さい
    expect(worst).toBeLessThan(2e-3)
  })

  for (const la of data.lookaheads) {
    it(`選ぶ手が一致する（先読み ${la}）`, () => {
      const agent = new NeuralAgent(net, la, data.beam)
      const mismatches: string[] = []
      for (const c of data.cases) {
        const cands = enumerateCandidates(toPosition(c.position))
        const got = agent.chooseIndex(cands)
        const want = c.choice[String(la)]
        if (got !== want) {
          mismatches.push(`case ${c.id}: TS=${got} Python=${want}`)
        }
      }
      expect(mismatches, mismatches.join(' / ')).toEqual([])
    })
  }
})

// 手を選ぶ AI。backend/rl/tetris/agent.py の NeuralAgent と同じ選び方。
//   score = 報酬 + gamma × V(置いた後)
// lookahead > 0 のときは NEXT のミノをその数だけ先まで読む（ビームサーチ）。

import { encodeMany } from './encoding'
import { ValueNet } from './net'
import {
  candidatePath, enumerateCandidates, positionAfter,
  type Candidate, type Position,
} from './position'
import type { Action } from './movegen'

export function rewardOf(c: Candidate, net: ValueNet): number {
  if (c.dead) return net.reward.death
  return net.reward.alive + net.reward.line * c.outcome.lines + net.reward.attack * c.outcome.attack
}

/** ビームサーチの途中の局面 */
interface Node {
  score: number
  root: number // 1 手目の候補番号
  cand: Candidate
  acc: number // ここまでの報酬（割引あり）
  disc: number // 次の段の割引率
}

export class NeuralAgent {
  net: ValueNet
  lookahead: number
  beam: number

  constructor(net: ValueNet, lookahead = 1, beam = 8) {
    this.net = net
    this.lookahead = lookahead
    this.beam = beam
  }

  /** 候補手それぞれの点数（報酬 + γV）。特徴量を渡せばそれを使う */
  scores(cands: Candidate[], feats?: Float32Array): Float32Array {
    const f = feats ?? encodeMany(cands, this.net.featureVersion)
    const v = this.net.forward(f, cands.length)
    const out = new Float32Array(cands.length)
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i]
      out[i] = rewardOf(c, this.net) + (c.dead ? 0 : this.net.gamma * v[i])
    }
    return out
  }

  /** いちばんよい手の「候補番号」。候補が無ければ -1 */
  chooseIndex(cands: Candidate[]): number {
    if (!cands.length) return -1
    const s1 = this.scores(cands)
    if (this.lookahead <= 0) {
      let best = 0
      for (let i = 1; i < cands.length; i++) if (s1[i] > s1[best]) best = i
      return best
    }
    return this.beamSearch(cands, s1)
  }

  choose(pos: Position): { candidate: Candidate; path: Action[]; index: number } | null {
    const cands = enumerateCandidates(pos)
    const i = this.chooseIndex(cands)
    if (i < 0) return null
    return { candidate: cands[i], path: candidatePath(cands[i]), index: i }
  }

  /**
   * lookahead 手先まで NEXT を使って読み、一番よい 1 手目の番号を返す。
   * 局面の点数は「ここまでの報酬（割引あり）+ γ^深さ × V(最後に置いた後)」。
   * agent.py の _beam_search と同じ（並び順・同点の扱いまで揃えてある）。
   */
  private beamSearch(cands: Candidate[], s1: Float32Array): number {
    const g = this.net.gamma
    const finished: Node[] = []
    let frontier: Node[] = []
    for (let i = 0; i < cands.length; i++) {
      const n: Node = { score: s1[i], root: i, cand: cands[i], acc: rewardOf(cands[i], this.net), disc: g }
      if (cands[i].dead) finished.push(n)
      else frontier.push(n)
    }
    frontier = frontier.sort((a, b) => b.score - a.score).slice(0, this.beam)

    for (let depth = 0; depth < this.lookahead; depth++) {
      const expand: Node[] = []
      const children: Candidate[][] = []
      for (const n of frontier) {
        const nxt = positionAfter(n.cand)
        if (nxt === null) {
          finished.push(n) // NEXT が分からないので、ここで読み終える
          continue
        }
        const cs = enumerateCandidates(nxt)
        if (!cs.length) {
          finished.push({ ...n, score: n.acc + n.disc * this.net.reward.death })
          continue
        }
        expand.push(n)
        children.push(cs)
      }
      if (!expand.length) {
        frontier = []
        break
      }
      const flat: Candidate[] = []
      for (const cs of children) for (const c of cs) flat.push(c)
      const sc = this.scores(flat)

      const nextNodes: Node[] = []
      let k = 0
      for (let ei = 0; ei < expand.length; ei++) {
        const n = expand[ei]
        for (const c of children[ei]) {
          nextNodes.push({
            score: n.acc + n.disc * sc[k], root: n.root, cand: c,
            acc: n.acc + n.disc * rewardOf(c, this.net), disc: n.disc * g,
          })
          k++
        }
      }
      const alive: Node[] = []
      for (const n of nextNodes) (n.cand.dead ? finished : alive).push(n)
      frontier = alive.sort((a, b) => b.score - a.score).slice(0, this.beam)
    }

    let best = frontier.length ? frontier[0] : finished[0]
    for (const n of frontier) if (n.score > best.score) best = n
    for (const n of finished) if (n.score > best.score) best = n
    return best.root
  }
}

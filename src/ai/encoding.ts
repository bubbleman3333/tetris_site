// 候補手の結果（置いた後の局面）をニューラルネットの入力ベクトルにする。
// backend/rl/tetris/encoding.py と同じ並び・同じ割り算の値。
//
// | バージョン | 次元 | 中身 |
// |---|---|---|
// | 1 | 43 | 自分の盤面だけ |
// | 2 | 52 | 1 に「相手の様子」9 個を足したもの |
//
// このサイトに相手の盤面は無い（挑戦者はおじゃまを送るだけ）ので、バージョン 2 の重みでも
// 相手の 9 個は常に 0 になる。Python 側で opponent=None にしたときと同じ扱い。

import { PIECE_TYPES, VISIBLE_HEIGHT } from '../engine/pieces'
import { boardFeatures } from './features'
import { opponentAfter, type Candidate } from './position'

export const FEATURE_DIMS: Record<number, number> = { 1: 43, 2: 52 }

// だいたい 0〜1 に収まるようにするための割り算の値（encoding.py の _SELF_SCALE / _OPPONENT_SCALE）
const SELF_SCALE: number[] = [
  ...new Array<number>(10).fill(20),
  20, 20, 40, 40, 20, 200, 60, 60, 60, 3, 4, 10, 1, 1, 1, 10, 1, 20,
  ...new Array<number>(8).fill(1),
  ...new Array<number>(7).fill(1),
]
const OPPONENT_SCALE: number[] = [1, 20, 200, 20, 40, 20, 20, 10, 1]
const SCALE: Record<number, number[]> = {
  1: SELF_SCALE,
  2: SELF_SCALE.concat(OPPONENT_SCALE),
}

/** cands を 1 本の Float32Array（n × dim、行優先）にする */
export function encodeMany(cands: Candidate[], version: number): Float32Array {
  const dim = FEATURE_DIMS[version]
  const scale = SCALE[version]
  const out = new Float32Array(cands.length * dim)
  for (let i = 0; i < cands.length; i++) encodeInto(cands[i], version, scale, out, i * dim)
  return out
}

function encodeInto(
  c: Candidate, version: number, scale: number[], out: Float32Array, base: number,
): void {
  const f = boardFeatures(c.outcome.board)
  const o = c.outcome
  let k = 0
  const put = (v: number | boolean): void => {
    out[base + k] = (typeof v === 'boolean' ? (v ? 1 : 0) : v) / scale[k]
    k++
  }

  for (const h of f.heights) put(h)
  put(f.holes); put(f.holeRows); put(f.holeDepth); put(f.bumpiness)
  put(f.maxHeight); put(f.aggHeight); put(f.rowTransitions); put(f.colTransitions)
  put(f.wells); put(f.tSlots)
  put(o.lines); put(o.attack)
  put(c.placement.spin === 'full'); put(c.placement.spin === 'mini')
  put(o.perfectClear); put(Math.max(o.combo, 0)); put(o.b2b)
  let pendingSum = 0
  for (const p of o.pending) pendingSum += p[0]
  put(pendingSum)

  for (const p of PIECE_TYPES) put(c.holdAfter === p)
  put(c.holdAfter === null)
  for (const p of PIECE_TYPES) put(c.nextAfter === p)

  if (version >= 2) {
    // 「この手を打った後」の相手を見る。相手がいなければ全部 0（opp_present = 0）
    const opp = opponentAfter(c)
    if (!opp) {
      for (let i = 0; i < OPPONENT_SCALE.length; i++) put(0)
    } else {
      // あと何段で相手が死ぬか。計算で出せる値だが、判断の中心になるので直接渡す
      const margin = Math.max(0, VISIBLE_HEIGHT - (opp.maxHeight + opp.pending))
      put(1); put(opp.maxHeight); put(opp.aggHeight); put(opp.holes); put(opp.bumpiness)
      put(opp.pending); put(margin); put(Math.max(opp.combo, 0)); put(opp.b2b)
    }
  }
}

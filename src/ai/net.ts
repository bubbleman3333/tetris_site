// 学習済み ValueNet（MLP）をブラウザで動かす。
// 重みは tools/export_weights.py が書き出した JSON（float32 を base64 にしたもの）。
// backend/rl/tetris/model.py の ValueNet と同じ計算: Linear→ReLU を layers 回 → Linear（出力 1）。

export interface RewardConfig {
  alive: number
  line: number
  attack: number
  death: number
}

export interface WeightsJson {
  agent: string
  featureVersion: number
  featureDim: number
  hidden: number
  episode: number | null
  gamma: number
  reward: RewardConfig & { win?: number }
  layers: { in: number; out: number; w: string; b: string }[]
}

function decodeF32(b64: string): Float32Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

interface Layer {
  inDim: number
  outDim: number
  w: Float32Array // [out, in]（PyTorch の Linear と同じ並び）
  b: Float32Array
}

export class ValueNet {
  readonly featureVersion: number
  readonly featureDim: number
  readonly gamma: number
  readonly reward: RewardConfig
  readonly agent: string
  readonly episode: number | null
  private layers: Layer[]
  /** 行列の掛け算で使い回す作業用の配列（毎手 new しないため） */
  private scratch: Float32Array[] = []

  constructor(data: WeightsJson) {
    this.agent = data.agent
    this.episode = data.episode ?? null
    this.featureVersion = data.featureVersion
    this.featureDim = data.featureDim
    this.gamma = data.gamma
    this.reward = {
      alive: data.reward.alive, line: data.reward.line,
      attack: data.reward.attack, death: data.reward.death,
    }
    this.layers = data.layers.map((l) => ({
      inDim: l.in, outDim: l.out, w: decodeF32(l.w), b: decodeF32(l.b),
    }))
    if (this.layers[0].inDim !== this.featureDim) {
      throw new Error(`重みの入力が ${this.layers[0].inDim} 次元で、特徴量 ${this.featureDim} 次元と合いません`)
    }
  }

  private buffer(i: number, size: number): Float32Array {
    const cur = this.scratch[i]
    if (cur && cur.length >= size) return cur
    const buf = new Float32Array(size)
    this.scratch[i] = buf
    return buf
  }

  /** x: n × featureDim（行優先）→ V の値 n 個 */
  forward(x: Float32Array, n: number): Float32Array {
    let cur = x
    let curDim = this.featureDim
    for (let li = 0; li < this.layers.length; li++) {
      const { inDim, outDim, w, b } = this.layers[li]
      const relu = li < this.layers.length - 1
      const out = this.buffer(li, n * outDim)
      for (let i = 0; i < n; i++) {
        const xo = i * curDim
        const yo = i * outDim
        for (let o = 0; o < outDim; o++) {
          const wo = o * inDim
          let s = b[o]
          for (let j = 0; j < inDim; j++) s += w[wo + j] * cur[xo + j]
          out[yo + o] = relu && s < 0 ? 0 : s
        }
      }
      cur = out
      curDim = outDim
    }
    // 最後の層は出力 1 なので、そのまま n 個の値になる
    return cur.subarray(0, n)
  }
}

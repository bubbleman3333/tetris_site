// 画面の組み立てとゲームの進行。AI の思考は Web Worker（src/ai/worker.ts）に任せる。

import './styles.css'

import { ATTACKS, BEAM, ENERGY_MAX, ENERGY_REGEN, LOOKAHEAD, MOVE_MS } from './balance'
import { Game } from './engine/game'
import type { Action } from './ai/movegen'
import { drawBoard, drawPendingBar, drawPiece } from './ui/render'
import { fetchHall, fetchStats, postResult, type WorldStats } from './ui/api'
import AiWorker from './ai/worker?worker'

const SITE_URL = 'https://taorenai-tetris.pages.dev/'
const WEIGHTS_URL = '/ai/v3-selfplay-best.json'
const NAME_MAX = 20
const NG = ['死ね', '殺す', 'http://', 'https://', 'www.', '.com', '.net', '.jp', '@', 'line.me']

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!

const el = {
  heroStat: $('#hero-stat'),
  time: $('#stat-time'),
  lines: $('#stat-lines'),
  garbage: $('#stat-garbage'),
  board: $<HTMLCanvasElement>('#board'),
  pending: $<HTMLCanvasElement>('#pending'),
  hold: $<HTMLCanvasElement>('#hold'),
  nexts: [...document.querySelectorAll<HTMLCanvasElement>('[data-next]')],
  energyFill: $('#energy-fill'),
  attacks: $('#attacks'),
  giveup: $<HTMLButtonElement>('#btn-giveup'),
  think: $('#think'),
  worldLine: $('#world-line'),
  hall: $('#hall'),
  aboutMeta: $('#about-meta'),
  overlay: $('#overlay'),
  card: $('#overlay-card'),
}

const fmtTime = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`
}

// --- 状態 -------------------------------------------------------------------

type Phase = 'loading' | 'playing' | 'finished'

let phase: Phase = 'loading'
let game = new Game((Math.random() * 0x7fffffff) | 0)
/**
 * 生存時間（秒）。壁掛け時計ではなく、画面が動いているあいだだけ足す。
 * タブを裏に回すと AI も止まる（requestAnimationFrame が止まる）ので、
 * そのぶんを数えると「放置しただけで最長生存記録」になってしまう。
 */
let elapsed = 0
let energy = ENERGY_MAX * 0.4
let garbageSent = 0
let flash = 0
let killed = false

// AI の 1 手の進み具合
let pieceStart = 0
let placedAt = 0
let path: Action[] | null = null
let placed = false
let waiting = false
let thinkId = 0
let lastThinkMs = 0
let aiError: string | null = null
/** 実際にかかっている 1 手の時間。遅い端末でも難しさが変わらないよう、回復量をこれで割る */
let avgPieceMs = MOVE_MS

let world: WorldStats | null = null

// --- AI の Worker -----------------------------------------------------------

const worker = new AiWorker()

worker.onmessage = (ev: MessageEvent): void => {
  const m = ev.data
  if (m.type === 'ready') {
    el.aboutMeta.textContent =
      `使っている重み: ${m.agent}（${m.episode ?? '?'} エピソード学習・特徴量 ${m.featureDim} 次元 / ` +
      `バージョン ${m.featureVersion}）。先読み ${LOOKAHEAD} 手・ビーム幅 ${BEAM}。`
    start()
  } else if (m.type === 'move') {
    if (m.id !== thinkId) return
    path = m.path
    waiting = false
    lastThinkMs = m.ms
  } else if (m.type === 'error') {
    aiError = m.message
    console.error('AI worker error:', m.message)
  }
}

worker.onerror = (e): void => {
  aiError = e.message
  console.error('AI worker error:', e)
}

worker.postMessage({ type: 'init', url: WEIGHTS_URL, lookahead: LOOKAHEAD, beam: BEAM })

function requestThink(): void {
  if (!game.current) return
  thinkId++
  waiting = true
  path = null
  placed = false
  worker.postMessage({
    type: 'think',
    id: thinkId,
    position: {
      rows: game.board.rows,
      current: game.current.type,
      hold: game.hold,
      canHold: game.canHold,
      next: game.nextPieces,
      combo: game.combo,
      b2b: game.b2b,
      pending: game.pending.map((p) => [p[0], p[1]]),
    },
  })
}

// --- ゲームの進行 -------------------------------------------------------------

function start(): void {
  game = new Game((Math.random() * 0x7fffffff) | 0)
  elapsed = 0
  energy = ENERGY_MAX * 0.4
  garbageSent = 0
  killed = false
  avgPieceMs = MOVE_MS
  phase = 'playing'
  el.giveup.disabled = false
  pieceStart = performance.now()
  requestThink()
}

function stepAi(now: number): void {
  if (game.over) {
    finish(true)
    return
  }
  if (!waiting && path === null && !placed) {
    requestThink()
    return
  }
  if (path && !placed && now - pieceStart >= MOVE_MS * 0.45) {
    // path の最後は HD。手前までを一気に適用すると、置く場所にミノが移動した絵になる
    for (let i = 0; i < path.length - 1; i++) game.apply(path[i])
    placed = true
    placedAt = now
  }
  const dropAt = Math.max(pieceStart + MOVE_MS, placedAt + MOVE_MS * 0.3)
  if (placed && now >= dropAt) {
    game.hardDrop()
    const took = now - pieceStart
    avgPieceMs = avgPieceMs * 0.8 + Math.max(took, MOVE_MS) * 0.2
    pieceStart = now
    path = null
    placed = false
    if (game.over) {
      finish(true)
      return
    }
    requestThink()
  }
}

function attack(lines: number, cost: number): void {
  if (phase !== 'playing' || energy < cost) return
  energy -= cost
  garbageSent += lines
  game.receiveGarbage(lines)
  flash = 1
}

function finish(byAi: boolean): void {
  if (phase !== 'playing') return
  phase = 'finished'
  killed = byAi
  el.giveup.disabled = true
  showResult(Math.round(elapsed))
}

// --- 描画 -------------------------------------------------------------------

let last = performance.now()

function frame(now: number): void {
  const dt = Math.min(now - last, 250) / 1000
  last = now

  if (phase === 'playing') {
    elapsed += dt
    // 1 手あたり ENERGY_REGEN × MOVE_MS/1000 を配る（端末の速さで難易度が変わらないように）
    energy = Math.min(ENERGY_MAX, energy + ENERGY_REGEN * (MOVE_MS / avgPieceMs) * dt)
    stepAi(now)
    el.time.textContent = fmtTime(elapsed)
  }
  flash = Math.max(0, flash - dt * 2.5)

  el.lines.textContent = String(game.stats.lines)
  el.garbage.textContent = `${garbageSent} 段`
  drawBoard(el.board, game, flash)
  drawPendingBar(el.pending, game.pending.reduce((a, p) => a + p[0], 0))
  drawPiece(el.hold, game.hold, !game.canHold)
  const next = game.nextPieces
  el.nexts.forEach((c, i) => drawPiece(c, next[i] ?? null))
  el.energyFill.style.width = `${(energy / ENERGY_MAX) * 100}%`
  for (const b of buttons) b.disabled = phase !== 'playing' || energy < Number(b.dataset.cost)
  el.think.textContent = aiError
    ? `AI が止まりました: ${aiError}`
    : phase === 'playing' ? `AI の思考 ${lastThinkMs}ms / 手` : '—'

  requestAnimationFrame(frame)
}

// --- 攻撃ボタン ---------------------------------------------------------------

const buttons: HTMLButtonElement[] = ATTACKS.map((a, i) => {
  const b = document.createElement('button')
  b.dataset.cost = String(a.cost)
  b.className = i === ATTACKS.length - 1 ? 'big' : ''
  b.innerHTML = `${a.lines} 段<small>${a.cost}</small>`
  b.title = a.label
  b.addEventListener('click', () => attack(a.lines, a.cost))
  el.attacks.append(b)
  return b
})

window.addEventListener('keydown', (e) => {
  const i = ['1', '2', '3'].indexOf(e.key)
  if (i >= 0) attack(ATTACKS[i].lines, ATTACKS[i].cost)
})

el.giveup.addEventListener('click', () => finish(false))

// --- 結果の画面 ---------------------------------------------------------------

function checkName(name: string): string | null {
  if (!name) return null
  if ([...name].length > NAME_MAX) return `名前は ${NAME_MAX} 字までです`
  const lower = name.toLowerCase()
  if (NG.some((w) => lower.includes(w))) return 'URL や連絡先、不適切な語は使えません'
  return null
}

function shareText(seconds: number): string {
  const rate = world ? `（撃破率 ${(world.kill_rate * 100).toFixed(1)}%）` : ''
  return killed
    ? `AI を ${fmtTime(seconds)} で倒しました${rate}「絶対に倒れないテトリス」`
    : `「絶対に倒れないテトリス」に挑戦。${fmtTime(seconds)} かけても倒せませんでした${rate}`
}

function openShare(seconds: number): void {
  const url = new URL('https://twitter.com/intent/tweet')
  url.searchParams.set('text', shareText(seconds))
  url.searchParams.set('url', SITE_URL)
  window.open(url.toString(), '_blank', 'noopener')
}

function showResult(seconds: number): void {
  const lines = game.stats.lines
  el.card.innerHTML = killed
    ? `
      <h2 class="win">撃破！</h2>
      <p class="big">生存 ${fmtTime(seconds)}</p>
      <p>送ったおじゃま <b>${garbageSent}</b> 段 ／ AI が消したライン <b>${lines}</b></p>
      <input type="text" id="name" maxlength="${NAME_MAX}" placeholder="名前（${NAME_MAX} 字まで・省略可）" />
      <input type="text" class="honeypot" id="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <p class="error" id="err"></p>
      <div class="row">
        <button class="primary" id="send">殿堂に登録</button>
        <button class="x" id="share">X で共有</button>
      </div>
      <div class="row"><button class="sub" id="again">もう一度</button></div>
      <p class="note">名前は殿堂（最速撃破 100 人）に出ます。</p>`
    : `
      <h2>AI は倒れませんでした</h2>
      <p class="big">生存 ${fmtTime(seconds)}</p>
      <p>送ったおじゃま <b>${garbageSent}</b> 段 ／ AI が消したライン <b>${lines}</b></p>
      <p class="error" id="err"></p>
      <div class="row">
        <button class="x" id="share">X で共有</button>
        <button class="sub" id="again">もう一度</button>
      </div>
      <p class="note">挑戦の記録は世界の戦績に足されます。</p>`
  el.overlay.hidden = false

  const err = $('#err')
  const again = $<HTMLButtonElement>('#again')
  again.addEventListener('click', () => {
    el.overlay.hidden = true
    start()
  })
  $<HTMLButtonElement>('#share').addEventListener('click', () => openShare(seconds))

  const payload = { killed, seconds, garbage: garbageSent, lines }

  if (killed) {
    const send = $<HTMLButtonElement>('#send')
    send.addEventListener('click', async () => {
      const name = $<HTMLInputElement>('#name').value.trim()
      const bad = checkName(name)
      if (bad) {
        err.textContent = bad
        return
      }
      send.disabled = true
      send.textContent = '送信中…'
      const res = await postResult({
        ...payload,
        name: name || undefined,
        website: $<HTMLInputElement>('#website').value,
      })
      if (res.ok) {
        send.textContent = '登録しました'
        void refreshWorld()
      } else {
        err.textContent = res.error ?? '送信に失敗しました'
        send.disabled = false
        send.textContent = '殿堂に登録'
      }
    })
  } else if (garbageSent > 0) {
    // 倒せなかったときも記録は送る（撃破率を正しく出すため。名前は送らない）
    void postResult(payload).then(() => refreshWorld())
  }
}

// --- 世界の戦績 ---------------------------------------------------------------

async function refreshWorld(): Promise<void> {
  try {
    world = await fetchStats()
    const rate = (world.kill_rate * 100).toFixed(1)
    el.heroStat.textContent =
      `挑戦 ${world.games} 回 ／ 撃破 ${world.kills} 回 ／ 撃破率 ${rate}%`
    const fastest = world.fastest
      ? `最速撃破 <b>${fmtTime(world.fastest.seconds)}</b>（${escapeHtml(world.fastest.name || 'ななし')}）`
      : '最速撃破 <b>まだ誰もいません</b>'
    el.worldLine.innerHTML =
      `挑戦 <b>${world.games}</b> 回 ／ 撃破 <b>${world.kills}</b> 回（撃破率 <b>${rate}%</b>）<br />` +
      `${fastest} ／ AI の最長生存 <b>${fmtTime(world.longest_seconds)}</b>`
  } catch {
    el.worldLine.textContent = '戦績を取得できませんでした。'
    el.heroStat.textContent = 'AI はまだ誰にも倒されていないかもしれません。'
  }
  try {
    const { entries } = await fetchHall()
    el.hall.innerHTML = entries.length
      ? entries
        .map((e) => `<li><b>${escapeHtml(e.name || 'ななし')}</b><span>${fmtTime(e.seconds)}</span></li>`)
        .join('')
      : '<li class="empty">まだ誰も倒していません。最初の 1 人になってください。</li>'
  } catch {
    el.hall.innerHTML = '<li class="empty">殿堂を取得できませんでした。</li>'
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

void refreshWorld()
requestAnimationFrame(frame)

// 開発時だけ、進行の様子をコンソールから見られるようにしておく
if (import.meta.env.DEV) {
  Object.assign(window, {
    dbg: () => ({
      phase, waiting, placed, path, thinkId, avgPieceMs,
      over: game.over, pieces: game.stats.pieces, energy: Math.round(energy),
      sincePiece: Math.round(performance.now() - pieceStart),
    }),
  })
}

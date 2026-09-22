// 盤面・NEXT・HOLD の描画（canvas）。

import { CELLS, type PieceType, type Rotation } from '../engine/pieces'
import type { CellColor } from '../engine/board'
import type { Game } from '../engine/game'

const VISIBLE = 20
const WIDTH = 10

export const COLORS: Record<Exclude<CellColor, ''>, string> = {
  I: '#2ee6d6',
  J: '#4f7cff',
  L: '#ff9f43',
  O: '#ffd93d',
  S: '#4ade80',
  T: '#c084fc',
  Z: '#fb7185',
  G: '#5a6472',
}

function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawCell(
  ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color: string, alpha = 1,
): void {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  roundRect(ctx, px + size * 0.04, py + size * 0.04, size * 0.92, size * 0.92, size * 0.18)
  ctx.fill()
  // 上側に軽いハイライトを入れて立体感を出す
  ctx.globalAlpha = alpha * 0.25
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, px + size * 0.12, py + size * 0.1, size * 0.76, size * 0.22, size * 0.1)
  ctx.fill()
  ctx.globalAlpha = 1
}

/** canvas を devicePixelRatio に合わせる。戻り値は CSS ピクセルでの大きさ */
function fit(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(rect.width, 1)
  const h = Math.max(rect.height, 1)
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return { ctx, w, h }
}

export function drawBoard(canvas: HTMLCanvasElement, game: Game, flash: number): void {
  const { ctx, w, h } = fit(canvas)
  const size = Math.min(w / WIDTH, h / VISIBLE)
  const ox = (w - size * WIDTH) / 2
  const oy = (h - size * VISIBLE) / 2
  const py = (y: number): number => oy + (VISIBLE - 1 - y) * size

  ctx.fillStyle = '#0d1017'
  roundRect(ctx, ox, oy, size * WIDTH, size * VISIBLE, 8)
  ctx.fill()

  // 格子
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let x = 1; x < WIDTH; x++) {
    ctx.beginPath()
    ctx.moveTo(ox + x * size, oy)
    ctx.lineTo(ox + x * size, oy + size * VISIBLE)
    ctx.stroke()
  }
  for (let y = 1; y < VISIBLE; y++) {
    ctx.beginPath()
    ctx.moveTo(ox, oy + y * size)
    ctx.lineTo(ox + size * WIDTH, oy + y * size)
    ctx.stroke()
  }

  for (let y = 0; y < VISIBLE; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const c = game.board.colors[y][x]
      if (c) drawCell(ctx, ox + x * size, py(y), size, COLORS[c])
    }
  }

  const p = game.current
  if (p && !game.over) {
    const gy = game.ghostY()
    ctx.strokeStyle = COLORS[p.type]
    ctx.lineWidth = Math.max(1, size * 0.08)
    ctx.globalAlpha = 0.45
    for (const [dx, dy] of CELLS[p.type][p.rot]) {
      const cy = gy + dy
      if (cy < VISIBLE) {
        roundRect(ctx, ox + (p.x + dx) * size + size * 0.1, py(cy) + size * 0.1,
          size * 0.8, size * 0.8, size * 0.16)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    for (const [dx, dy] of CELLS[p.type][p.rot]) {
      const cy = p.y + dy
      if (cy < VISIBLE) drawCell(ctx, ox + (p.x + dx) * size, py(cy), size, COLORS[p.type])
    }
  }

  // 攻撃が当たったときの赤い枠
  if (flash > 0) {
    ctx.strokeStyle = `rgba(255,86,86,${Math.min(flash, 1) * 0.9})`
    ctx.lineWidth = 4
    roundRect(ctx, ox + 2, oy + 2, size * WIDTH - 4, size * VISIBLE - 4, 8)
    ctx.stroke()
  }

  if (game.over) {
    ctx.fillStyle = 'rgba(8,10,16,0.72)'
    roundRect(ctx, ox, oy, size * WIDTH, size * VISIBLE, 8)
    ctx.fill()
  }
}

/** 予告おじゃまの量を盤面の左に出す（jstris と同じ見せ方） */
export function drawPendingBar(canvas: HTMLCanvasElement, pending: number): void {
  const { ctx, w, h } = fit(canvas)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  roundRect(ctx, 0, 0, w, h, 4)
  ctx.fill()
  if (pending <= 0) return
  const ratio = Math.min(pending / 20, 1)
  const bar = h * ratio
  const grd = ctx.createLinearGradient(0, h - bar, 0, h)
  grd.addColorStop(0, '#ffd93d')
  grd.addColorStop(1, '#ff4d4d')
  ctx.fillStyle = grd
  roundRect(ctx, 0, h - bar, w, bar, 4)
  ctx.fill()
}

/** 1 つのミノを小さな canvas の中央に描く */
export function drawPiece(canvas: HTMLCanvasElement, piece: PieceType | null, dim = false): void {
  const { ctx, w, h } = fit(canvas)
  if (!piece) return
  const cells = CELLS[piece][0 as Rotation]
  const xs = cells.map((c) => c[0])
  const ys = cells.map((c) => c[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const cols = maxX - minX + 1
  const rows = maxY - minY + 1
  const size = Math.min(w / (cols + 0.5), h / (rows + 0.5))
  const ox = (w - size * cols) / 2
  const oy = (h - size * rows) / 2
  for (const [dx, dy] of cells) {
    drawCell(ctx, ox + (dx - minX) * size, oy + (maxY - dy) * size, size, COLORS[piece], dim ? 0.45 : 1)
  }
}

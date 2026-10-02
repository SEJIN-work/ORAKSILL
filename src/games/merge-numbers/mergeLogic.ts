/** Pure 2048-style rules with obstacle cells and a wild tile (no Phaser). */

export const EMPTY = 0
export const WILD = -1
export const OBSTACLE = -2

export type Board = number[][]
export type Direction = 'up' | 'down' | 'left' | 'right'

export interface StageConfig {
  size: number
  target: number
  moves: number
  obstacles: number
}

/**
 * Difficulty table (PRD 7.4), 24 stages: board size, target, obstacles and the move budget.
 * Stages are ORDERED BY MEASURED DIFFICULTY (`npm run sim:puzzles`), not by any single knob —
 * e.g. a 4×4→256 with no obstacles plays easier than a 5×5→256 with 3. Casual 98% → ~50% (mid)
 * → 13% (24, the "boss" board); skilled 100% → 51%. Targets stay ≤256 so rounds stay ≤ ~2m45s.
 */
export const STAGES: StageConfig[] = [
  { size: 4, target: 64, moves: 75, obstacles: 0 },
  { size: 4, target: 128, moves: 135, obstacles: 0 },
  { size: 4, target: 64, moves: 65, obstacles: 0 },
  { size: 4, target: 128, moves: 125, obstacles: 0 },
  { size: 5, target: 128, moves: 120, obstacles: 1 },
  { size: 4, target: 64, moves: 60, obstacles: 1 },
  { size: 5, target: 256, moves: 225, obstacles: 1 },
  { size: 4, target: 128, moves: 120, obstacles: 1 },
  { size: 4, target: 256, moves: 240, obstacles: 0 },
  { size: 4, target: 256, moves: 230, obstacles: 0 },
  { size: 5, target: 128, moves: 110, obstacles: 2 },
  { size: 5, target: 256, moves: 215, obstacles: 2 },
  { size: 5, target: 256, moves: 210, obstacles: 2 },
  { size: 6, target: 256, moves: 215, obstacles: 3 },
  { size: 5, target: 128, moves: 105, obstacles: 3 },
  { size: 5, target: 256, moves: 205, obstacles: 3 },
  { size: 5, target: 256, moves: 200, obstacles: 3 },
  { size: 6, target: 256, moves: 205, obstacles: 4 },
  { size: 6, target: 256, moves: 200, obstacles: 5 },
  { size: 5, target: 256, moves: 195, obstacles: 4 },
  { size: 4, target: 256, moves: 225, obstacles: 1 },
  { size: 5, target: 256, moves: 190, obstacles: 4 },
  { size: 6, target: 256, moves: 190, obstacles: 5 },
  { size: 6, target: 256, moves: 185, obstacles: 6 },
]

export interface MergeEvent {
  row: number
  col: number
  value: number
}

/** Where one tile travelled this move (for slide animations). */
export interface TileMove {
  from: [number, number]
  to: [number, number]
}

export interface MoveResult {
  board: Board
  moved: boolean
  merges: MergeEvent[]
  moves: TileMove[]
}

const isTile = (v: number) => v > 0 || v === WILD

function canMerge(a: number, b: number): boolean {
  if (a === WILD && b === WILD) return false
  if (a === WILD || b === WILD) return true
  return a > 0 && a === b
}

function mergedValue(a: number, b: number): number {
  if (a === WILD) return b * 2
  if (b === WILD) return a * 2
  return a * 2
}

export function cloneBoard(b: Board): Board {
  return b.map((r) => [...r])
}

/** Cells of each line in travel order (index 0 = the wall tiles slide toward). */
function lines(size: number, dir: Direction): [number, number][][] {
  const out: [number, number][][] = []
  for (let i = 0; i < size; i++) {
    const line: [number, number][] = []
    for (let j = 0; j < size; j++) {
      if (dir === 'left') line.push([i, j])
      else if (dir === 'right') line.push([i, size - 1 - j])
      else if (dir === 'up') line.push([j, i])
      else line.push([size - 1 - j, i])
    }
    out.push(line)
  }
  return out
}

export function move(board: Board, dir: Direction): MoveResult {
  const next = cloneBoard(board)
  const merges: MergeEvent[] = []
  const moves: TileMove[] = []
  let moved = false

  for (const line of lines(board.length, dir)) {
    // Obstacles split a line into independent segments.
    let segment: [number, number][] = []
    const flush = () => {
      const tiles = segment.filter(([r, c]) => isTile(board[r][c]))
      const values = tiles.map(([r, c]) => board[r][c])
      const result: number[] = []
      const mergedAt: number[] = []
      for (let k = 0; k < values.length; k++) {
        const to = segment[result.length]
        if (k + 1 < values.length && canMerge(values[k], values[k + 1])) {
          result.push(mergedValue(values[k], values[k + 1]))
          mergedAt.push(result.length - 1)
          moves.push({ from: tiles[k], to }, { from: tiles[k + 1], to })
          k++
        } else {
          result.push(values[k])
          moves.push({ from: tiles[k], to })
        }
      }
      segment.forEach(([r, c], idx) => {
        const v = result[idx] ?? EMPTY
        if (next[r][c] !== v) moved = true
        next[r][c] = v
      })
      for (const idx of mergedAt) {
        const [r, c] = segment[idx]
        merges.push({ row: r, col: c, value: result[idx] })
      }
      segment = []
    }
    for (const cell of line) {
      if (board[cell[0]][cell[1]] === OBSTACLE) flush()
      else segment.push(cell)
    }
    flush()
  }

  return { board: next, moved, merges, moves }
}

export function canAnyMove(board: Board): boolean {
  return (['up', 'down', 'left', 'right'] as Direction[]).some((d) => move(board, d).moved)
}

export function maxTile(board: Board): number {
  return Math.max(0, ...board.flat())
}

export type Rng = () => number

export function emptyCells(board: Board): [number, number][] {
  const out: [number, number][] = []
  board.forEach((row, r) => row.forEach((v, c) => v === EMPTY && out.push([r, c])))
  return out
}

/** Places a 2 (90%) or 4 on a random empty cell. Returns the cell or null if full. */
export function spawnTile(board: Board, rng: Rng = Math.random, value?: number): [number, number] | null {
  const cells = emptyCells(board)
  if (cells.length === 0) return null
  const [r, c] = cells[Math.floor(rng() * cells.length)]
  board[r][c] = value ?? (rng() < 0.9 ? 2 : 4)
  return [r, c]
}

export function createBoard(config: StageConfig, rng: Rng = Math.random, withWild = false): Board {
  const board: Board = Array.from({ length: config.size }, () => Array(config.size).fill(EMPTY))
  // Obstacles stay off the corners so no corner cell is ever sealed in.
  const candidates = emptyCells(board).filter(([r, c]) => {
    const edgeR = r === 0 || r === config.size - 1
    const edgeC = c === 0 || c === config.size - 1
    return !(edgeR && edgeC)
  })
  for (let i = 0; i < config.obstacles && candidates.length > 0; i++) {
    const [r, c] = candidates.splice(Math.floor(rng() * candidates.length), 1)[0]
    board[r][c] = OBSTACLE
  }
  spawnTile(board, rng)
  spawnTile(board, rng)
  if (withWild) spawnTile(board, rng, WILD)
  return board
}

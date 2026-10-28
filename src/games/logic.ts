export type Game = "runner" | "tetris";
export const runnerSpeed = (score: number) =>
  Math.min(500, 260 + Math.floor(score / 200) * 25);
export const runnerGap = (speed: number, r = Math.random()) =>
  Math.max(360, speed * 1.25 + 70) + r * 140;
export const JUMP_SPEED = 640,
  GRAVITY = 1800;
export type Obstacle = {
  x: number;
  width: number;
  height: number;
  bottom: number;
  kind: "cactus" | "double" | "bird";
};
export function obstacle(x: number, random = Math.random()): Obstacle {
  if (random < 0.4)
    return { x, width: 20, height: 34, bottom: 0, kind: "cactus" };
  if (random < 0.7)
    return { x, width: 46, height: 39, bottom: 0, kind: "double" };
  return {
    x,
    width: 30,
    height: 18,
    bottom: random < 0.86 ? 12 : 62,
    kind: "bird",
  };
}
export function hits(o: Obstacle, jumpHeight: number) {
  return (
    76 < o.x + o.width - 3 &&
    100 > o.x + 3 &&
    jumpHeight + 4 < o.bottom + o.height - 2 &&
    jumpHeight + 39 > o.bottom + 2
  );
}
export type Board = number[][];
export const emptyBoard = (): Board =>
  Array.from({ length: 20 }, () => Array(10).fill(0));
export const SHAPES = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
];
export type Piece = { shape: number[][]; x: number; y: number; color: number };
export const rotate = (s: number[][]) =>
  s[0].map((_, x) => s.map((row) => row[x]).reverse());
export function fits(board: Board, p: Piece) {
  return p.shape.every((row, y) =>
    row.every(
      (v, x) =>
        !v ||
        (p.x + x >= 0 &&
          p.x + x < 10 &&
          p.y + y >= 0 &&
          p.y + y < 20 &&
          !board[p.y + y][p.x + x]),
    ),
  );
}
export function turn(board: Board, p: Piece): Piece {
  const shape = rotate(p.shape);
  for (const kick of [0, -1, 1, -2, 2, -3, 3]) {
    const next = { ...p, x: p.x + kick, shape };
    if (fits(board, next)) return next;
  }
  return p;
}
export function lock(board: Board, p: Piece) {
  const next = board.map((r) => [...r]);
  p.shape.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v) next[p.y + y][p.x + x] = p.color;
    }),
  );
  const kept = next.filter((r) => r.some((v) => !v)),
    lines = 20 - kept.length;
  return {
    board: [...Array.from({ length: lines }, () => Array(10).fill(0)), ...kept],
    lines,
  };
}
export const linePoints = (lines: number, level: number) =>
  [0, 100, 300, 500, 800][lines] * (level + 1);
export const dropInterval = (level: number) => Math.max(110, 850 - level * 65);
export function bag(random = Math.random) {
  const a = [0, 1, 2, 3, 4, 5, 6];
  for (let i = 6; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const spawn = (i: number): Piece => ({
  shape: SHAPES[i].map((r) => [...r]),
  x: Math.floor((10 - SHAPES[i][0].length) / 2),
  y: 0,
  color: i + 1,
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.ts";
import {
  obstacle,
  hits,
  runnerSpeed,
  runnerGap,
  JUMP_SPEED,
  GRAVITY,
  emptyBoard,
  spawn,
  bag,
  fits,
  turn,
  lock,
  linePoints,
  dropInterval,
} from "../src/games/logic.ts";

test("Runner: alle obstakels zijn haalbaar, ook op topsnelheid", () => {
  assert.equal(runnerSpeed(0), 260);
  assert.ok(runnerSpeed(1000) > runnerSpeed(0));
  assert.equal(runnerSpeed(100000), 500);
  for (const speed of [260, 375, 500]) {
    assert.ok(
      runnerGap(speed, 0) >
        speed * ((2 * JUMP_SPEED) / GRAVITY + 0.2) + 46 + 24,
    );
    for (const kind of [0.2, 0.5, 0.78, 0.95]) {
      const original = obstacle(600, kind);
      if (original.bottom > 40) {
        let collided = false;
        for (let t = 0; t < 3; t += 1 / 120)
          collided ||= hits({ ...original, x: 600 - speed * t }, 0);
        assert.equal(collided, false);
        continue;
      }
      let possible = false;
      for (let jumpAt = 0; jumpAt < 3; jumpAt += 1 / 120) {
        let y = 0,
          v = 0,
          jumped = false,
          collision = false;
        for (let t = 0; t < 3; t += 1 / 120) {
          if (!jumped && t >= jumpAt) {
            v = JUMP_SPEED;
            jumped = true;
          }
          v -= GRAVITY / 120;
          y = Math.max(0, y + v / 120);
          if (y === 0) v = 0;
          if (hits({ ...original, x: 600 - speed * t }, y)) {
            collision = true;
            break;
          }
        }
        if (!collision) {
          possible = true;
          break;
        }
      }
      assert.ok(
        possible,
        `${original.kind} moet haalbaar zijn bij ${speed}px/s`,
      );
    }
  }
});

test("Tetris: zeven verschillende stenen, lijnverwijdering, rotatie en snelheid", () => {
  assert.equal(new Set(bag(() => 0.3)).size, 7);
  let board = emptyBoard();
  for (let y = 16; y < 20; y++) board[y] = Array(10).fill(1);
  for (let y = 16; y < 20; y++) board[y][4] = 0;
  const vertical = { shape: [[1], [1], [1], [1]], x: 4, y: 16, color: 1 };
  assert.ok(fits(board, vertical));
  const cleared = lock(board, vertical);
  assert.equal(cleared.lines, 4);
  assert.equal(cleared.board.length, 20);
  assert.ok(cleared.board.every((r) => r.every((v) => !v)));
  assert.equal(linePoints(4, 0), 800);
  assert.equal(linePoints(4, 2), 2400);
  const rotated = turn(emptyBoard(), {
    ...spawn(0),
    shape: [[1], [1], [1], [1]],
    x: 9,
  });
  assert.ok(fits(emptyBoard(), rotated));
  assert.equal(rotated.shape[0].length, 4);
  assert.ok(dropInterval(6) < dropInterval(0));
  assert.ok(dropInterval(100) >= 100);
});

test("Competitie: echte accountnamen, persoonlijke records, top 3, gescheiden games en back-ups", async () => {
  const app = await createApp({ dbPath: ":memory:", serveStatic: false });
  const req = async (
    path: string,
    method = "GET",
    body?: any,
    cookie?: string,
  ) => {
    const r = await app.inject({
      url: "/api" + path,
      method: method as any,
      headers: { "x-yap-request": "1", ...(cookie ? { cookie } : {}) },
      payload: body,
    });
    return {
      status: r.statusCode,
      data: r.json(),
      cookie: String(r.headers["set-cookie"] || "").split(";")[0],
    };
  };
  try {
    assert.equal((await req("/games/runner/leaderboard")).status, 401);
    const password = "Arcade-test123!";
    const admin = await req("/setup", "POST", {
        name: "Maarten",
        email: "admin@example.test",
        password,
      }),
      a = admin.cookie;
    const cookies = [a],
      users = [admin.data];
    for (const [i, name] of ["Rik", "Thijs", "Lezer"].entries()) {
      const user = await req(
        "/admin/users",
        "POST",
        {
          name,
          email: `user${i}@example.test`,
          password,
          role: i === 2 ? "reader" : "member",
          plannable: i !== 2,
          color: "#777799",
        },
        a,
      );
      users.push(user.data);
      cookies.push(
        (await req("/login", "POST", { email: user.data.email, password }))
          .cookie,
      );
    }
    const round = async (game: string, c: string, score: number) => {
      const run = await req(`/games/${game}/start`, "POST", undefined, c);
      const result = await req(
        `/games/${game}/finish`,
        "POST",
        {
          runId: run.data.runId,
          score,
          userId: users[0].id,
          name: "Valse naam",
        },
        c,
      );
      assert.equal(result.status, 200);
      return { runId: run.data.runId, ...result };
    };
    await round("runner", a, 5);
    await round("runner", cookies[1], 20);
    await round("runner", cookies[2], 10);
    const fourth = await round("runner", cookies[3], 15);
    assert.deepEqual(
      fourth.data.top.map((p: any) => p.name),
      ["Rik", "Lezer", "Thijs"],
    );
    assert.equal(fourth.data.rank, 2);
    const lower = await round("runner", cookies[1], 3);
    assert.equal(lower.data.personalBest, 20);
    assert.equal(
      (
        await req(
          "/games/runner/finish",
          "POST",
          { runId: lower.runId, score: 20 },
          cookies[1],
        )
      ).status,
      409,
    );
    const other = await req("/games/runner/start", "POST", undefined, a);
    assert.equal(
      (
        await req(
          "/games/runner/finish",
          "POST",
          { runId: other.data.runId, score: 1 },
          cookies[1],
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await req(
          "/games/runner/finish",
          "POST",
          { runId: other.data.runId, score: -1 },
          a,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await req(
          "/games/runner/finish",
          "POST",
          { runId: other.data.runId, score: 1000000 },
          a,
        )
      ).status,
      400,
    );
    assert.equal(
      (await req("/games/fake/leaderboard", "GET", undefined, a)).status,
      400,
    );
    assert.equal(
      (await req("/games/tetris/leaderboard", "GET", undefined, a)).data.top
        .length,
      0,
    );
    const tetris = await round("tetris", a, 8);
    assert.equal(tetris.data.top[0].name, "Maarten");
    assert.equal(tetris.data.personalBest, 8);
    const backup = (await req("/admin/backup", "GET", undefined, a)).data;
    assert.equal(backup.version, 3);
    assert.equal(backup.gameScores.length, 5);
    assert.ok(!("gameRuns" in backup));
    assert.equal(
      (
        await req(
          "/admin/clear",
          "POST",
          { confirmation: "LEEGMAKEN", password },
          a,
        )
      ).status,
      200,
    );
    assert.equal(
      (await req("/games/runner/leaderboard", "GET", undefined, a)).data.top
        .length,
      0,
    );
    assert.equal(
      (
        await req(
          "/admin/restore",
          "POST",
          { confirmation: "HERSTELLEN", password, backup },
          a,
        )
      ).status,
      200,
    );
    const c = (
      await req("/login", "POST", { email: "admin@example.test", password })
    ).cookie;
    assert.equal(
      (await req("/games/runner/leaderboard", "GET", undefined, c)).data.top[0]
        .name,
      "Rik",
    );
    const legacy = { ...backup, version: 2 };
    delete legacy.gameScores;
    assert.equal(
      (
        await req(
          "/admin/restore",
          "POST",
          { confirmation: "HERSTELLEN", password, backup: legacy },
          c,
        )
      ).status,
      200,
    );
    const c2 = (
      await req("/login", "POST", { email: "admin@example.test", password })
    ).cookie;
    assert.equal(
      (await req("/games/runner/leaderboard", "GET", undefined, c2)).data.top
        .length,
      0,
    );
  } finally {
    await app.close();
  }
});

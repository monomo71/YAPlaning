import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
export const gameScoreSchema = z.object({
  game: z.enum(["runner", "tetris"]),
  userId: z.string().min(1),
  score: z.number().int().min(0).max(10000000),
  updatedAt: z.iso.datetime(),
});
export function registerGames(app: FastifyInstance, db: DatabaseSync) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS game_scores(game TEXT NOT NULL,userId TEXT NOT NULL REFERENCES users(id),score INTEGER NOT NULL,updatedAt TEXT NOT NULL,PRIMARY KEY(game,userId));CREATE TABLE IF NOT EXISTS game_runs(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),game TEXT NOT NULL,startedAt INTEGER NOT NULL);`,
  );
  const gameSchema = z.enum(["runner", "tetris"]);
  const fail = (statusCode: number, message: string): never => {
    throw Object.assign(new Error(message), { statusCode });
  };
  const scores = (game: string, userId: string) => {
    const rows = db
      .prepare(
        "SELECT g.userId,g.score,g.updatedAt,u.name FROM game_scores g JOIN users u ON u.id=g.userId WHERE game=? ORDER BY score DESC,updatedAt ASC,userId ASC",
      )
      .all(game) as any[];
    const i = rows.findIndex((x) => x.userId === userId);
    return {
      top: rows.slice(0, 3).map((r, i) => ({ ...r, rank: i + 1 })),
      personalBest: i < 0 ? 0 : rows[i].score,
      rank: i < 0 ? null : i + 1,
    };
  };
  app.get<{ Params: { game: string } }>(
    "/api/games/:game/leaderboard",
    async (r) => scores(gameSchema.parse(r.params.game), r.account.id),
  );
  app.post<{ Params: { game: string } }>(
    "/api/games/:game/start",
    async (r) => {
      const game = gameSchema.parse(r.params.game),
        id = randomUUID();
      db.prepare(
        "DELETE FROM game_runs WHERE startedAt<? OR (userId=? AND game=?)",
      ).run(Date.now() - 86400000, r.account.id, game);
      db.prepare("INSERT INTO game_runs VALUES (?,?,?,?)").run(
        id,
        r.account.id,
        game,
        Date.now(),
      );
      return { runId: id };
    },
  );
  app.post<{ Params: { game: string } }>(
    "/api/games/:game/finish",
    async (r) => {
      const game = gameSchema.parse(r.params.game);
      const input = z
        .object({
          runId: z.uuid(),
          score: z.number().int().min(0).max(10000000),
        })
        .parse(r.body);
      const run = db
        .prepare("SELECT * FROM game_runs WHERE id=? AND userId=? AND game=?")
        .get(input.runId, r.account.id, game) as any;
      if (!run)
        fail(
          409,
          "Deze speelronde is al opgeslagen of verlopen. Start een nieuwe ronde.",
        );
      const seconds = (Date.now() - run.startedAt) / 1000;
      if (
        seconds > 86400 ||
        input.score > Math.floor(seconds * (game === "runner" ? 12 : 2500)) + 20
      )
        fail(400, "Deze score past niet bij de gespeelde tijd");
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("DELETE FROM game_runs WHERE id=?").run(input.runId);
        db.prepare(
          "INSERT INTO game_scores VALUES (?,?,?,?) ON CONFLICT(game,userId) DO UPDATE SET score=excluded.score,updatedAt=excluded.updatedAt WHERE excluded.score>game_scores.score",
        ).run(game, r.account.id, input.score, new Date().toISOString());
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return scores(game, r.account.id);
    },
  );
}

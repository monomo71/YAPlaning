import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { z } from "zod";
export function registerUserDeletion(
  app: FastifyInstance,
  db: DatabaseSync,
  checkPassword: (password: string, hash: string) => boolean,
) {
  const fail = (statusCode: number, message: string): never => {
    throw Object.assign(new Error(message), { statusCode });
  };
  const all = (sql: string, ...args: any[]) =>
    db.prepare(sql).all(...args) as any[];
  const one = (sql: string, ...args: any[]) =>
    db.prepare(sql).get(...args) as any;
  const admin = (r: any) => {
    if (r.account.role !== "superadmin")
      fail(403, "Alleen de superadmin kan gebruikers verwijderen");
  };
  const transaction = <T>(f: () => T) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = f();
      db.exec("COMMIT");
      return value;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const plan = (id: string, actorId: string) => {
    const user = one("SELECT * FROM users WHERE id=?", id);
    if (!user) fail(404, "Gebruiker niet gevonden");
    if (id === actorId) fail(400, "Je kunt je eigen account niet verwijderen");
    if (
      user.role === "superadmin" &&
      user.active &&
      one(
        "SELECT COUNT(*) AS n FROM users WHERE role='superadmin' AND active=1",
      ).n < 2
    )
      fail(400, "De laatste actieve superadmin kan niet worden verwijderd");
    const users = all("SELECT id,name,active,role FROM users WHERE id<>?", id),
      tasks = all("SELECT * FROM tasks"),
      ownTaskIds = tasks
        .filter((t) => t.ownerId === id)
        .map((t) => t.id)
        .sort();
    const projects = all("SELECT * FROM projects ORDER BY id")
      .filter((p) => JSON.parse(p.data).creatorId === id)
      .map((p) => {
        const project = JSON.parse(p.data),
          otherTasks = tasks.filter(
            (t) => t.ownerId !== id && JSON.parse(t.data).projectId === p.id,
          );
        const participants = users
          .filter((u) => otherTasks.some((t) => t.ownerId === u.id))
          .sort(
            (a, b) =>
              Number(b.active) - Number(a.active) ||
              a.name.localeCompare(b.name, "nl") ||
              a.id.localeCompare(b.id),
          );
        const successor = participants[0];
        return {
          id: p.id,
          name: project.name,
          updatedAt: p.updatedAt,
          action: successor ? "transfer" : "delete",
          remainingTasks: otherTasks.length,
          successor: successor
            ? {
                id: successor.id,
                name: successor.name,
                active: !!successor.active,
              }
            : null,
        };
      });
    const noteIds = all(
        "SELECT id FROM notes WHERE authorId=? ORDER BY id",
        id,
      ).map((n) => n.id),
      scores = one(
        "SELECT COUNT(*) AS n FROM game_scores WHERE userId=?",
        id,
      ).n;
    const raw = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: !!user.active,
      },
      ownTaskIds,
      noteIds,
      scores,
      projects,
    };
    return {
      user: raw.user,
      tasks: ownTaskIds.length,
      notes: noteIds.length,
      scores,
      projects,
      token: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
    };
  };
  app.get<{ Params: { id: string } }>(
    "/api/admin/users/:id/deletion-preview",
    async (r) => {
      admin(r);
      return transaction(() => plan(r.params.id, r.account.id));
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/admin/users/:id/delete",
    async (r) => {
      admin(r);
      const body = z
        .object({
          confirmation: z.literal("VERWIJDEREN"),
          password: z.string().max(200),
          token: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(r.body);
      if (!checkPassword(body.password, r.account.passwordHash))
        fail(403, "Je beheerwachtwoord is onjuist");
      return transaction(() => {
        const preview = plan(r.params.id, r.account.id);
        if (body.token !== preview.token)
          fail(
            409,
            "De taken of projecten zijn inmiddels gewijzigd. Vernieuw het voorbeeld voordat je verwijdert.",
          );
        const id = r.params.id;
        db.prepare("DELETE FROM tasks WHERE ownerId=?").run(id);
        for (const p of preview.projects) {
          if (p.action === "delete")
            db.prepare("DELETE FROM projects WHERE id=?").run(p.id);
          else {
            const current = one("SELECT * FROM projects WHERE id=?", p.id),
              data = JSON.parse(current.data);
            data.creatorId = p.successor!.id;
            const updatedAt = new Date(
              Math.max(Date.now(), Date.parse(current.updatedAt) + 1),
            ).toISOString();
            db.prepare("UPDATE projects SET data=?,updatedAt=? WHERE id=?").run(
              JSON.stringify(data),
              updatedAt,
              p.id,
            );
          }
        }
        db.prepare("DELETE FROM notes WHERE authorId=?").run(id);
        db.prepare("DELETE FROM game_scores WHERE userId=?").run(id);
        db.prepare("DELETE FROM game_runs WHERE userId=?").run(id);
        db.prepare("DELETE FROM sessions WHERE userId=?").run(id);
        db.prepare("DELETE FROM users WHERE id=?").run(id);
        db.prepare(
          "INSERT INTO audit(actor,action,createdAt) VALUES (?,?,?)",
        ).run(
          r.account.id,
          `Gebruiker ${preview.user.name} verwijderd: ${preview.tasks} taken, ${preview.projects.filter((p) => p.action === "delete").length} projecten verwijderd, ${preview.projects.filter((p) => p.action === "transfer").length} projecten overgedragen`,
          new Date().toISOString(),
        );
        return {
          ok: true,
          deletedTasks: preview.tasks,
          deletedProjects: preview.projects.filter((p) => p.action === "delete")
            .length,
          transferredProjects: preview.projects.filter(
            (p) => p.action === "transfer",
          ).length,
        };
      });
    },
  );
}

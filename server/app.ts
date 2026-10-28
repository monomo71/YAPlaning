import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import statics from "@fastify/static";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { z } from "zod";
import {
  projectSchema,
  taskSchema,
  userSchema,
  noteSchema,
  settingsSchema,
} from "./schema.ts";
import { parseImport } from "./import.ts";
declare module "fastify" {
  interface FastifyRequest {
    account: any;
  }
}
const now = () => new Date().toISOString();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
function checkPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const a = Buffer.from(key, "hex"),
    b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode: status });
}
export async function createApp(
  options: {
    dbPath?: string;
    serveStatic?: boolean;
    secureCookies?: boolean;
  } = {},
) {
  const dbPath =
    options.dbPath ??
    resolve(process.env.DATA_DIR || "data", "yaplaning.sqlite");
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,role TEXT NOT NULL,plannable INTEGER NOT NULL,color TEXT NOT NULL,passwordHash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,data TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,ownerId TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(ownerId);
 CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,authorId TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS imports(fingerprint TEXT PRIMARY KEY,createdAt TEXT NOT NULL);`);
  const defaults = {
    organization: "Ons team",
    workStart: 8,
    workEnd: 18,
    showWeekend: false,
    statusColors: {
      Open: "#64748b",
      "In Process": "#6366e8",
      "On Hold": "#d68b24",
      Afgewerkt: "#2b9c76",
    },
  };
  db.prepare("INSERT OR IGNORE INTO settings VALUES (1,?)").run(
    JSON.stringify(defaults),
  );
  const app = Fastify({
    logger: process.env.NODE_ENV === "production",
    bodyLimit: 16 * 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  const q = (s: string, ...p: any[]) => db.prepare(s).all(...p) as any[];
  const one = (s: string, ...p: any[]) => db.prepare(s).get(...p) as any;
  const run = (s: string, ...p: any[]) => db.prepare(s).run(...p);
  const transaction = <T>(f: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = f();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const publicUser = (u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    plannable: !!u.plannable,
    color: u.color,
    active: !!u.active,
  });
  const admin = (r: any) => {
    if (r.account.role !== "superadmin")
      fail(403, "Alleen de superadmin mag dit uitvoeren");
  };
  const writer = (r: any) => {
    if (r.account.role === "reader")
      fail(403, "Dit account heeft alleen leesrechten");
  };
  const audit = (r: any, action: string) =>
    run(
      "INSERT INTO audit(actor,action,createdAt) VALUES (?,?,?)",
      r.account?.id || "setup",
      action,
      now(),
    );
  const getTask = (id: string) => {
    const t = one("SELECT * FROM tasks WHERE id=?", id);
    if (!t) fail(404, "Taak niet gevonden");
    return { id: t.id, ...JSON.parse(t.data), updatedAt: t.updatedAt };
  };
  const mayEdit = (r: any, t: any) => {
    writer(r);
    if (r.account.role !== "superadmin" && r.account.id !== t.ownerId)
      fail(403, "Je kunt alleen je eigen taken aanpassen");
  };
  const validOwner = (id: string) => {
    const u = one("SELECT * FROM users WHERE id=?", id);
    if (!u || !u.active || !u.plannable || u.role === "reader")
      fail(400, "Kies een actieve medewerker met een planning");
  };
  const session = (reply: any, id: string) => {
    run("DELETE FROM sessions WHERE expires<?", Date.now());
    const token = randomBytes(32).toString("hex");
    run(
      "INSERT INTO sessions VALUES (?,?,?)",
      hash(token),
      id,
      Date.now() + 7 * 86400000,
    );
    reply.setCookie("yap_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: options.secureCookies ?? process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: 7 * 86400,
    });
  };
  app.addHook("onRequest", async (r, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin")
      .header("X-Frame-Options", "DENY")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    const path = r.url.split("?")[0];
    if (!path.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method)) {
      if (r.headers["x-yap-request"] !== "1") fail(403, "Ongeldig verzoek");
      const origin = r.headers.origin;
      if (origin) {
        const expected = process.env.APP_ORIGIN || `${r.protocol}://${r.host}`;
        if (origin !== expected)
          fail(403, "Herkomst van verzoek niet toegestaan");
      }
    }
    if (["/api/auth", "/api/setup", "/api/login", "/api/health"].includes(path))
      return;
    const token = r.cookies.yap_session;
    const row =
      token &&
      one(
        "SELECT u.* FROM users u JOIN sessions s ON s.userId=u.id WHERE s.token=? AND s.expires>? AND u.active=1",
        hash(token),
        Date.now(),
      );
    if (!row) fail(401, "Log in om verder te gaan");
    r.account = row;
  });
  app.setErrorHandler((e: any, _r, reply) => {
    const status = e instanceof z.ZodError ? 400 : e.statusCode || 500;
    reply.code(status).send({
      error:
        e instanceof z.ZodError
          ? e.issues
              .map((x: any) => `${x.path.join(".")}: ${x.message}`)
              .join("; ")
          : status >= 500
            ? "Er ging iets mis op de server. Controleer het bestand of probeer opnieuw."
            : e.message,
    });
    if (status >= 500) app.log.error(e);
  });
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/auth", async (r) => {
    const initialized = !!one("SELECT id FROM users LIMIT 1");
    const token = r.cookies.yap_session;
    const u =
      token &&
      one(
        "SELECT u.* FROM users u JOIN sessions s ON s.userId=u.id WHERE s.token=? AND s.expires>? AND u.active=1",
        hash(token),
        Date.now(),
      );
    return { initialized, user: u ? publicUser(u) : null };
  });
  app.post(
    "/api/setup",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (r, reply) => {
      const input = userSchema.parse({
        ...(r.body as any),
        role: "superadmin",
        plannable: true,
        active: true,
        color: "#6366e8",
      });
      if (!input.password) fail(400, "Wachtwoord is verplicht");
      const id = randomUUID();
      transaction(() => {
        if (one("SELECT id FROM users LIMIT 1"))
          fail(409, "De eerste beheerder is al aangemaakt");
        run(
          "INSERT INTO users VALUES (?,?,?,?,?,?,?,?)",
          id,
          input.name,
          input.email,
          input.role,
          1,
          input.color,
          passwordHash(input.password!),
          1,
        );
      });
      session(reply, id);
      return publicUser(one("SELECT * FROM users WHERE id=?", id));
    },
  );
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (r, reply) => {
      const input = z
        .object({ email: z.string().max(200), password: z.string().max(200) })
        .parse(r.body);
      const u = one(
        "SELECT * FROM users WHERE email=? AND active=1",
        input.email.toLowerCase().trim(),
      );
      const ok = checkPassword(
        input.password,
        u?.passwordHash ||
          "00000000000000000000000000000000:" + "00".repeat(64),
      );
      if (!u || !ok) fail(401, "E-mailadres of wachtwoord is onjuist");
      session(reply, u.id);
      return publicUser(u);
    },
  );
  app.post("/api/logout", async (r, reply) => {
    if (r.cookies.yap_session)
      run("DELETE FROM sessions WHERE token=?", hash(r.cookies.yap_session));
    reply.clearCookie("yap_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/data", async (r) => ({
    user: publicUser(r.account),
    users: q("SELECT * FROM users ORDER BY name").map(publicUser),
    projects: q("SELECT * FROM projects").map((p) => ({
      id: p.id,
      ...JSON.parse(p.data),
      updatedAt: p.updatedAt,
    })),
    tasks: q("SELECT * FROM tasks").map((t) => ({
      id: t.id,
      projectId: null,
      ...JSON.parse(t.data),
      updatedAt: t.updatedAt,
    })),
    notes: q("SELECT * FROM notes ORDER BY updatedAt DESC")
      .map((n) => ({
        id: n.id,
        authorId: n.authorId,
        ...JSON.parse(n.data),
        updatedAt: n.updatedAt,
      }))
      .filter((n) => n.shared || n.authorId === r.account.id),
    settings: JSON.parse(one("SELECT data FROM settings WHERE id=1").data),
  }));
  const validProject = (id: string | null) => {
    if (id && !one("SELECT id FROM projects WHERE id=?", id))
      fail(400, "Project niet gevonden");
  };
  app.post("/api/projects", async (r) => {
    writer(r);
    const p = { ...projectSchema.parse(r.body), creatorId: r.account.id };
    if (
      q("SELECT data FROM projects").some(
        (x) => JSON.parse(x.data).name.toLowerCase() === p.name.toLowerCase(),
      )
    )
      fail(409, "Er bestaat al een project met deze naam");
    const id = randomUUID(),
      updatedAt = now();
    run(
      "INSERT INTO projects VALUES (?,?,?)",
      id,
      JSON.stringify(p),
      updatedAt,
    );
    audit(r, "Project aangemaakt");
    return { id, ...p, updatedAt };
  });
  app.put<{ Params: { id: string } }>("/api/projects/:id", async (r) => {
    writer(r);
    const old = one("SELECT * FROM projects WHERE id=?", r.params.id);
    if (!old) fail(404, "Project niet gevonden");
    const creatorId = JSON.parse(old.data).creatorId || null;
    if (r.account.role !== "superadmin" && creatorId !== r.account.id)
      fail(403, "Je kunt alleen je eigen projecten bewerken");
    if ((r.body as any).updatedAt !== old.updatedAt)
      fail(409, "Dit project is inmiddels gewijzigd. Open het opnieuw.");
    const p = { ...projectSchema.parse(r.body), creatorId };
    if (
      q("SELECT * FROM projects WHERE id<>?", old.id).some(
        (x) => JSON.parse(x.data).name.toLowerCase() === p.name.toLowerCase(),
      )
    )
      fail(409, "Er bestaat al een project met deze naam");
    const updatedAt = new Date(
      Math.max(Date.now(), Date.parse(old.updatedAt) + 1),
    ).toISOString();
    run(
      "UPDATE projects SET data=?,updatedAt=? WHERE id=?",
      JSON.stringify(p),
      updatedAt,
      old.id,
    );
    audit(r, "Project gewijzigd");
    return { id: old.id, ...p, updatedAt };
  });
  app.post("/api/tasks", async (r) => {
    writer(r);
    const t = taskSchema.parse(r.body);
    if (r.account.role !== "superadmin" && t.ownerId !== r.account.id)
      fail(403, "Je kunt alleen taken voor jezelf aanmaken");
    validOwner(t.ownerId);
    validProject(t.projectId);
    const id = randomUUID(),
      updatedAt = now();
    run(
      "INSERT INTO tasks VALUES (?,?,?,?)",
      id,
      t.ownerId,
      JSON.stringify(t),
      updatedAt,
    );
    return { id, ...t, updatedAt };
  });
  app.put<{ Params: { id: string } }>("/api/tasks/:id", async (r) => {
    const old = getTask(r.params.id);
    mayEdit(r, old);
    const body = r.body as any;
    if (body.updatedAt !== old.updatedAt)
      fail(
        409,
        "Deze taak is inmiddels gewijzigd. Vernieuw het overzicht en probeer opnieuw.",
      );
    const t = taskSchema.parse(body);
    if (r.account.role !== "superadmin" && t.ownerId !== r.account.id)
      fail(403, "Alleen de superadmin kan taken toewijzen aan een ander");
    validOwner(t.ownerId);
    validProject(t.projectId);
    const updatedAt = new Date(
      Math.max(Date.now(), Date.parse(old.updatedAt) + 1),
    ).toISOString();
    run(
      "UPDATE tasks SET ownerId=?,data=?,updatedAt=? WHERE id=?",
      t.ownerId,
      JSON.stringify(t),
      updatedAt,
      old.id,
    );
    return { id: old.id, ...t, updatedAt };
  });
  app.delete<{ Params: { id: string } }>("/api/tasks/:id", async (r) => {
    const t = getTask(r.params.id);
    mayEdit(r, t);
    run("DELETE FROM tasks WHERE id=?", t.id);
    audit(r, "Taak verwijderd");
    return { ok: true };
  });
  app.post("/api/notes", async (r) => {
    writer(r);
    const n = noteSchema.parse(r.body),
      id = randomUUID(),
      updatedAt = now();
    run(
      "INSERT INTO notes VALUES (?,?,?,?)",
      id,
      r.account.id,
      JSON.stringify(n),
      updatedAt,
    );
    return { id, ...n, authorId: r.account.id, updatedAt };
  });
  const ownNote = (r: any) => {
    writer(r);
    const n = one("SELECT * FROM notes WHERE id=?", r.params.id);
    if (!n) fail(404, "Notitie niet gevonden");
    if (n.authorId !== r.account.id && r.account.role !== "superadmin")
      fail(403, "Je kunt alleen je eigen notities wijzigen");
    return n;
  };
  app.put<{ Params: { id: string } }>("/api/notes/:id", async (r) => {
    const old = ownNote(r);
    if ((r.body as any).updatedAt !== old.updatedAt)
      fail(409, "De notitie is inmiddels gewijzigd. Open hem opnieuw.");
    const n = noteSchema.parse(r.body);
    run(
      "UPDATE notes SET data=?,updatedAt=? WHERE id=?",
      JSON.stringify(n),
      new Date(
        Math.max(Date.now(), Date.parse(old.updatedAt) + 1),
      ).toISOString(),
      old.id,
    );
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/api/notes/:id", async (r) => {
    const n = ownNote(r);
    run("DELETE FROM notes WHERE id=?", n.id);
    return { ok: true };
  });
  app.post("/api/admin/users", async (r) => {
    admin(r);
    const u = userSchema.parse(r.body);
    if (!u.password) fail(400, "Geef een wachtwoord van minimaal 10 tekens op");
    if (one("SELECT id FROM users WHERE email=?", u.email))
      fail(409, "Dit e-mailadres bestaat al");
    const id = randomUUID();
    run(
      "INSERT INTO users VALUES (?,?,?,?,?,?,?,?)",
      id,
      u.name,
      u.email,
      u.role,
      +u.plannable,
      u.color,
      passwordHash(u.password),
      +u.active,
    );
    audit(r, "Gebruiker aangemaakt");
    return publicUser(one("SELECT * FROM users WHERE id=?", id));
  });
  app.put<{ Params: { id: string } }>("/api/admin/users/:id", async (r) => {
    admin(r);
    const u = userSchema.parse(r.body);
    const old = one("SELECT * FROM users WHERE id=?", r.params.id);
    if (!old) fail(404, "Gebruiker niet gevonden");
    if (old.id === r.account.id && (!u.active || u.role !== "superadmin"))
      fail(400, "Je kunt je eigen beheerrechten niet uitschakelen");
    if (
      (!u.plannable || u.role === "reader") &&
      one("SELECT id FROM tasks WHERE ownerId=? LIMIT 1", old.id)
    )
      fail(
        400,
        "Deze gebruiker heeft taken. Draag ze eerst over voordat je de planning uitschakelt.",
      );
    if (one("SELECT id FROM users WHERE email=? AND id<>?", u.email, old.id))
      fail(409, "Dit e-mailadres bestaat al");
    transaction(() => {
      run(
        "UPDATE users SET name=?,email=?,role=?,plannable=?,color=?,passwordHash=?,active=? WHERE id=?",
        u.name,
        u.email,
        u.role,
        +u.plannable,
        u.color,
        u.password ? passwordHash(u.password) : old.passwordHash,
        +u.active,
        old.id,
      );
      if (u.password || !u.active || u.role !== old.role)
        run("DELETE FROM sessions WHERE userId=?", old.id);
    });
    audit(r, "Gebruiker gewijzigd");
    return { ok: true };
  });
  app.put("/api/admin/settings", async (r) => {
    admin(r);
    const s = settingsSchema.parse(r.body);
    run("UPDATE settings SET data=? WHERE id=1", JSON.stringify(s));
    audit(r, "Instellingen gewijzigd");
    return s;
  });
  app.get("/api/admin/audit", async (r) => {
    admin(r);
    return q(
      "SELECT a.*,u.name actorName FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 100",
    );
  });
  const importSchema = z.object({
    ownerId: z.string(),
    file: z.string().max(14500000),
  });
  app.post("/api/admin/import/preview", async (r) => {
    admin(r);
    const input = importSchema.parse(r.body);
    validOwner(input.ownerId);
    try {
      const result = await parseImport(input.file, input.ownerId);
      return {
        ...result,
        duplicate: !!one(
          "SELECT fingerprint FROM imports WHERE fingerprint=?",
          hash(input.ownerId + input.file),
        ),
      };
    } catch (e: any) {
      fail(400, e.message || "Excelbestand niet leesbaar");
    }
  });
  app.post("/api/admin/import", async (r) => {
    admin(r);
    const input = importSchema.parse(r.body);
    validOwner(input.ownerId);
    let result;
    try {
      result = await parseImport(input.file, input.ownerId);
    } catch (e: any) {
      fail(400, e.message || "Excelbestand niet leesbaar");
    }
    const fingerprint = hash(input.ownerId + input.file);
    let count = 0,
      skipped = 0;
    transaction(() => {
      if (
        one("SELECT fingerprint FROM imports WHERE fingerprint=?", fingerprint)
      )
        fail(409, "Dit bestand is al geïmporteerd voor deze medewerker");
      const signatures = new Set(
        q("SELECT data FROM tasks WHERE ownerId=?", input.ownerId).map((t) =>
          JSON.stringify(taskSchema.parse(JSON.parse(t.data))),
        ),
      );
      for (const row of result.rows) {
        const data = JSON.stringify(row.task);
        if (signatures.has(data)) {
          skipped++;
          continue;
        }
        run(
          "INSERT INTO tasks VALUES (?,?,?,?)",
          randomUUID(),
          input.ownerId,
          data,
          now(),
        );
        signatures.add(data);
        count++;
      }
      run("INSERT INTO imports VALUES (?,?)", fingerprint, now());
      audit(
        r,
        `Excelimport: ${count} taken, ${skipped} duplicaten overgeslagen`,
      );
    });
    return { count, skipped, warnings: result.warnings };
  });
  app.get("/api/admin/backup", async (r, reply) => {
    admin(r);
    audit(r, "Back-up gedownload");
    const data = transaction(() => ({
      format: "YAPlaning",
      version: 2,
      projects: q("SELECT * FROM projects"),
      createdAt: now(),
      users: q("SELECT * FROM users"),
      tasks: q("SELECT * FROM tasks"),
      notes: q("SELECT * FROM notes"),
      settings: JSON.parse(one("SELECT data FROM settings WHERE id=1").data),
      imports: q("SELECT * FROM imports"),
      audit: q("SELECT * FROM audit"),
    }));
    reply.header(
      "Content-Disposition",
      `attachment; filename="YAPlaning-backup-${now().slice(0, 10)}.json"`,
    );
    return data;
  });
  const backupSchema = z.object({
    format: z.literal("YAPlaning"),
    version: z.union([z.literal(1), z.literal(2)]),
    projects: z
      .array(
        z.object({
          id: z.string().min(1),
          data: z.string(),
          updatedAt: z.iso.datetime(),
        }),
      )
      .max(10000)
      .optional(),
    users: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1).max(100),
          email: z.email(),
          role: z.enum(["superadmin", "member", "reader"]),
          plannable: z.number().int().min(0).max(1),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          passwordHash: z.string().regex(/^[a-f0-9]{32}:[a-f0-9]{128}$/),
          active: z.number().int().min(0).max(1),
        }),
      )
      .min(1)
      .max(10000),
    tasks: z
      .array(
        z.object({
          id: z.string().min(1),
          ownerId: z.string().min(1),
          data: z.string(),
          updatedAt: z.iso.datetime(),
        }),
      )
      .max(100000),
    notes: z
      .array(
        z.object({
          id: z.string().min(1),
          authorId: z.string().min(1),
          data: z.string(),
          updatedAt: z.iso.datetime(),
        }),
      )
      .max(100000),
    settings: settingsSchema,
    imports: z
      .array(
        z.object({
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          createdAt: z.iso.datetime(),
        }),
      )
      .default([]),
    audit: z
      .array(
        z.object({
          actor: z.string(),
          action: z.string().max(500),
          createdAt: z.iso.datetime(),
        }),
      )
      .default([]),
  });
  app.post("/api/admin/restore", async (r, reply) => {
    admin(r);
    const input = z
      .object({
        confirmation: z.literal("HERSTELLEN"),
        password: z.string().max(200),
        backup: z.unknown(),
      })
      .parse(r.body);
    if (!checkPassword(input.password, r.account.passwordHash))
      fail(403, "Je huidige wachtwoord is onjuist");
    const b = backupSchema.parse(input.backup);
    if (b.version === 2 && !b.projects)
      fail(400, "Projecten ontbreken in deze back-up");
    const projects = (b.projects || []).map((p) => ({
      ...p,
      data: JSON.stringify(projectSchema.parse(JSON.parse(p.data))),
    }));
    const projectIds = new Set(projects.map((p) => p.id));
    if (projectIds.size !== projects.length)
      fail(400, "Dubbele projecten in back-up");
    const ids = new Set(b.users.map((u) => u.id));
    if (
      ids.size !== b.users.length ||
      new Set(b.users.map((u) => u.email.toLowerCase())).size !== b.users.length
    )
      fail(400, "Dubbele gebruikers in back-up");
    if (!b.users.some((u) => u.active && u.role === "superadmin"))
      fail(400, "Back-up mist een actieve superadmin");
    if (b.users.some((u) => u.role === "reader" && u.plannable))
      fail(400, "Ongeldige lezer in back-up");
    if (
      projects.some((p) => {
        const id = JSON.parse(p.data).creatorId;
        return id && !ids.has(id);
      })
    )
      fail(400, "Ongeldige projecteigenaar in back-up");
    const tasks = b.tasks.map((t) => {
      const data = taskSchema.parse(JSON.parse(t.data));
      if (data.projectId && !projectIds.has(data.projectId))
        fail(400, "Ongeldig project in back-up");
      if (!ids.has(t.ownerId) || data.ownerId !== t.ownerId)
        fail(400, "Ongeldige taakeigenaar in back-up");
      return { ...t, data: JSON.stringify(data) };
    });
    const notes = b.notes.map((n) => {
      if (!ids.has(n.authorId)) fail(400, "Ongeldige notitieauteur");
      return {
        ...n,
        data: JSON.stringify(noteSchema.parse(JSON.parse(n.data))),
      };
    });
    if (
      new Set(tasks.map((t) => t.id)).size !== tasks.length ||
      new Set(notes.map((n) => n.id)).size !== notes.length
    )
      fail(400, "Dubbele records in back-up");
    transaction(() => {
      db.exec(
        "DELETE FROM sessions; DELETE FROM tasks; DELETE FROM projects; DELETE FROM notes; DELETE FROM users; DELETE FROM imports; DELETE FROM audit;",
      );
      for (const u of b.users)
        run(
          "INSERT INTO users VALUES (?,?,?,?,?,?,?,?)",
          u.id,
          u.name,
          u.email.toLowerCase(),
          u.role,
          u.plannable,
          u.color,
          u.passwordHash,
          u.active,
        );
      for (const p of projects)
        run("INSERT INTO projects VALUES (?,?,?)", p.id, p.data, p.updatedAt);
      for (const t of tasks)
        run(
          "INSERT INTO tasks VALUES (?,?,?,?)",
          t.id,
          t.ownerId,
          t.data,
          t.updatedAt,
        );
      for (const n of notes)
        run(
          "INSERT INTO notes VALUES (?,?,?,?)",
          n.id,
          n.authorId,
          n.data,
          n.updatedAt,
        );
      for (const i of b.imports)
        run(
          "INSERT OR IGNORE INTO imports VALUES (?,?)",
          i.fingerprint,
          i.createdAt,
        );
      for (const a of b.audit)
        run(
          "INSERT INTO audit(actor,action,createdAt) VALUES (?,?,?)",
          a.actor,
          a.action,
          a.createdAt,
        );
      run("UPDATE settings SET data=? WHERE id=1", JSON.stringify(b.settings));
      run(
        "INSERT INTO audit(actor,action,createdAt) VALUES (?,?,?)",
        "restore",
        "Back-up hersteld",
        now(),
      );
    });
    reply.clearCookie("yap_session", { path: "/" });
    return { ok: true };
  });
  app.post("/api/admin/clear", async (r) => {
    admin(r);
    const input = z
      .object({
        confirmation: z.literal("LEEGMAKEN"),
        password: z.string().max(200),
      })
      .parse(r.body);
    if (!checkPassword(input.password, r.account.passwordHash))
      fail(403, "Je wachtwoord is onjuist");
    transaction(() => {
      db.exec(
        "DELETE FROM tasks; DELETE FROM projects; DELETE FROM notes; DELETE FROM imports;",
      );
      audit(
        r,
        "Alle projecten, taken, notities en importhistorie gewist; accounts en instellingen behouden",
      );
    });
    return { ok: true };
  });
  const dist = resolve("dist");
  if (options.serveStatic !== false && existsSync(dist)) {
    await app.register(statics, { root: dist });
    app.setNotFoundHandler((r, reply) =>
      r.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Niet gevonden" })
        : reply.sendFile("index.html"),
    );
  }
  app.addHook("onClose", async () => db.close());
  return app;
}

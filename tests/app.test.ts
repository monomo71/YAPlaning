import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { createApp } from "../server/app.ts";
import { parseImport } from "../server/import.ts";

test("Accountrechten, conflicten, archief, import en back-up/herstel", async () => {
  const app = await createApp({ dbPath: ":memory:", serveStatic: false });
  const req = async (
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
  ) => {
    const r = await app.inject({
      url: "/api" + path,
      method: method as any,
      headers: { "x-yap-request": "1", ...(token ? { cookie: token } : {}) },
      payload: body as any,
    });
    return {
      status: r.statusCode,
      data: r.json(),
      cookie: String(r.headers["set-cookie"] || "").split(";")[0],
    };
  };
  try {
    assert.equal((await req("/data")).status, 401);
    const admin = await req("/setup", "POST", {
      name: "Beheer",
      email: "admin@example.test",
      password: "VeiligWachtwoord123!",
    });
    assert.equal(admin.status, 200);
    const cookie = admin.cookie;
    assert.equal(
      (
        await req("/setup", "POST", {
          name: "Ander",
          email: "ander@example.test",
          password: "VeiligWachtwoord123!",
        })
      ).status,
      409,
    );
    const a = await req(
      "/admin/users",
      "POST",
      {
        name: "Thijs",
        email: "thijs@example.test",
        password: "VeiligWachtwoord123!",
        role: "member",
        plannable: true,
        color: "#728eb0",
      },
      cookie,
    );
    const b = await req(
      "/admin/users",
      "POST",
      {
        name: "Roy",
        email: "roy@example.test",
        password: "VeiligWachtwoord123!",
        role: "member",
        plannable: true,
        color: "#c4a874",
      },
      cookie,
    );
    const reader = await req(
      "/admin/users",
      "POST",
      {
        name: "Lezer",
        email: "reader@example.test",
        password: "VeiligWachtwoord123!",
        role: "reader",
        plannable: false,
        color: "#999999",
      },
      cookie,
    );
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(reader.status, 200);
    const memberCookie = (
      await req("/login", "POST", {
        email: a.data.email,
        password: "VeiligWachtwoord123!",
      })
    ).cookie;
    const readerCookie = (
      await req("/login", "POST", {
        email: reader.data.email,
        password: "VeiligWachtwoord123!",
      })
    ).cookie;
    assert.equal(
      (await req("/admin/backup", "GET", undefined, memberCookie)).status,
      403,
    );
    assert.ok(
      (await req("/data", "GET", undefined, readerCookie)).data.users.every(
        (u: any) => !("passwordHash" in u),
      ),
    );
    const other = await req(
      "/tasks",
      "POST",
      { title: "Taak van Roy", ownerId: b.data.id },
      cookie,
    );
    assert.equal(
      (
        await req(
          "/tasks/" + other.data.id,
          "PUT",
          { ...other.data, title: "Niet toegestaan" },
          memberCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await req("/tasks/" + other.data.id, "DELETE", undefined, memberCookie))
        .status,
      403,
    );
    assert.equal(
      (await req("/tasks/" + other.data.id, "DELETE", undefined, cookie))
        .status,
      200,
    );
    assert.equal(
      (
        await req(
          "/notes",
          "POST",
          { title: "Niet toegestaan", body: "", shared: true },
          readerCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "/tasks",
          "POST",
          { title: "Verboden", ownerId: b.data.id },
          memberCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "/tasks",
          "POST",
          { title: "Verboden", ownerId: a.data.id },
          readerCookie,
        )
      ).status,
      403,
    );
    const task = await req(
      "/tasks",
      "POST",
      { title: "Eigen taak", ownerId: a.data.id, priority: 1, hours: 1.5 },
      memberCookie,
    );
    assert.equal(task.status, 200);
    assert.equal(
      (
        await req(
          "/tasks/" + task.data.id,
          "PUT",
          { ...task.data, ownerId: b.data.id },
          memberCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "/tasks/" + task.data.id,
          "PUT",
          { ...task.data, archived: true },
          memberCookie,
        )
      ).status,
      400,
    );
    const changed = await req(
      "/tasks/" + task.data.id,
      "PUT",
      { ...task.data, status: "Afgewerkt", archived: true },
      memberCookie,
    );
    assert.equal(changed.status, 200);
    assert.equal(
      (
        await req(
          "/tasks/" + task.data.id,
          "PUT",
          { ...task.data, title: "Verouderd" },
          memberCookie,
        )
      ).status,
      409,
    );
    const restored = await req(
      "/tasks/" + task.data.id,
      "PUT",
      { ...changed.data, archived: false },
      cookie,
    );
    assert.equal(restored.status, 200);
    assert.equal(
      (await req("/tasks/" + task.data.id, "DELETE", undefined, readerCookie))
        .status,
      403,
    );
    assert.equal(
      (
        await req(
          "/tasks",
          "POST",
          {
            title: "Ongeldige datum",
            ownerId: a.data.id,
            plannedDate: "2026-02-30",
          },
          memberCookie,
        )
      ).status,
      400,
    );
    const privateNote = await req(
      "/notes",
      "POST",
      { title: "Privé", body: "Geheim", shared: false },
      memberCookie,
    );
    assert.equal(privateNote.status, 200);
    assert.equal(
      (await req("/data", "GET", undefined, readerCookie)).data.notes.length,
      0,
    );
    assert.equal(
      (await req("/data", "GET", undefined, cookie)).data.notes.length,
      0,
    );
    assert.equal(
      (
        await req(
          "/notes/" + privateNote.data.id,
          "PUT",
          {
            title: "Overschreven",
            body: "",
            shared: true,
            updatedAt: privateNote.data.updatedAt,
          },
          readerCookie,
        )
      ).status,
      403,
    );
    const publicNote = await req(
      "/notes",
      "POST",
      { title: "Team", body: "Leesbaar", shared: true },
      memberCookie,
    );
    assert.equal(publicNote.status, 200);
    assert.equal(
      (await req("/data", "GET", undefined, readerCookie)).data.notes.length,
      1,
    );
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Takenlijst");
    ws.getRow(2).values = [
      "Wie?",
      "Omschrijving",
      "Soort",
      "Status",
      "Prioriteit",
      "Opdrachtgever",
      "Urenschatting",
      "Deadline",
      "Bron",
    ];
    ws.getRow(3).values = [
      "Thijs",
      "Exceltaak",
      "Lange termijn",
      "Completed",
      2,
      "Rutger",
      0.5,
      new Date("2026-11-04T12:00:00Z"),
      "Bronnotitie",
    ];
    const file = Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
    const preview = await req(
      "/admin/import/preview",
      "POST",
      { ownerId: a.data.id, file },
      cookie,
    );
    assert.equal(preview.status, 200);
    assert.equal(preview.data.rows[0].task.deadline, "2026-11-04");
    assert.equal(preview.data.rows[0].task.notes, "Bronnotitie");
    assert.equal(preview.data.rows[0].task.status, "Afgewerkt");
    const imported = await req(
      "/admin/import",
      "POST",
      { ownerId: a.data.id, file },
      cookie,
    );
    assert.equal(imported.data.count, 1);
    assert.equal(
      (await req("/admin/import", "POST", { ownerId: a.data.id, file }, cookie))
        .status,
      409,
    );
    assert.equal(
      (
        await req(
          "/admin/clear",
          "POST",
          { confirmation: "LEEGMAKEN", password: "fout" },
          cookie,
        )
      ).status,
      403,
    );
    const backup = await req("/admin/backup", "GET", undefined, cookie);
    assert.equal(backup.data.tasks.length, 2);
    assert.equal(backup.data.notes.length, 2);
    assert.equal(backup.data.format, "YAPlaning");
    assert.equal(
      (
        await req(
          "/admin/restore",
          "POST",
          {
            confirmation: "HERSTELLEN",
            password: "VeiligWachtwoord123!",
            backup: { ...backup.data, users: [] },
          },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await req("/data", "GET", undefined, cookie)).data.tasks.length,
      2,
    );
    const cleared = await req(
      "/admin/clear",
      "POST",
      { confirmation: "LEEGMAKEN", password: "VeiligWachtwoord123!" },
      cookie,
    );
    assert.equal(cleared.status, 200);
    assert.equal(
      (await req("/data", "GET", undefined, cookie)).data.tasks.length,
      0,
    );
    assert.equal(
      (await req("/data", "GET", undefined, cookie)).data.users.length,
      4,
    );
    const restore = await req(
      "/admin/restore",
      "POST",
      {
        confirmation: "HERSTELLEN",
        password: "VeiligWachtwoord123!",
        backup: backup.data,
      },
      cookie,
    );
    assert.equal(restore.status, 200);
    assert.equal((await req("/data", "GET", undefined, cookie)).status, 401);
    const newCookie = (
      await req("/login", "POST", {
        email: "admin@example.test",
        password: "VeiligWachtwoord123!",
      })
    ).cookie;
    const data = (await req("/data", "GET", undefined, newCookie)).data;
    assert.equal(data.tasks.length, 2);
    assert.equal(data.notes.length, 1);
    assert.equal(data.users.length, 4);
    const cross = await app.inject({
      url: "/api/tasks",
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "x-yap-request": "1",
        cookie: newCookie,
      },
      payload: {},
    });
    assert.equal(cross.statusCode, 403);
    const noHeader = await app.inject({
      url: "/api/logout",
      method: "POST",
      headers: { cookie: newCookie },
    });
    assert.equal(noHeader.statusCode, 403);
    assert.equal(
      (
        await req(
          "/admin/users/" + admin.data.id,
          "PUT",
          { ...admin.data, role: "reader", plannable: false },
          newCookie,
        )
      ).status,
      400,
    );
  } finally {
    await app.close();
  }
});

test("Excelarchief en vrije tekstdeadlines blijven correct", async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Afgerond");
  sheet.getRow(2).values = [
    "Wie?",
    "Omschrijving",
    "Soort",
    "Status",
    "Prioriteit",
    "Opdrachtgever",
    "Urenschatting",
    "Deadline",
    "Bron",
  ];
  sheet.getRow(3).values = [
    "Thijs",
    "Klaar",
    "Korte termijn",
    "Completed",
    1,
    "Naam",
    2,
    "Geen deadline",
    "Notitie",
  ];
  const b = Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
  const result = await parseImport(b, "thijs");
  assert.equal(result.rows[0].task.archived, true);
  assert.equal(result.rows[0].task.deadline, null);
  assert.equal(result.warnings.length, 0);
});

test("Productiepagina en statische bestanden blijven binnen de buildmap", async () => {
  const app = await createApp({ dbPath: ":memory:" });
  try {
    const page = await app.inject({ url: "/" });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /YAPlaning/);
    assert.equal(page.headers["x-frame-options"], "DENY");
    for (const url of [
      "/../package.json",
      "/%2e%2e/package.json",
      "/.env",
      "/data/yaplaning.sqlite",
    ]) {
      const r = await app.inject({ url });
      assert.ok(!r.body.includes("passwordHash"));
      assert.ok(!r.body.includes('"dependencies"'));
      assert.ok(!r.body.includes("SQLite format"));
    }
    assert.equal((await app.inject({ url: "/api/data" })).statusCode, 401);
  } finally {
    await app.close();
  }
});

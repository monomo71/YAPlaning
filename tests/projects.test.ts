import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.ts";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Projecten met meerdere eigenaren, rechten, kleuren en back-up/herstel", async () => {
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
    const password = "Project-test123!";
    const a = await req("/setup", "POST", {
      name: "Admin",
      email: "admin@example.test",
      password,
    });
    const c = a.cookie;
    const member = await req(
      "/admin/users",
      "POST",
      {
        name: "Thijs",
        email: "thijs@example.test",
        password,
        role: "member",
        plannable: true,
        color: "#789abc",
      },
      c,
    );
    const reader = await req(
      "/admin/users",
      "POST",
      {
        name: "Lezer",
        email: "lezer@example.test",
        password,
        role: "reader",
        plannable: false,
        color: "#999999",
      },
      c,
    );
    const m = (
        await req("/login", "POST", { email: member.data.email, password })
      ).cookie,
      read = (
        await req("/login", "POST", { email: reader.data.email, password })
      ).cookie;
    const ownProject = await req(
      "/projects",
      "POST",
      {
        name: "Eigen project van Thijs",
        color: "#123456",
        creatorId: a.data.id,
      },
      m,
    );
    assert.equal(ownProject.status, 200);
    assert.equal(ownProject.data.creatorId, member.data.id);
    const ownEdit = await req(
      "/projects/" + ownProject.data.id,
      "PUT",
      {
        ...ownProject.data,
        name: "Bijgewerkt eigen project",
        creatorId: a.data.id,
      },
      m,
    );
    assert.equal(ownEdit.status, 200);
    assert.equal(ownEdit.data.creatorId, member.data.id);
    assert.equal(
      (
        await req(
          "/projects",
          "POST",
          { name: "Verboden", color: "#123456" },
          read,
        )
      ).status,
      403,
    );
    assert.equal(
      (await req("/projects", "POST", { name: "", color: "rood" }, c)).status,
      400,
    );
    const project = await req(
      "/projects",
      "POST",
      {
        name: "Website vernieuwen",
        description: "Taken van het hele team",
        color: "#526fa2",
      },
      c,
    );
    assert.equal(project.status, 200);
    assert.equal(
      (
        await req(
          "/projects",
          "POST",
          { name: "WEBSITE VERNIEUWEN", color: "#123456" },
          c,
        )
      ).status,
      409,
    );
    const task1 = await req(
      "/tasks",
      "POST",
      { title: "Ontwerp", ownerId: a.data.id, projectId: project.data.id },
      c,
    );
    const task2 = await req(
      "/tasks",
      "POST",
      { title: "Content", ownerId: member.data.id, projectId: project.data.id },
      m,
    );
    assert.equal(task1.status, 200);
    assert.equal(task2.status, 200);
    assert.equal(
      (
        await req(
          "/tasks",
          "POST",
          {
            title: "Fout project",
            ownerId: member.data.id,
            projectId: "missing",
          },
          m,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await req(
          "/tasks/" + task1.data.id,
          "PUT",
          { ...task1.data, title: "Andermans taak" },
          m,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "/tasks/" + task2.data.id,
          "PUT",
          { ...task2.data, projectId: "missing" },
          m,
        )
      ).status,
      400,
    );
    const d = (await req("/data", "GET", undefined, read)).data;
    assert.equal(d.projects.length, 2);
    assert.equal(
      d.tasks.filter((t: any) => t.projectId === project.data.id).length,
      2,
    );
    assert.equal(
      (
        await req(
          "/projects/" + project.data.id,
          "PUT",
          { ...project.data, color: "#ff0000" },
          m,
        )
      ).status,
      403,
    );
    const updated = await req(
      "/projects/" + project.data.id,
      "PUT",
      { ...project.data, color: "#c48765" },
      c,
    );
    assert.equal(updated.status, 200);
    assert.equal(
      (await req("/projects/" + project.data.id, "PUT", project.data, c))
        .status,
      409,
    );
    const backup = (await req("/admin/backup", "GET", undefined, c)).data;
    assert.equal(backup.version, 2);
    assert.equal(backup.projects.length, 2);
    const invalid = structuredClone(backup);
    invalid.projects = [];
    assert.equal(
      (
        await req(
          "/admin/restore",
          "POST",
          { backup: invalid, password, confirmation: "HERSTELLEN" },
          c,
        )
      ).status,
      400,
    );
    assert.equal(
      (await req("/data", "GET", undefined, c)).data.projects.length,
      2,
    );
    assert.equal(
      (
        await req(
          "/admin/clear",
          "POST",
          { confirmation: "LEEGMAKEN", password },
          c,
        )
      ).status,
      200,
    );
    assert.equal(
      (await req("/data", "GET", undefined, c)).data.projects.length,
      0,
    );
    assert.equal(
      (
        await req(
          "/admin/restore",
          "POST",
          { confirmation: "HERSTELLEN", password, backup },
          c,
        )
      ).status,
      200,
    );
    const c2 = (await req("/login", "POST", { email: a.data.email, password }))
      .cookie;
    const restored = (await req("/data", "GET", undefined, c2)).data;
    assert.equal(
      restored.projects.find((p: any) => p.id === project.data.id).color,
      "#c48765",
    );
    assert.equal(restored.tasks[1].projectId, project.data.id);
    const legacy = { ...backup, version: 1 };
    delete legacy.projects;
    legacy.tasks = legacy.tasks.map((t: any) => {
      const data = JSON.parse(t.data);
      delete data.projectId;
      return { ...t, data: JSON.stringify(data) };
    });
    assert.equal(
      (
        await req(
          "/admin/restore",
          "POST",
          { confirmation: "HERSTELLEN", password, backup: legacy },
          c2,
        )
      ).status,
      200,
    );
    const c3 = (await req("/login", "POST", { email: a.data.email, password }))
      .cookie;
    const old = (await req("/data", "GET", undefined, c3)).data;
    assert.equal(old.projects.length, 0);
    assert.equal(old.tasks.length, 2);
    assert.ok(old.tasks.every((t: any) => t.projectId === null));
  } finally {
    await app.close();
  }
});

test("Bestaande database wordt uitgebreid zonder taken te wijzigen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yaplaning-upgrade-")),
    dbPath = join(dir, "planner.sqlite");
  let app = await createApp({ dbPath, serveStatic: false });
  try {
    const a = await app.inject({
      url: "/api/setup",
      method: "POST",
      headers: { "x-yap-request": "1" },
      payload: {
        name: "Admin",
        email: "upgrade@example.test",
        password: "Upgrade-test123!",
      },
    });
    const cookie = String(a.headers["set-cookie"]).split(";")[0];
    const t = await app.inject({
      url: "/api/tasks",
      method: "POST",
      headers: { "x-yap-request": "1", cookie },
      payload: { title: "Bestaande taak", ownerId: a.json().id },
    });
    assert.equal(t.statusCode, 200);
    await app.close();
    const db = new DatabaseSync(dbPath);
    const row = db.prepare("SELECT * FROM tasks").get() as any;
    const task = JSON.parse(row.data);
    delete task.projectId;
    db.prepare("UPDATE tasks SET data=?").run(JSON.stringify(task));
    db.exec("DROP TABLE projects");
    db.close();
    app = await createApp({ dbPath, serveStatic: false });
    const r = await app.inject({ url: "/api/data", headers: { cookie } });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().tasks[0].title, "Bestaande taak");
    assert.equal(r.json().tasks[0].projectId, null);
    assert.equal(r.json().projects.length, 0);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

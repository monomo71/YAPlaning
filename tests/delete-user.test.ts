import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.ts";
async function fixture() {
  const app = await createApp({ dbPath: ":memory:", serveStatic: false });
  const password = "Delete-test123!";
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
  const admin = await req("/setup", "POST", {
    name: "Admin",
    email: "admin@example.test",
    password,
  });
  const create = async (name: string, role = "member") => {
    const u = await req(
      "/admin/users",
      "POST",
      {
        name,
        email: name.toLowerCase() + "@example.test",
        role,
        password,
        plannable: role !== "reader",
        color: "#777799",
      },
      admin.cookie,
    );
    const cookie = (
      await req("/login", "POST", { email: u.data.email, password })
    ).cookie;
    return { ...u.data, cookie };
  };
  return { app, password, req, admin, create };
}

test("Gebruiker verwijderen wist eigen data en draagt gedeelde projecten over", async () => {
  const { app, password, req, admin, create } = await fixture();
  try {
    const victim = await create("Thijs"),
      rik = await create("Rik"),
      zoe = await create("Zoe"),
      inactive = await create("Aart"),
      reader = await create("Lezer", "reader");
    const project = async (name: string, owner: any) => {
      const r = await req(
        "/projects",
        "POST",
        { name, color: "#778899" },
        owner.cookie,
      );
      assert.equal(r.status, 200);
      return r.data;
    };
    const task = async (
      title: string,
      owner: any,
      projectId: string | null,
      archived = false,
    ) => {
      const r = await req(
        "/tasks",
        "POST",
        {
          title,
          ownerId: owner.id,
          projectId,
          status: archived ? "Afgewerkt" : "Open",
          archived,
        },
        admin.cookie,
      );
      assert.equal(r.status, 200);
      return r.data;
    };
    const alone = await project("Eigen project", victim),
      empty = await project("Leeg eigen project", victim),
      shared = await project("Samen", victim),
      external = await project("Van Rik", rik);
    await task("Eigen werk", victim, alone.id);
    await task("Eigen werk gedeeld", victim, shared.id);
    await task("Eigen werk elders", victim, external.id);
    await task("Eigen archief", victim, null, true);
    const keepRik = await task("Bewaar archief van Rik", rik, shared.id, true);
    await task("Bewaar Zoe", zoe, shared.id);
    await task("Bewaar Aart", inactive, shared.id);
    assert.equal(
      (
        await req(
          "/admin/users/" + inactive.id,
          "PUT",
          { ...inactive, password: undefined, active: false },
          admin.cookie,
        )
      ).status,
      200,
    );
    await req(
      "/notes",
      "POST",
      { title: "Eigen notitie", body: "Privé", shared: false },
      victim.cookie,
    );
    await req(
      "/notes",
      "POST",
      { title: "Notitie Rik", body: "Blijft", shared: true },
      rik.cookie,
    );
    const run = await req("/games/runner/start", "POST", {}, victim.cookie);
    assert.equal(
      (
        await req(
          "/games/runner/finish",
          "POST",
          { runId: run.data.runId, score: 0 },
          victim.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await req(
          "/admin/users/" + victim.id + "/deletion-preview",
          "GET",
          undefined,
          rik.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "/admin/users/" + victim.id + "/delete",
          "POST",
          {},
          reader.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "/admin/users/" + admin.data.id + "/deletion-preview",
          "GET",
          undefined,
          admin.cookie,
        )
      ).status,
      400,
    );
    const preview = await req(
      "/admin/users/" + victim.id + "/deletion-preview",
      "GET",
      undefined,
      admin.cookie,
    );
    assert.equal(preview.status, 200);
    assert.equal(preview.data.tasks, 4);
    assert.equal(preview.data.notes, 1);
    assert.equal(preview.data.scores, 1);
    assert.equal(
      preview.data.projects.find((p: any) => p.id === shared.id).successor.id,
      rik.id,
    );
    assert.equal(
      preview.data.projects.filter((p: any) => p.action === "delete").length,
      2,
    );
    const body = {
      password,
      confirmation: "VERWIJDEREN",
      token: preview.data.token,
    };
    assert.equal(
      (
        await req(
          "/admin/users/" + victim.id + "/delete",
          "POST",
          { ...body, password: "fout" },
          admin.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "/admin/users/" + victim.id + "/delete",
          "POST",
          { ...body, confirmation: "ja" },
          admin.cookie,
        )
      ).status,
      400,
    );
    const deleted = await req(
      "/admin/users/" + victim.id + "/delete",
      "POST",
      body,
      admin.cookie,
    );
    assert.equal(deleted.status, 200);
    assert.equal(deleted.data.deletedTasks, 4);
    assert.equal(deleted.data.deletedProjects, 2);
    assert.equal(deleted.data.transferredProjects, 1);
    const data = (await req("/data", "GET", undefined, admin.cookie)).data;
    assert.ok(!data.users.some((u: any) => u.id === victim.id));
    assert.ok(data.tasks.every((t: any) => t.ownerId !== victim.id));
    assert.ok(data.tasks.some((t: any) => t.id === keepRik.id && t.archived));
    assert.ok(
      !data.projects.some((p: any) => p.id === alone.id || p.id === empty.id),
    );
    assert.equal(
      data.projects.find((p: any) => p.id === shared.id).creatorId,
      rik.id,
    );
    assert.equal(
      data.projects.find((p: any) => p.id === external.id).creatorId,
      rik.id,
    );
    assert.equal(data.notes[0].title, "Notitie Rik");
    assert.equal(
      (await req("/data", "GET", undefined, victim.cookie)).status,
      401,
    );
    assert.equal(
      (await req("/games/runner/leaderboard", "GET", undefined, admin.cookie))
        .data.top.length,
      0,
    );
    const sharedNow = data.projects.find((p: any) => p.id === shared.id);
    assert.equal(
      (
        await req(
          "/projects/" + shared.id,
          "PUT",
          { ...sharedNow, name: "Rik beheert dit nu" },
          rik.cookie,
        )
      ).status,
      200,
    );
    const backup = (await req("/admin/backup", "GET", undefined, admin.cookie))
      .data;
    assert.equal(
      (
        await req(
          "/admin/restore",
          "POST",
          { password, confirmation: "HERSTELLEN", backup },
          admin.cookie,
        )
      ).status,
      200,
    );
  } finally {
    await app.close();
  }
});

test("Verouderd verwijdervoorbeeld doet geen gedeeltelijke verwijdering", async () => {
  const { app, password, req, admin, create } = await fixture();
  try {
    const victim = await create("Thijs"),
      rik = await create("Rik");
    const p = (
      await req(
        "/projects",
        "POST",
        { name: "Project", color: "#777799" },
        victim.cookie,
      )
    ).data;
    const preview = (
      await req(
        "/admin/users/" + victim.id + "/deletion-preview",
        "GET",
        undefined,
        admin.cookie,
      )
    ).data;
    await req(
      "/tasks",
      "POST",
      { title: "Nieuw werk van Rik", ownerId: rik.id, projectId: p.id },
      rik.cookie,
    );
    const result = await req(
      "/admin/users/" + victim.id + "/delete",
      "POST",
      { password, confirmation: "VERWIJDEREN", token: preview.token },
      admin.cookie,
    );
    assert.equal(result.status, 409);
    assert.ok(
      (await req("/data", "GET", undefined, admin.cookie)).data.users.some(
        (u: any) => u.id === victim.id,
      ),
    );
    const fresh = (
      await req(
        "/admin/users/" + victim.id + "/deletion-preview",
        "GET",
        undefined,
        admin.cookie,
      )
    ).data;
    assert.equal(fresh.projects[0].successor.id, rik.id);
    assert.equal(
      (
        await req(
          "/admin/users/" + victim.id + "/delete",
          "POST",
          { password, confirmation: "VERWIJDEREN", token: fresh.token },
          admin.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await req("/data", "GET", undefined, admin.cookie)).data.projects[0]
        .creatorId,
      rik.id,
    );
  } finally {
    await app.close();
  }
});

import { useState, type ReactNode } from "react";
import {
  FolderKanban,
  Plus,
  ArrowLeft,
  ArrowUpRight,
  Users,
  Clock,
  Pencil,
  CheckCircle2,
} from "lucide-react";
import { api, type Data, type Task, type Project, initials } from "./types";

export function Projects({
  data,
  selected,
  onSelect,
  search,
  onDone,
  onNew,
  renderTasks,
}: {
  data: Data;
  selected: string;
  onSelect: (id: string) => void;
  search: string;
  onDone: () => Promise<void>;
  onNew?: (t: Partial<Task>) => void;
  renderTasks: (tasks: Task[]) => ReactNode;
}) {
  const [editing, setEditing] = useState<Partial<Project> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showArchive, setShowArchive] = useState(false);
  const admin = data.user.role === "superadmin",
    canCreate = data.user.role !== "reader",
    project = data.projects.find((p) => p.id === selected);
  const summary = (p: Project) => {
    const tasks = data.tasks.filter((t) => t.projectId === p.id),
      done = tasks.filter((t) => t.status === "Afgewerkt").length;
    return {
      tasks,
      done,
      percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
      people: data.users.filter((u) => tasks.some((t) => t.ownerId === u.id)),
      hours: tasks
        .filter((t) => t.status !== "Afgewerkt")
        .reduce((n, t) => n + (t.hours || 0), 0),
    };
  };
  const projects = data.projects
    .filter(
      (p) =>
        (selected === "all" || p.id === selected) &&
        (!search ||
          [
            p.name,
            p.description,
            ...data.tasks
              .filter((t) => t.projectId === p.id)
              .map((t) => t.title),
          ].some((s) => s.toLowerCase().includes(search.toLowerCase()))),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  return (
    <div className="projects-page">
      <div className="project-toolbar">
        <div>
          <h2>{project ? project.name : "Projecten van het team"}</h2>
          <p className="muted">
            {project
              ? "Taken van alle betrokken medewerkers, op één plek."
              : "Voortgang inclusief afgewerkte en gearchiveerde taken."}
          </p>
        </div>
        <div className="project-toolbar-actions">
          {selected !== "all" && (
            <button onClick={() => onSelect("all")}>
              <ArrowLeft size={15} />
              Alle projecten
            </button>
          )}
          {canCreate && (
            <button
              className="primary"
              onClick={() => {
                setEditing({ name: "", description: "", color: "#7a80cf" });
                setError("");
              }}
            >
              <Plus size={16} />
              Nieuw project
            </button>
          )}
        </div>
      </div>
      {editing && (
        <form
          className="panel project-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const saved = await api(
                "/projects" + (editing.id ? "/" + editing.id : ""),
                editing.id ? "PUT" : "POST",
                editing,
              );
              setEditing(null);
              await onDone();
              onSelect(saved.id);
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{editing.id ? "Project bewerken" : "Een nieuw project"}</h2>
          <div className="project-editor-fields">
            <label>
              Projectnaam
              <input
                required
                maxLength={120}
                value={editing.name || ""}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              Projectkleur
              <input
                type="color"
                value={editing.color}
                onChange={(e) =>
                  setEditing({ ...editing, color: e.target.value })
                }
              />
            </label>
          </div>
          <div
            className="project-palette"
            role="group"
            aria-label="Projectkleuren"
          >
            {[
              "#7a80cf",
              "#57a08c",
              "#c99165",
              "#c77690",
              "#668fb6",
              "#8c9a5e",
              "#9b78b7",
              "#67758d",
            ].map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Kleur ${color}`}
                aria-pressed={editing.color === color}
                style={{ background: color }}
                onClick={() => setEditing({ ...editing, color })}
              />
            ))}
          </div>
          <label>
            Omschrijving
            <textarea
              rows={3}
              maxLength={5000}
              value={editing.description || ""}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="project-toolbar-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Annuleren
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Opslaan…" : "Project opslaan"}
            </button>
          </div>
        </form>
      )}
      <div className="project-grid">
        {projects.map((p) => {
          const s = summary(p);
          return (
            <article
              className="panel project-card"
              key={p.id}
              style={{ borderTopColor: p.color }}
            >
              <div className="project-card-top">
                <span
                  className="project-symbol"
                  style={{ color: p.color, background: p.color + "15" }}
                >
                  <FolderKanban size={22} />
                </span>
                {(admin || p.creatorId === data.user.id) && (
                  <button
                    className="icon"
                    title={`Project ${p.name} bewerken`}
                    onClick={() => {
                      setEditing(p);
                      setError("");
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
              <button className="project-open" onClick={() => onSelect(p.id)}>
                <h2>{p.name}</h2>
                <ArrowUpRight size={17} />
              </button>
              <p className="project-description">
                {p.description ||
                  "Een gezamenlijke plek voor de taken van dit project."}
              </p>
              <div className="project-progress-text">
                <span>
                  {s.done} van {s.tasks.length} taken afgewerkt
                </span>
                <strong>{s.percent}%</strong>
              </div>
              <progress
                value={s.done}
                max={s.tasks.length || 1}
                style={{ accentColor: p.color, color: p.color }}
                aria-label={`Voortgang ${p.name}`}
              />
              <div className="project-card-bottom">
                <div className="project-members">
                  {s.people.map((u) => (
                    <span
                      className="avatar"
                      key={u.id}
                      title={u.name}
                      style={{
                        color: u.color,
                        background: u.color + "18",
                        width: 28,
                        height: 28,
                      }}
                    >
                      {initials(u.name)}
                    </span>
                  ))}
                  {!s.people.length && (
                    <span className="muted">
                      <Users size={13} />
                      Nog geen taken
                    </span>
                  )}
                </div>
                <span className="muted">
                  <Clock size={13} />
                  {s.hours.toLocaleString("nl-NL")} u open
                </span>
              </div>
              {project && (
                <div className="project-people-names">
                  {s.people.map((u) => u.name).join(" · ") ||
                    "Koppel de eerste taak aan dit project."}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!projects.length && (
        <div className="panel empty">
          <FolderKanban size={30} />
          <strong>
            {selected === "none"
              ? "Taken zonder project"
              : "Nog geen projecten gevonden"}
          </strong>
          <p>
            {canCreate
              ? "Maak een project aan en koppel er taken van verschillende medewerkers aan."
              : "Je kunt de projecten en de taken van het team hier bekijken."}
          </p>
        </div>
      )}
      {project && (
        <>
          <div className="project-toolbar project-detail-toolbar">
            <div>
              <h2>
                <CheckCircle2 size={17} />
                Taken binnen dit project
              </h2>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={showArchive}
                  onChange={(e) => setShowArchive(e.target.checked)}
                />
                Ook gearchiveerde taken tonen
              </label>
            </div>
            {onNew && (
              <button onClick={() => onNew({ projectId: project.id })}>
                <Plus size={16} />
                Taak toevoegen
              </button>
            )}
          </div>
          {renderTasks(
            data.tasks.filter(
              (t) => t.projectId === project.id && (showArchive || !t.archived),
            ),
          )}
        </>
      )}
      {selected === "none" &&
        renderTasks(data.tasks.filter((t) => !t.projectId && !t.archived))}
    </div>
  );
}

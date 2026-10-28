import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  FolderKanban,
  CalendarDays,
  LayoutDashboard,
  ListTodo,
  Archive,
  Settings as SettingsIcon,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  ArrowUpRight,
  LogOut,
  Check,
  Clock,
  MoreHorizontal,
  StickyNote,
  X,
  Users,
  Download,
  Upload,
  Shield,
  Trash2,
  RotateCcw,
  Gamepad2,
  FileSpreadsheet,
  AlertTriangle,
  Lock,
  Sun,
  CheckCircle2,
  Menu,
} from "lucide-react";
import {
  api,
  Data,
  User,
  Task,
  Note,
  Settings,
  Status,
  statuses,
  today,
  localDate,
  dateLabel,
  initials,
} from "./types";
import "./style.css";
import { Arcade } from "./games/arcade";
import type { Game } from "./games/logic";
import { Projects } from "./projects";

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    ref.current?.querySelector<HTMLElement>("input,button")?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={"modal " + (wide ? "wide" : "")}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Sluiten">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Avatar({ user, size = 30 }: { user?: User; size?: number }) {
  return (
    <span
      className="avatar"
      style={{
        background: (user?.color || "#6366e8") + "19",
        color: user?.color,
        width: size,
        height: size,
      }}
    >
      {initials(user?.name || "?")}
    </span>
  );
}
function Badge({ status, settings }: { status: Status; settings: Settings }) {
  const c = settings.statusColors[status];
  return (
    <span className="badge" style={{ color: c, background: c + "14" }}>
      <i style={{ background: c }} />
      {status}
    </span>
  );
}
function App() {
  const [auth, setAuth] = useState<{
      initialized: boolean;
      user: User | null;
    } | null>(null),
    [data, setData] = useState<Data | null>(null),
    [view, setView] = useState("agenda"),
    [selected, setSelected] = useState("all"),
    [projectFilter, setProjectFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [task, setTask] = useState<Partial<Task> | null>(null),
    [note, setNote] = useState<Partial<Note> | null>(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [game, setGame] = useState<Game | null>(null),
    [nav, setNav] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const a = await api("/auth");
      setAuth(a);
      if (a.user) setData(await api("/data"));
      else setData(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const changed = async (message = "Opgeslagen") => {
    setTask(null);
    setNote(null);
    await refresh();
    setToast(message);
  };
  if (!auth)
    return (
      <div className="loading">
        <span className="brand-mark">Y</span>
        <p>{error || "Je planning wordt klaargezet…"}</p>
      </div>
    );
  if (!auth.user || !data)
    return <Login initialized={auth.initialized} onDone={refresh} />;
  const me = data.user,
    admin = me.role === "superadmin",
    write = me.role !== "reader",
    people = data.users.filter(
      (u) => u.plannable && u.role !== "reader" && u.active,
    ),
    byId = (id: string) => data.users.find((u) => u.id === id),
    canEdit = (t: Partial<Task>) => write && (admin || t.ownerId === me.id);
  const visible = data.tasks.filter(
    (t) =>
      (selected === "all" || t.ownerId === selected) &&
      (projectFilter === "all" ||
        (projectFilter === "none"
          ? !t.projectId
          : t.projectId === projectFilter)) &&
      (!search ||
        [
          t.title,
          t.notes,
          t.requester,
          byId(t.ownerId)?.name,
          data.projects.find((p) => p.id === t.projectId)?.name,
        ].some((s) => s?.toLowerCase().includes(search.toLowerCase()))),
  );
  const newTask = (values: Partial<Task> = {}) =>
    setTask({
      ownerId: admin
        ? selected !== "all"
          ? selected
          : people.find((u) => u.id === me.id)?.id || people[0]?.id
        : me.id,
      projectId: data.projects.some((p) => p.id === projectFilter)
        ? projectFilter
        : null,
      title: "",
      term: "",
      plannedDate: null,
      deadline: null,
      startTime: null,
      status: "Open",
      priority: null,
      requester: "",
      hours: null,
      notes: "",
      archived: false,
      ...values,
    });
  const go = (v: string) => {
    setView(v);
    setSearch("");
    setNav(false);
  };
  return (
    <div className="app">
      <aside className={"sidebar " + (nav ? "expanded" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("agenda");
          }}
        >
          <span className="brand-mark">
            Y<span>·</span>
          </span>
          <span>
            YAPlaning<small>RUIMTE VOOR OVERZICHT</small>
          </span>
        </a>
        <div className="workspace">
          <div className="workspace-icon">
            <Users size={17} />
          </div>
          <div>
            <strong>{data.settings.organization || "Ons team"}</strong>
            <small>{people.length} medewerkers</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label">WERKPLEK</p>
        <nav>
          {[
            ["dashboard", "Overzicht", LayoutDashboard],
            ["agenda", "Weekagenda", CalendarDays],
            ["taken", "Alle taken", ListTodo],
            ["projecten", "Projecten", FolderKanban],
            ["archief", "Archief", Archive],
          ].map(([id, label, Icon]: any) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              {label}
              {id === "taken" && (
                <span className="nav-count">
                  {
                    data.tasks.filter(
                      (t) => !t.archived && t.status !== "Afgewerkt",
                    ).length
                  }
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="team-label">
          <p className="nav-label">HET TEAM</p>
          {admin && (
            <button
              className="icon"
              title="Gebruikers beheren"
              onClick={() => go("admin")}
            >
              <Plus size={15} />
            </button>
          )}
        </div>
        <div className="team-list">
          {people.map((u) => (
            <button
              key={u.id}
              className={selected === u.id ? "selected" : ""}
              onClick={() => {
                setSelected(selected === u.id ? "all" : u.id);
                if (view === "admin") go("taken");
              }}
            >
              <Avatar user={u} size={27} />
              <span>{u.name}</span>
              <i style={{ background: u.color }} />
            </button>
          ))}
          {!people.length && (
            <p className="muted">Maak medewerkers aan in beheer.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="little-card">
            <Sun size={22} />
            <strong>
              Een helder hoofd.
              <br />
              Een overzichtelijke week.
            </strong>
            <p>Maak ruimte voor wat telt.</p>
            <button
              className="egg"
              title="Een kleine pauze"
              aria-label="Een kleine pauze"
              onClick={() => setGame("runner")}
            >
              <MoreHorizontal size={19} />
            </button>
          </div>
          {admin && (
            <button
              className={"admin-link " + (view === "admin" ? "active" : "")}
              onClick={() => go("admin")}
            >
              <SettingsIcon size={18} />
              Beheer & instellingen
            </button>
          )}
          <div className="profile">
            <Avatar user={me} />
            <div>
              <strong>{me.name}</strong>
              <small>
                {admin ? "Superadmin" : write ? "Medewerker" : "Alleen lezen"}
              </small>
            </div>
            <button
              className="icon"
              title="Uitloggen"
              onClick={async () => {
                await api("/logout", "POST");
                await refresh();
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon mobile-menu"
              onClick={() => setNav(!nav)}
              aria-label="Menu"
            >
              <Menu size={20} />
            </button>
            <span>Werkplek</span>
            <ChevronRight size={13} />
            <strong>
              {
                {
                  dashboard: "Overzicht",
                  agenda: "Weekagenda",
                  taken: "Alle taken",
                  projecten: "Projecten",
                  archief: "Archief",
                  admin: "Beheer & instellingen",
                }[view]
              }
            </strong>
          </div>
          <div className="top-right">
            <span className="live-dot" />
            Alles op één plek
            <span className="divider" />
            <Avatar user={me} size={28} />
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {view === "agenda"
                  ? "EEN WEEK VOL MOGELIJKHEDEN"
                  : view === "dashboard"
                    ? "FIJN DAT JE ER BENT"
                    : "JOUW WERK, IN BALANS"}
              </p>
              <h1>
                {
                  {
                    dashboard: `Goedendag, ${me.name.split(" ")[0]}`,
                    agenda: "Jouw week. Helder in beeld.",
                    taken: "Van idee naar afgewerkt.",
                    projecten: "Samen naar hetzelfde doel.",
                    archief: "Een plek voor afgerond werk.",
                    admin: "Alles goed geregeld.",
                  }[view]
                }
              </h1>
              <p className="subtitle">
                {
                  {
                    dashboard:
                      "De stand van zaken, je taken en de notities van het team.",
                    agenda:
                      "Plan met aandacht. Houd overzicht. Maak samen vooruitgang.",
                    taken:
                      "Alle taken van het team, met de details die ertoe doen.",
                    projecten:
                      "Eén project, meerdere mensen. Alle voortgang helder bij elkaar.",
                    archief:
                      "Zoek terug, bekijk details of haal een taak weer naar je planning.",
                    admin:
                      "Beheer je team, pas je werkplek aan en houd je gegevens veilig.",
                  }[view]
                }
              </p>
            </div>
            {write && view !== "admin" && (
              <button
                className="primary"
                disabled={!people.length || (!admin && !me.plannable)}
                onClick={() => newTask()}
              >
                <Plus size={17} />
                Nieuwe taak
              </button>
            )}
          </div>
          {view !== "admin" && (
            <Stats
              data={{
                ...data,
                tasks: data.tasks.filter(
                  (t) =>
                    projectFilter === "all" ||
                    (projectFilter === "none"
                      ? !t.projectId
                      : t.projectId === projectFilter),
                ),
              }}
              selected={selected}
            />
          )}
          {view !== "admin" && (
            <div className="filterbar">
              <div className="people-filter">
                <Users size={17} />
                <select
                  aria-label="Planning van medewerker"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="all">Iedereen</option>
                  {data.users
                    .filter((u) => u.plannable && u.role !== "reader")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {!u.active ? " (inactief)" : ""}
                      </option>
                    ))}
                </select>
                <span className="people-stack">
                  {people.slice(0, 4).map((u) => (
                    <Avatar key={u.id} user={u} size={25} />
                  ))}
                </span>
              </div>
              <label className="project-filter">
                <FolderKanban size={16} />
                <select
                  aria-label="Filter op project"
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                >
                  <option value="all">Alle projecten</option>
                  <option value="none">Zonder project</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="search">
                <Search size={16} />
                <input
                  placeholder="Zoek taken, personen, notities…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="icon"
                    aria-label="Zoekveld wissen"
                    onClick={() => setSearch("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
            </div>
          )}
          {view === "projecten" && (
            <Projects
              data={data}
              selected={projectFilter}
              onSelect={(id) => {
                setProjectFilter(id);
                setSelected("all");
                setSearch("");
              }}
              search={search}
              onDone={async () => {
                await refresh();
                setToast("Project opgeslagen");
              }}
              onNew={write && (admin || me.plannable) ? newTask : undefined}
              renderTasks={(tasks) => (
                <TaskTable
                  data={data}
                  tasks={tasks.filter((t) =>
                    visible.some((v) => v.id === t.id),
                  )}
                  onTask={setTask}
                  selected={selected}
                  onSelect={setSelected}
                />
              )}
            />
          )}
          {view === "agenda" && (
            <Calendar
              data={data}
              tasks={visible.filter((t) => !t.archived)}
              onTask={setTask}
              onNew={write && (admin || me.plannable) ? newTask : undefined}
            />
          )}
          {(view === "taken" || view === "archief") && (
            <TaskTable
              data={data}
              tasks={visible.filter((t) =>
                view === "archief" ? t.archived : !t.archived,
              )}
              onTask={setTask}
              selected={selected}
              onSelect={setSelected}
            />
          )}
          {view === "dashboard" && (
            <Dashboard
              data={data}
              tasks={visible.filter((t) => !t.archived)}
              onTask={setTask}
              onNote={setNote}
              search={search}
            />
          )}
          {view === "admin" && admin && (
            <Admin data={data} refresh={refresh} notify={setToast} />
          )}
          <footer className="page-footer">
            <span>
              YAPlaning{" "}
              <button
                className="secret-block"
                aria-label="Een passend moment"
                title="Een passend moment"
                onClick={() => setGame("tetris")}
              >
                ▦
              </button>{" "}
              <span className="subtle">/ Yet Another Planning</span>
            </span>
            <span>Een beetje structuur. Een hoop rust.</span>
          </footer>
        </div>
      </main>
      {task && (
        <TaskModal
          task={task}
          data={data}
          editable={canEdit(task)}
          onClose={() => setTask(null)}
          onDone={changed}
        />
      )}{" "}
      {note && (
        <NoteModal
          note={note}
          data={data}
          onClose={() => setNote(null)}
          onDone={changed}
        />
      )}{" "}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {game && (
        <Modal
          title={
            game === "runner"
              ? "Even uit de planning."
              : "Alles valt op zijn plek."
          }
          onClose={() => setGame(null)}
          wide
        >
          <Arcade game={game} user={me} />
        </Modal>
      )}
    </div>
  );
}
function Login({
  initialized,
  onDone,
}: {
  initialized: boolean;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "" }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="login-art">
        <div className="brand light">
          <span className="brand-mark">Y·</span>YAPlaning
        </div>
        <div>
          <span className="pill">MINDER RUIS. MEER RUIMTE.</span>
          <h1>
            Een mooie week
            <br />
            begint met
            <br />
            <em>overzicht.</em>
          </h1>
          <p>
            Alle plannen, taken en ideeën van je team.
            <br />
            Op één rustige plek.
          </p>
          <div className="art-calendar">
            {["MA", "DI", "WO", "DO", "VR"].map((d, i) => (
              <div key={d}>
                <small>{d}</small>
                <strong>{12 + i}</strong>
                <span
                  style={{
                    marginTop: [20, 65, 35, 85, 50][i],
                    height: [70, 45, 95, 40, 65][i],
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        <small>Yet Another Planning. Speciaal voor jullie team.</small>
      </div>
      <div className="login-form">
        <span className="brand-mark">Y·</span>
        <p className="eyebrow">
          {initialized ? "WELKOM TERUG" : "EEN FRIS BEGIN"}
        </p>
        <h2>
          {initialized ? "Jouw werkplek wacht." : "Welkom bij YAPlaning."}
        </h2>
        <p className="subtitle">
          {initialized
            ? "Log in om je planning te bekijken."
            : "Maak de eerste superadmin aan. Daarna voeg je het team toe."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(initialized ? "/login" : "/setup", "POST", form);
              await onDone();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {!initialized && (
            <label>
              Je naam
              <input
                required
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
          )}
          <label>
            E-mailadres
            <input
              type="email"
              autoComplete="username"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Wachtwoord
            <input
              type="password"
              minLength={initialized ? 1 : 10}
              maxLength={200}
              autoComplete={initialized ? "current-password" : "new-password"}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {!initialized && (
            <small className="muted">
              Minimaal 10 tekens. Je maakt hier je eigen beheeraccount aan.
            </small>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "Even geduld…"
              : initialized
                ? "Inloggen"
                : "Mijn werkplek aanmaken"}
            <ArrowUpRight size={17} />
          </button>
        </form>
        <p className="secure">
          <Lock size={13} />
          Een eigen, besloten werkplek voor je team.
        </p>
      </div>
    </div>
  );
}
function Stats({ data, selected }: { data: Data; selected: string }) {
  const tasks = data.tasks.filter(
      (t) => !t.archived && (selected === "all" || t.ownerId === selected),
    ),
    open = tasks.filter((t) => t.status !== "Afgewerkt");
  return (
    <div className="stats">
      {[
        {
          label: "Openstaande taken",
          value: open.length,
          sub: "Ruimte voor vooruitgang",
          icon: ListTodo,
          color: "#6366e8",
        },
        {
          label: "In uitvoering",
          value: tasks.filter((t) => t.status === "In Process").length,
          sub: "Stap voor stap verder",
          icon: Clock,
          color: "#cf8b25",
        },
        {
          label: "Afgewerkt",
          value: tasks.filter((t) => t.status === "Afgewerkt").length,
          sub: "Dat is weer mooi gedaan",
          icon: CheckCircle2,
          color: "#2b9c76",
        },
        {
          label: "Geschatte werkvoorraad",
          value:
            open
              .reduce((s, t) => s + (t.hours || 0), 0)
              .toLocaleString("nl-NL") + " u",
          sub: open.some((t) => t.hours === null)
            ? "Exclusief taken zonder inschatting"
            : "Uren van openstaande taken",
          icon: CalendarDays,
          color: "#b26c96",
        },
      ].map((s) => (
        <div className="stat" key={s.label}>
          <div>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
            <small>{s.sub}</small>
          </div>
          <span
            className="stat-icon"
            style={{ color: s.color, background: s.color + "10" }}
          >
            <s.icon size={20} />
          </span>
        </div>
      ))}
    </div>
  );
}
function taskColor(data: Data, t: Task) {
  return (
    data.projects.find((p) => p.id === t.projectId)?.color ||
    data.users.find((u) => u.id === t.ownerId)?.color ||
    "#6366e8"
  );
}
function Calendar({
  data,
  tasks,
  onTask,
  onNew,
}: {
  data: Data;
  tasks: Task[];
  onTask: (t: Task) => void;
  onNew?: (t: Partial<Task>) => void;
}) {
  const [offset, setOffset] = useState(0);
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7) + offset * 7);
  const days = Array.from(
    { length: data.settings.showWeekend ? 7 : 5 },
    (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      return d;
    },
  );
  const [start, end] = [data.settings.workStart, data.settings.workEnd];
  const unscheduled = tasks
    .filter((t) => !t.plannedDate && t.status !== "Afgewerkt")
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9));
  const timed = tasks.filter((t) => t.startTime && t.plannedDate);
  const before = timed.filter(
    (t) =>
      Number(t.startTime!.split(":")[0]) < start ||
      Number(t.startTime!.split(":")[0]) >= end,
  );
  const allDay = tasks.filter(
    (t) => t.plannedDate && (!t.startTime || before.includes(t)),
  );
  const range = days[0].toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
  const current = today();
  const totalWeek = tasks.filter((t) =>
    days.some((d) => localDate(d) === t.plannedDate),
  ).length;
  return (
    <div className="agenda-layout">
      <section className="calendar panel">
        <div className="calendar-toolbar">
          <div className="calendar-title">
            <h2>{range[0].toUpperCase() + range.slice(1)}</h2>
            <span className="week-tag">Week {weekNumber(days[0])}</span>
          </div>
          <div className="calendar-actions">
            <button onClick={() => setOffset(0)}>Vandaag</button>
            <div className="segmented">
              <button
                className="icon"
                aria-label="Vorige week"
                onClick={() => setOffset(offset - 1)}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon"
                aria-label="Volgende week"
                onClick={() => setOffset(offset + 1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <span className="view-tag">
              Week
              <ChevronDown size={13} />
            </span>
          </div>
        </div>
        <div className="calendar-scroll">
          <div
            className="calendar-inner"
            style={{ "--days": days.length } as React.CSSProperties}
          >
            <div className="day-headers">
              <div className="gmt">
                GMT+{String(-new Date().getTimezoneOffset() / 60)}
              </div>
              {days.map((d) => (
                <div
                  className={
                    "day-header " + (localDate(d) === current ? "is-today" : "")
                  }
                  key={localDate(d)}
                >
                  <small>
                    {d
                      .toLocaleDateString("nl-NL", { weekday: "short" })
                      .replace(".", "")}
                  </small>
                  <strong>{d.getDate()}</strong>
                </div>
              ))}
            </div>
            <div className="all-day-row">
              <span className="all-day-label">Hele dag</span>
              {days.map((d) => (
                <div className="all-day-cell" key={localDate(d)}>
                  {allDay
                    .filter((t) => t.plannedDate === localDate(d))
                    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onTask(t)}
                        className="all-day-event"
                        style={{
                          color: taskColor(data, t),
                          background: taskColor(data, t) + "13",
                        }}
                        title={t.title}
                      >
                        {t.priority && <b>P{t.priority} · </b>}
                        {t.startTime && <b>{t.startTime} </b>}
                        {t.title}
                      </button>
                    ))}
                </div>
              ))}
            </div>
            <div className="time-grid" style={{ height: (end - start) * 66 }}>
              <div className="time-axis">
                {Array.from({ length: end - start }, (_, i) => (
                  <span key={i} style={{ top: i * 66 }}>
                    {String(start + i).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
              {days.map((d) => {
                const day = localDate(d);
                const events = timed
                  .filter((t) => t.plannedDate === day && !before.includes(t))
                  .sort(
                    (a, b) =>
                      a.startTime!.localeCompare(b.startTime!) ||
                      (a.priority ?? 9) - (b.priority ?? 9),
                  );
                let groupEnd = 0;
                const groups: Task[][] = [];
                for (const t of events) {
                  const [h, m] = t.startTime!.split(":").map(Number);
                  const begin = h + m / 60;
                  const finish =
                    begin + Math.max(0.5, Math.min(t.hours ?? 1, 8));
                  if (!groups.length || begin >= groupEnd) {
                    groups.push([t]);
                    groupEnd = finish;
                  } else {
                    groups[groups.length - 1].push(t);
                    groupEnd = Math.max(groupEnd, finish);
                  }
                }
                return (
                  <div
                    className={
                      "day-column " + (day === current ? "today-column" : "")
                    }
                    key={day}
                  >
                    {Array.from({ length: end - start }, (_, i) => (
                      <button
                        className="hour-slot"
                        key={i}
                        aria-label={`Taak plannen op ${dateLabel(day)} om ${start + i}:00`}
                        onClick={() =>
                          onNew?.({
                            plannedDate: day,
                            startTime: `${String(start + i).padStart(2, "0")}:00`,
                          })
                        }
                        disabled={!onNew}
                      />
                    ))}
                    {groups.flatMap((group) =>
                      group.map((t, i) => {
                        const [h, m] = t.startTime!.split(":").map(Number),
                          top = (h + m / 60 - start) * 66;
                        const color = taskColor(data, t);
                        const height = Math.max(
                          32,
                          Math.min(
                            Math.max(t.hours ?? 1, 0.5) * 66,
                            (end - start) * 66 - top,
                          ),
                        );
                        return (
                          <button
                            className={
                              "calendar-event " +
                              (t.status === "Afgewerkt" ? "done" : "")
                            }
                            key={t.id}
                            onClick={() => onTask(t)}
                            style={{
                              top,
                              height,
                              left: `calc(${(i / group.length) * 100}% + 4px)`,
                              width: `calc(${100 / group.length}% - 8px)`,
                              background: color + "16",
                              borderLeftColor: color,
                              color,
                            }}
                            title={`${t.title} · ${data.projects.find((p) => p.id === t.projectId)?.name || "Zonder project"} · ${data.users.find((u) => u.id === t.ownerId)?.name} · ${t.startTime} · ${t.status}`}
                          >
                            <span>
                              {t.startTime}
                              {t.priority && ` · P${t.priority}`}
                            </span>
                            <strong>{t.title}</strong>
                            {height > 90 && t.projectId && (
                              <small>
                                {
                                  data.projects.find(
                                    (p) => p.id === t.projectId,
                                  )?.name
                                }
                              </small>
                            )}
                            {height > 58 && (
                              <small>
                                {
                                  data.users.find((u) => u.id === t.ownerId)
                                    ?.name
                                }
                              </small>
                            )}
                          </button>
                        );
                      }),
                    )}
                    {day === current &&
                      new Date().getHours() >= start &&
                      new Date().getHours() < end && (
                        <div
                          className="now-line"
                          style={{
                            top:
                              (new Date().getHours() +
                                new Date().getMinutes() / 60 -
                                start) *
                              66,
                          }}
                        >
                          <i />
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="calendar-footer">
          <span>
            <i className="small-dot" />
            {totalWeek} taken deze week
          </span>
          <span>Klik op een tijdvak om te plannen</span>
        </div>
      </section>
      <aside className="agenda-aside">
        <div className="panel unplanned">
          <div className="section-title">
            <h3>Nog te plannen</h3>
            <span className="count">{unscheduled.length}</span>
          </div>
          <p className="muted">Geen datum, wel op je radar.</p>
          {unscheduled.slice(0, 12).map((t) => (
            <button
              className="unplanned-task"
              key={t.id}
              onClick={() => onTask(t)}
            >
              <div className="task-meta">
                <span
                  className={"priority " + (t.priority === 1 ? "urgent" : "")}
                >
                  {t.priority ? "Prioriteit " + t.priority : "Geen prioriteit"}
                </span>
                <Avatar
                  user={data.users.find((u) => u.id === t.ownerId)}
                  size={23}
                />
              </div>
              <strong>{t.title}</strong>
              <div className="task-meta">
                <span>{t.term || "Nog geen termijn"}</span>
                {t.hours !== null && (
                  <span>
                    <Clock size={12} />
                    {t.hours} u
                  </span>
                )}
              </div>
            </button>
          ))}
          {!unscheduled.length && (
            <Empty
              icon={CalendarDays}
              title="Helemaal bij"
              text="Taken zonder plandatum verschijnen hier."
            />
          )}
          {unscheduled.length > 12 && (
            <small className="muted">
              En {unscheduled.length - 12} andere taken in het takenoverzicht.
            </small>
          )}
        </div>
        <div className="agenda-tip">
          <span>GOED OM TE WETEN</span>
          <h3>Niet alles hoeft vandaag.</h3>
          <p>
            Geef een taak een termijn of prioriteit. Een datum kies je zodra het
            past.
          </p>
          <div className="tip-decoration">↗</div>
        </div>
      </aside>
    </div>
  );
}
function weekNumber(d: Date) {
  const v = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  v.setUTCDate(v.getUTCDate() + 4 - (v.getUTCDay() || 7));
  return Math.ceil(
    ((+v - +new Date(Date.UTC(v.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7,
  );
}
function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: any;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <Icon size={28} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function TaskTable({
  data,
  tasks,
  onTask,
  selected,
  onSelect,
}: {
  data: Data;
  tasks: Task[];
  onTask: (t: Task) => void;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [sort, setSort] = useState("priority"),
    [asc, setAsc] = useState(true),
    [status, setStatus] = useState("all");
  const sorted = tasks
    .filter((t) => status === "all" || t.status === status)
    .sort((a, b) => {
      const value = (t: Task) =>
        sort === "ownerId"
          ? data.users.find((u) => u.id === t.ownerId)?.name || ""
          : sort === "projectId"
            ? data.projects.find((p) => p.id === t.projectId)?.name || ""
            : (t as any)[sort];
      const av = value(a),
        bv = value(b);
      if (av === null || av === "") return bv === null || bv === "" ? 0 : 1;
      if (bv === null || bv === "") return -1;
      return (
        (typeof av === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "nl")) * (asc ? 1 : -1)
      );
    });
  const cols = [
    ["title", "Taakomschrijving"],
    ["ownerId", "Medewerker"],
    ["projectId", "Project"],
    ["plannedDate", "Plandatum"],
    ["term", "Termijn"],
    ["deadline", "Deadline"],
    ["status", "Status"],
    ["priority", "Prioriteit"],
    ["requester", "Opdrachtgever"],
    ["hours", "Uren"],
    ["notes", "Notitie"],
  ];
  return (
    <section className="panel table-panel">
      <div className="section-title table-title">
        <div>
          <h2>
            {tasks[0]?.archived ? "Gearchiveerde taken" : "Takenoverzicht"}
          </h2>
          <span className="muted">{sorted.length} taken</span>
        </div>
        <select
          aria-label="Filter op status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Alle statussen</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {cols.map(([key, label]) => (
                <th key={key}>
                  <button
                    onClick={() => {
                      setSort(key);
                      setAsc(sort === key ? !asc : true);
                    }}
                  >
                    {label}
                    <ArrowUpDown
                      size={12}
                      className={sort === key ? "sorted" : ""}
                    />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} onClick={() => onTask(t)}>
                <td>
                  <button
                    className="task-title"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTask(t);
                    }}
                  >
                    <span
                      className={
                        "check-circle " +
                        (t.status === "Afgewerkt" ? "checked" : "")
                      }
                    >
                      {t.status === "Afgewerkt" && <Check size={11} />}
                    </span>
                    {t.title}
                  </button>
                </td>
                <td>
                  <span className="inline-user">
                    <Avatar
                      user={data.users.find((u) => u.id === t.ownerId)}
                      size={24}
                    />
                    {data.users.find((u) => u.id === t.ownerId)?.name}
                  </span>
                </td>
                <td>
                  {(() => {
                    const p = data.projects.find((p) => p.id === t.projectId);
                    return p ? (
                      <span className="project-label">
                        <i style={{ background: p.color }} />
                        {p.name}
                      </span>
                    ) : (
                      "—"
                    );
                  })()}
                </td>
                <td>
                  {dateLabel(t.plannedDate)}
                  {t.startTime && (
                    <small className="block muted">{t.startTime}</small>
                  )}
                </td>
                <td>{t.term || "—"}</td>
                <td>
                  <span
                    className={
                      t.deadline &&
                      t.deadline < today() &&
                      t.status !== "Afgewerkt"
                        ? "overdue"
                        : ""
                    }
                  >
                    {dateLabel(t.deadline)}
                  </span>
                </td>
                <td>
                  <Badge status={t.status} settings={data.settings} />
                </td>
                <td>
                  {t.priority ? (
                    <span
                      className={
                        "priority " + (t.priority === 1 ? "urgent" : "")
                      }
                    >
                      P{t.priority}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{t.requester || "—"}</td>
                <td>{t.hours !== null ? t.hours + " u" : "—"}</td>
                <td className="note-preview">{t.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!sorted.length && (
        <Empty
          icon={ListTodo}
          title="Een schone lei"
          text="Hier verschijnen de taken die aan je filters voldoen."
        />
      )}
      <div className="person-tabs">
        <button
          className={selected === "all" ? "active" : ""}
          onClick={() => onSelect("all")}
        >
          <Users size={14} />
          Iedereen
        </button>
        {data.users
          .filter((u) => u.plannable && u.role !== "reader" && u.active)
          .map((u) => (
            <button
              key={u.id}
              className={selected === u.id ? "active" : ""}
              onClick={() => onSelect(u.id)}
            >
              <i style={{ background: u.color }} />
              {u.name}
            </button>
          ))}
      </div>
    </section>
  );
}
function Dashboard({
  data,
  tasks,
  onTask,
  onNote,
  search,
}: {
  data: Data;
  tasks: Task[];
  onTask: (t: Task) => void;
  onNote: (n: Partial<Note>) => void;
  search: string;
}) {
  const list = tasks
      .filter((t) => t.status !== "Afgewerkt")
      .sort(
        (a, b) =>
          (a.priority ?? 9) - (b.priority ?? 9) ||
          (a.deadline || "9999").localeCompare(b.deadline || "9999"),
      )
      .slice(0, 8),
    notes = data.notes.filter((n) =>
      [n.title, n.body].some((s) =>
        s.toLowerCase().includes(search.toLowerCase()),
      ),
    );
  return (
    <div className="dashboard-grid">
      <section className="panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">EERST DE AANDACHT, DAN DE ACTIE</p>
            <h2>Op de radar</h2>
          </div>
          <span className="count">{list.length}</span>
        </div>
        {list.map((t) => (
          <button className="radar-task" key={t.id} onClick={() => onTask(t)}>
            <span className={"priority " + (t.priority === 1 ? "urgent" : "")}>
              {t.priority ? "P" + t.priority : "—"}
            </span>
            <div>
              <strong>{t.title}</strong>
              <small>
                {data.users.find((u) => u.id === t.ownerId)?.name} ·{" "}
                {t.deadline
                  ? "Deadline " + dateLabel(t.deadline)
                  : t.term || "Nog te plannen"}
              </small>
            </div>
            <Badge status={t.status} settings={data.settings} />
            <ChevronRight size={15} />
          </button>
        ))}
        {!list.length && (
          <Empty
            icon={CheckCircle2}
            title="Alles onder controle"
            text="Er staan geen open taken in deze selectie."
          />
        )}
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">IDEEËN OM TE BEWAREN</p>
            <h2>Notitiebord</h2>
          </div>
          {data.user.role !== "reader" && (
            <button
              className="icon soft"
              title="Notitie maken"
              onClick={() => onNote({ title: "", body: "", shared: true })}
            >
              <Plus size={18} />
            </button>
          )}
        </div>
        {notes.map((n) => (
          <button className="note-card" key={n.id} onClick={() => onNote(n)}>
            <div className="note-icon">
              <StickyNote size={18} />
            </div>
            <div>
              <strong>{n.title}</strong>
              <p>{n.body.slice(0, 95) || "Geen inhoud"}</p>
              <small>
                {n.shared ? "Teamnotitie" : "Privé"} ·{" "}
                {data.users.find((u) => u.id === n.authorId)?.name} ·{" "}
                {dateLabel(n.updatedAt.slice(0, 10))}
              </small>
            </div>
            <ArrowUpRight size={15} />
          </button>
        ))}
        {!notes.length && (
          <Empty
            icon={StickyNote}
            title="Een plek voor je ideeën"
            text="Maak een notitie voor jezelf of deel hem met het team."
          />
        )}
      </section>
    </div>
  );
}
function TaskModal({
  task,
  data,
  editable,
  onClose,
  onDone,
}: {
  task: Partial<Task>;
  data: Data;
  editable: boolean;
  onClose: () => void;
  onDone: (m?: string) => Promise<void>;
}) {
  const [form, setForm] = useState(task),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const set = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));
  const requesters = Object.entries(
    data.tasks.reduce<Record<string, number>>((a, t) => {
      if (t.requester) a[t.requester] = (a[t.requester] || 0) + 1;
      return a;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api(
        task.id ? "/tasks/" + task.id : "/tasks",
        task.id ? "PUT" : "POST",
        form,
      );
      await onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={
        task.id
          ? editable
            ? "Taak bewerken"
            : "Taak bekijken"
          : "Een nieuwe taak"
      }
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
        <fieldset disabled={!editable || busy}>
          <label>
            Taakomschrijving
            <input
              required
              maxLength={500}
              value={form.title || ""}
              placeholder="Wat wil je gedaan krijgen?"
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <label>
            Project <span className="optional">optioneel</span>
            <select
              value={form.projectId || ""}
              onChange={(e) => set("projectId", e.target.value || null)}
            >
              <option value="">Zonder project</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Medewerker
              <select
                value={form.ownerId || ""}
                disabled={data.user.role !== "superadmin"}
                onChange={(e) => set("ownerId", e.target.value)}
              >
                {data.users
                  .filter(
                    (u) =>
                      u.plannable &&
                      u.role !== "reader" &&
                      (u.active || u.id === form.ownerId),
                  )
                  .map((u) => (
                    <option value={u.id} key={u.id}>
                      {u.name}
                      {!u.active ? " (inactief)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as Status,
                    archived:
                      e.target.value === "Afgewerkt" ? f.archived : false,
                  }))
                }
              >
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Termijn <span className="optional">optioneel</span>
              <select
                value={form.term || ""}
                onChange={(e) => set("term", e.target.value)}
              >
                <option value="">Nog niet bepaald</option>
                {["Adhoc", "Korte termijn", "Lange termijn"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Prioriteit <span className="optional">1 = hoogste</span>
              <select
                value={form.priority ?? ""}
                onChange={(e) =>
                  set(
                    "priority",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">Geen prioriteit</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option value={n} key={n}>
                    {n}
                    {n === 1 ? " · Hoogste" : n === 5 ? " · Laagste" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plandatum
              <input
                type="date"
                value={form.plannedDate || ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    plannedDate: e.target.value || null,
                    startTime: e.target.value ? f.startTime : null,
                  }))
                }
              />
            </label>
            <label>
              Begintijd <span className="optional">optioneel</span>
              <input
                type="time"
                disabled={!form.plannedDate}
                value={form.startTime || ""}
                onChange={(e) => set("startTime", e.target.value || null)}
              />
            </label>
            <label>
              Deadline <span className="optional">optioneel</span>
              <input
                type="date"
                value={form.deadline || ""}
                onChange={(e) => set("deadline", e.target.value || null)}
              />
            </label>
            <label>
              Ureninschatting
              <input
                type="number"
                min="0"
                max="10000"
                step="0.25"
                value={form.hours ?? ""}
                placeholder="Bijv. 1,5"
                onChange={(e) =>
                  set(
                    "hours",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </label>
          </div>
          <label>
            Opdracht komt van
            <input
              list="requesters"
              value={form.requester || ""}
              maxLength={150}
              placeholder="Kies een naam of typ een nieuwe"
              onChange={(e) => set("requester", e.target.value)}
            />
            <datalist id="requesters">
              {requesters.map((s) => (
                <option value={s} key={s} />
              ))}
            </datalist>
          </label>
          <label>
            Notitie / bron
            <textarea
              rows={4}
              value={form.notes || ""}
              maxLength={20000}
              placeholder="Context, links of iets dat je wilt onthouden…"
              onChange={(e) => set("notes", e.target.value)}
            />
          </label>
          {form.status === "Afgewerkt" && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!!form.archived}
                onChange={(e) => set("archived", e.target.checked)}
              />
              Deze taak archiveren
            </label>
          )}
        </fieldset>
        {!editable && (
          <p className="info">
            <Lock size={15} />
            Je kunt deze taak bekijken. Alleen de eigenaar en superadmin kunnen
            hem wijzigen.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {task.id && editable && (
            <button
              type="button"
              className="danger-text"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={15} />
              Verwijderen
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            {editable ? "Annuleren" : "Sluiten"}
          </button>
          {editable && (
            <button className="primary" disabled={busy}>
              {busy ? "Opslaan…" : "Taak opslaan"}
            </button>
          )}
        </div>
        {confirm && (
          <div className="inline-confirm">
            <strong>Deze taak definitief verwijderen?</strong>
            <button type="button" onClick={() => setConfirm(false)}>
              Behouden
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/tasks/" + task.id, "DELETE");
                  await onDone("Taak verwijderd");
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Ja, verwijderen
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
function NoteModal({
  note,
  data,
  onClose,
  onDone,
}: {
  note: Partial<Note>;
  data: Data;
  onClose: () => void;
  onDone: (m?: string) => Promise<void>;
}) {
  const [form, setForm] = useState(note),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const edit =
    data.user.role !== "reader" &&
    (!note.id ||
      data.user.role === "superadmin" ||
      note.authorId === data.user.id);
  return (
    <Modal title={note.id ? "Notitie" : "Een nieuwe notitie"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              note.id ? "/notes/" + note.id : "/notes",
              note.id ? "PUT" : "POST",
              form,
            );
            await onDone("Notitie opgeslagen");
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={!edit || busy}>
          <label>
            Titel
            <input
              required
              maxLength={200}
              value={form.title || ""}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            Notitie
            <textarea
              rows={10}
              maxLength={30000}
              value={form.body || ""}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={!!form.shared}
              onChange={(e) => setForm({ ...form, shared: e.target.checked })}
            />
            Zichtbaar op het notitiebord van het team
          </label>
          <small className="muted">
            Uitgeschakeld? Dan is deze notitie alleen voor jou zichtbaar.
          </small>
        </fieldset>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          {edit && note.id && (
            <button
              type="button"
              className="danger-text"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={16} />
              Verwijderen
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Sluiten
          </button>
          {edit && (
            <button disabled={busy} className="primary">
              Opslaan
            </button>
          )}
        </div>
        {confirm && (
          <div className="inline-confirm">
            <strong>Notitie definitief verwijderen?</strong>
            <button type="button" onClick={() => setConfirm(false)}>
              Behouden
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/notes/" + note.id, "DELETE");
                  await onDone("Notitie verwijderd");
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Verwijderen
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}

function Admin({
  data,
  refresh,
  notify,
}: {
  data: Data;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState("users"),
    [editUser, setEditUser] = useState<Partial<User> | null>(null),
    [settings, setSettings] = useState(data.settings),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [danger, setDanger] = useState<"clear" | "restore" | null>(null),
    [backup, setBackup] = useState<any>(null),
    [audit, setAudit] = useState<any[]>([]);
  useEffect(() => {
    if (tab === "audit")
      void api("/admin/audit")
        .then(setAudit)
        .catch((e) => setError(e.message));
  }, [tab]);
  return (
    <>
      <div className="admin-tabs">
        {[
          ["users", "Gebruikers", Users],
          ["settings", "Werkplek", SettingsIcon],
          ["import", "Excel importeren", FileSpreadsheet],
          ["backup", "Gegevens & back-up", Shield],
          ["audit", "Activiteiten", Clock],
        ].map(([id, label, Icon]: any) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => {
              setTab(id);
              setError("");
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {tab === "users" && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Een team dat kan groeien</h2>
              <p className="muted">
                Medewerkers krijgen een eigen planning. Lezers kijken alleen
                mee.
              </p>
            </div>
            <button
              className="primary"
              onClick={() =>
                setEditUser({
                  name: "",
                  email: "",
                  role: "member",
                  plannable: true,
                  color: "#688ead",
                  active: true,
                })
              }
            >
              <Plus size={16} />
              Gebruiker toevoegen
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>E-mailadres</th>
                  <th>Rol</th>
                  <th>Eigen planning</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="inline-user">
                        <Avatar user={u} />
                        <strong>{u.name}</strong>
                      </span>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      {u.role === "superadmin"
                        ? "Superadmin"
                        : u.role === "member"
                          ? "Medewerker"
                          : "Lezer"}
                    </td>
                    <td>{u.plannable ? "Ja" : "Nee"}</td>
                    <td>
                      <span
                        className={"priority " + (!u.active ? "urgent" : "")}
                      >
                        {u.active ? "Actief" : "Uitgeschakeld"}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => setEditUser(u)}>Bewerken</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "settings" && (
        <form
          className="panel settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/admin/settings", "PUT", settings);
              await refresh();
              notify("Instellingen opgeslagen");
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="section-title">
            <div>
              <h2>Maak het jullie werkplek</h2>
              <p className="muted">Pas de agenda en herkenbare kleuren aan.</p>
            </div>
          </div>
          <label>
            Team- of organisatienaam
            <input
              value={settings.organization}
              maxLength={120}
              onChange={(e) =>
                setSettings({ ...settings, organization: e.target.value })
              }
            />
          </label>
          <div className="form-grid">
            <label>
              Agenda begint om
              <select
                value={settings.workStart}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    workStart: Number(e.target.value),
                  })
                }
              >
                {Array.from({ length: 23 }, (_, i) => (
                  <option value={i} key={i}>
                    {String(i).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <label>
              Agenda eindigt om
              <select
                value={settings.workEnd}
                onChange={(e) =>
                  setSettings({ ...settings, workEnd: Number(e.target.value) })
                }
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option value={i + 1} key={i}>
                    {String(i + 1).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.showWeekend}
              onChange={(e) =>
                setSettings({ ...settings, showWeekend: e.target.checked })
              }
            />
            Zaterdag en zondag tonen
          </label>
          <h3 className="space-top">Statuskleuren</h3>
          <div className="color-grid">
            {statuses.map((s) => (
              <label className="color-row" key={s}>
                <input
                  type="color"
                  value={settings.statusColors[s]}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      statusColors: {
                        ...settings.statusColors,
                        [s]: e.target.value,
                      },
                    })
                  }
                />
                {s}
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button className="primary" disabled={busy}>
              Instellingen opslaan
            </button>
          </div>
        </form>
      )}
      {tab === "import" && (
        <ImportPanel
          data={data}
          onDone={async () => {
            await refresh();
            notify("Excelimport afgerond");
          }}
        />
      )}
      {tab === "backup" && (
        <div className="backup-grid">
          <section className="panel backup-card">
            <span className="large-icon">
              <Download size={25} />
            </span>
            <h2>Een kopie voor de zekerheid</h2>
            <p>
              Download een volledige back-up van projecten, taken, archief,
              notities, accounts en instellingen.
            </p>
            <p className="info">
              <Lock size={15} />
              Dit bestand bevat privénotities en wachtwoordhashes. Bewaar het op
              een veilige plek. Actieve inlogsessies worden niet meegenomen.
            </p>
            <a className="button primary" href="/api/admin/backup" download>
              <Download size={16} />
              Back-up downloaden
            </a>
          </section>
          <section className="panel backup-card">
            <span className="large-icon">
              <RotateCcw size={25} />
            </span>
            <h2>Terug naar een eerder moment</h2>
            <p>
              Herstel een YAPlaning-back-up. De huidige gegevens en accounts
              worden volledig vervangen. Na herstel log je opnieuw in met een
              account uit de back-up.
            </p>
            <label className="button">
              <Upload size={16} />
              Back-up kiezen
              <input
                className="visually-hidden"
                type="file"
                accept=".json"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    if (f.size > 15 * 1024 * 1024)
                      throw new Error("Back-up mag maximaal 15 MB zijn");
                    const b = JSON.parse(await f.text());
                    if (
                      b.format !== "YAPlaning" ||
                      ![1, 2, 3].includes(b.version)
                    )
                      throw new Error("Geen ondersteunde YAPlaning-back-up");
                    setBackup(b);
                    setDanger("restore");
                  } catch (e: any) {
                    setError(e.message);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </section>
          <section className="panel danger-zone">
            <div>
              <h2>Opnieuw beginnen</h2>
              <p>
                Wis alle spelscores, projecten, taken, gearchiveerde taken,
                dashboardnotities en importhistorie. Accounts, instellingen en
                het activiteitenlog blijven behouden.
              </p>
              <strong>
                Maak eerst een back-up. Wissen kan niet ongedaan worden gemaakt.
              </strong>
            </div>
            <button
              className="danger-outline"
              onClick={() => setDanger("clear")}
            >
              <Trash2 size={16} />
              Database legen
            </button>
          </section>
        </div>
      )}
      {tab === "audit" && (
        <section className="panel">
          <div className="section-title">
            <h2>Activiteiten van de werkplek</h2>
            <span className="muted">Laatste 100 acties</span>
          </div>
          {audit.map((a) => (
            <div className="audit-row" key={a.id}>
              <Clock size={16} />
              <div>
                <strong>{a.action}</strong>
                <small>
                  {a.actorName || a.actor} ·{" "}
                  {new Date(a.createdAt).toLocaleString("nl-NL")}
                </small>
              </div>
            </div>
          ))}
          {!audit.length && (
            <Empty
              icon={Clock}
              title="Nog geen beheeracties"
              text="Import, back-ups en beheerwijzigingen worden hier vermeld."
            />
          )}
        </section>
      )}
      {editUser && (
        <UserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onDone={async () => {
            setEditUser(null);
            await refresh();
            notify("Gebruiker opgeslagen");
          }}
        />
      )}
      {danger && (
        <DangerModal
          kind={danger}
          backup={backup}
          onClose={() => setDanger(null)}
          onDone={async () => {
            setDanger(null);
            await refresh();
            notify(
              danger === "clear"
                ? "Taken en notities gewist"
                : "Back-up hersteld. Log opnieuw in.",
            );
          }}
        />
      )}
    </>
  );
}
function UserModal({
  user,
  onClose,
  onDone,
}: {
  user: Partial<User>;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState({ ...user, password: "" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={user.id ? "Gebruiker bewerken" : "Gebruiker toevoegen"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              "/admin/users" + (user.id ? "/" + user.id : ""),
              user.id ? "PUT" : "POST",
              { ...form, password: form.password || undefined },
            );
            await onDone();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Naam
          <input
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          E-mailadres
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <div className="form-grid">
          <label>
            Rol
            <select
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value as User["role"],
                  plannable:
                    e.target.value === "reader" ? false : form.plannable,
                })
              }
            >
              <option value="member">Medewerker</option>
              <option value="reader">Lezer</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </label>
          <label>
            Persoonskleur
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!form.plannable}
            disabled={form.role === "reader"}
            onChange={(e) => setForm({ ...form, plannable: e.target.checked })}
          />
          Eigen planning en persoonstabblad
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Account actief
        </label>
        <label>
          {user.id
            ? "Nieuw wachtwoord (leeg laten om te behouden)"
            : "Wachtwoord"}
          <input
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={200}
            required={!user.id}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <p className="muted">
          Minimaal 10 tekens. Geef de inloggegevens zelf aan je collega door.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Annuleren
          </button>
          <button className="primary" disabled={busy}>
            Gebruiker opslaan
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ImportPanel({
  data,
  onDone,
}: {
  data: Data;
  onDone: () => Promise<void>;
}) {
  const [owner, setOwner] = useState(
      data.users.find((u) => u.name.toLowerCase().includes("thijs"))?.id || "",
    ),
    [file, setFile] = useState(""),
    [filename, setFilename] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<any>(null);
  return (
    <section className="panel import-panel">
      <div className="section-title">
        <div>
          <h2>Van Excel naar overzicht</h2>
          <p className="muted">
            Importeer het bestaande model met de tabbladen Takenlijst en
            Afgerond.
          </p>
        </div>
        <FileSpreadsheet size={30} className="muted" />
      </div>
      <p>
        Alle taken in dit bestand worden gekoppeld aan de medewerker die je
        hieronder kiest. “Completed” wordt “Afgewerkt”, het tabblad Afgerond
        gaat naar het archief. Bron wordt een taaknotitie. Deadlines blijven
        deadlines; een plandatum voeg je later toe.
      </p>
      <label>
        Importeren voor
        <select
          required
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            setPreview(null);
            setResult(null);
          }}
        >
          <option value="">Kies een medewerker</option>
          {data.users
            .filter((u) => u.active && u.plannable && u.role !== "reader")
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
      </label>
      <label className="upload-zone">
        <Upload size={28} />
        <strong>{filename || "Kies je Excelbestand"}</strong>
        <span>.xlsx · maximaal 10 MB</span>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(null);
            setResult(null);
            setError("");
            if (!f) return;
            if (f.size > 10 * 1024 * 1024) {
              setError("Bestand mag maximaal 10 MB zijn");
              return;
            }
            setFilename(f.name);
            const reader = new FileReader();
            reader.onload = () => setFile(String(reader.result).split(",")[1]);
            reader.readAsDataURL(f);
          }}
        />
      </label>
      <button
        className="primary"
        disabled={!file || !owner || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setPreview(
              await api("/admin/import/preview", "POST", {
                ownerId: owner,
                file,
              }),
            );
            setResult(null);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Bestand verwerken…" : "Voorbeeld bekijken"}
      </button>
      {error && <p className="error">{error}</p>}
      {preview && (
        <div className="import-preview">
          <h3>
            {preview.rows.length} taken gevonden voor{" "}
            {data.users.find((u) => u.id === owner)?.name}
          </h3>
          <p>
            {preview.rows.filter((r: any) => r.task.archived).length} naar het
            archief · {preview.rows.filter((r: any) => !r.task.archived).length}{" "}
            naar de takenlijst
          </p>
          {preview.duplicate && (
            <p className="error">
              Dit bestand is al geïmporteerd voor deze medewerker.
            </p>
          )}
          {preview.warnings.length > 0 && (
            <details open>
              <summary>{preview.warnings.length} aandachtspunten</summary>
              {preview.warnings.map((w: string, i: number) => (
                <p key={i} className="muted">
                  {w}
                </p>
              ))}
            </details>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Taak</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th>Bestemming</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 30).map((r: any) => (
                  <tr key={r.sheet + r.row}>
                    <td>{r.task.title}</td>
                    <td>{r.task.status}</td>
                    <td>{dateLabel(r.task.deadline)}</td>
                    <td>{r.task.archived ? "Archief" : "Takenlijst"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 30 && (
            <p className="muted">Voorbeeld van de eerste 30 taken.</p>
          )}
          <button
            className="primary"
            disabled={busy || preview.duplicate || !!result}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setResult(
                  await api("/admin/import", "POST", { ownerId: owner, file }),
                );
                await onDone();
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Definitief importeren
          </button>
        </div>
      )}
      {result && (
        <p className="success">
          {result.count} taken geïmporteerd. {result.skipped} identieke taken
          overgeslagen.
        </p>
      )}
    </section>
  );
}
function DangerModal({
  kind,
  backup,
  onClose,
  onDone,
}: {
  kind: "clear" | "restore";
  backup: any;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const expected = kind === "clear" ? "LEEGMAKEN" : "HERSTELLEN";
  return (
    <Modal
      title={
        kind === "clear"
          ? "Gegevens definitief wissen?"
          : "Back-up terugzetten?"
      }
      onClose={onClose}
    >
      <div className="warning">
        <AlertTriangle size={22} />
        <p>
          {kind === "clear"
            ? "Alle spelscores, projecten, taken, het archief, notities en importhistorie worden gewist. Accounts en instellingen blijven behouden."
            : "Alle huidige gegevens, accounts en instellingen worden vervangen door de back-up. Je wordt daarna uitgelogd."}
        </p>
      </div>
      {backup && kind === "restore" && (
        <p>
          Back-up van{" "}
          {backup.createdAt
            ? new Date(backup.createdAt).toLocaleString("nl-NL")
            : "onbekende datum"}{" "}
          · {backup.users?.length || 0} accounts · {backup.tasks?.length || 0}{" "}
          taken.
        </p>
      )}
      <p>
        <strong>Download eerst een back-up van je huidige gegevens.</strong>
      </p>
      <a className="button" href="/api/admin/backup" download>
        <Download size={15} />
        Huidige back-up downloaden
      </a>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/admin/" + kind, "POST", {
              confirmation: text,
              password,
              ...(kind === "restore" ? { backup } : {}),
            });
            await onDone();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="space-top">
          Typ {expected} om te bevestigen
          <input
            required
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label>
          Je huidige beheerwachtwoord
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Annuleren
          </button>
          <button
            className="danger"
            disabled={busy || text !== expected || !password}
          >
            {busy
              ? "Bezig…"
              : kind === "clear"
                ? "Definitief leegmaken"
                : "Back-up herstellen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

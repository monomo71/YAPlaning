export type User = {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "member" | "reader";
  plannable: boolean;
  color: string;
  active: boolean;
};
export type Status = "Open" | "In Process" | "On Hold" | "Afgewerkt";
export const statuses: Status[] = [
  "Open",
  "In Process",
  "On Hold",
  "Afgewerkt",
];
export type Task = {
  id: string;
  ownerId: string;
  title: string;
  term: string;
  plannedDate: string | null;
  deadline: string | null;
  startTime: string | null;
  status: Status;
  priority: number | null;
  requester: string;
  hours: number | null;
  notes: string;
  archived: boolean;
  updatedAt: string;
};
export type Note = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  shared: boolean;
  updatedAt: string;
};
export type Settings = {
  organization: string;
  workStart: number;
  workEnd: number;
  showWeekend: boolean;
  statusColors: Record<Status, string>;
};
export type Data = {
  user: User;
  users: User[];
  tasks: Task[];
  notes: Note[];
  settings: Settings;
};
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Yap-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Verzoek mislukt");
  return data;
}
export const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = () => localDate(new Date());
export const dateLabel = (s: string | null) =>
  s
    ? new Date(s + "T12:00:00").toLocaleDateString("nl-NL", {
        day: "numeric",
        month: "short",
      })
    : "—";
export const initials = (s: string) =>
  s
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

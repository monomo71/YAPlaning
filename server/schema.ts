import { z } from "zod";
export const statuses = ["Open", "In Process", "On Hold", "Afgewerkt"] as const;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "Ongeldige datum")
  .nullable();
export const taskSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    ownerId: z.string().min(1),
    term: z.enum(["", "Adhoc", "Korte termijn", "Lange termijn"]).default(""),
    plannedDate: date.default(null),
    deadline: date.default(null),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .default(null),
    status: z.enum(statuses).default("Open"),
    priority: z.number().int().min(1).max(5).nullable().default(null),
    requester: z.string().trim().max(150).default(""),
    hours: z.number().min(0).max(10000).nullable().default(null),
    notes: z.string().max(20000).default(""),
    archived: z.boolean().default(false),
  })
  .refine((t) => !t.startTime || t.plannedDate, {
    message: "Kies een plandatum bij een begintijd",
  })
  .refine((t) => !t.archived || t.status === "Afgewerkt", {
    message: "Alleen afgewerkte taken kunnen worden gearchiveerd",
  });
export const userSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z
      .email()
      .max(200)
      .transform((v) => v.toLowerCase()),
    role: z.enum(["superadmin", "member", "reader"]),
    plannable: z.boolean(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    password: z.string().min(10).max(200).optional(),
    active: z.boolean().default(true),
  })
  .refine((u) => u.role !== "reader" || !u.plannable, {
    message: "Een lezer krijgt geen eigen planning",
  });
export const noteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(30000),
  shared: z.boolean().default(true),
});
export const settingsSchema = z
  .object({
    organization: z.string().trim().max(120),
    workStart: z.number().int().min(0).max(22),
    workEnd: z.number().int().min(1).max(24),
    showWeekend: z.boolean(),
    statusColors: z.object({
      Open: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      "In Process": z.string().regex(/^#[0-9a-fA-F]{6}$/),
      "On Hold": z.string().regex(/^#[0-9a-fA-F]{6}$/),
      Afgewerkt: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }),
  })
  .refine((v) => v.workEnd > v.workStart, {
    message: "Eindtijd moet na begintijd liggen",
  });
export type TaskInput = z.infer<typeof taskSchema>;

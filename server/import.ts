import ExcelJS from "exceljs";
import { taskSchema, type TaskInput } from "./schema.ts";
function text(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((x) => x.text).join("");
    if ("result" in value) return text(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
  }
  return String(value);
}
function date(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number")
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000)
      .toISOString()
      .slice(0, 10);
  const v = text(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
export async function parseImport(base64: string, ownerId: string) {
  const raw = Buffer.from(base64, "base64");
  if (raw.length > 10 * 1024 * 1024)
    throw new Error("Bestand mag maximaal 10 MB zijn");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(raw as any);
  const rows: { sheet: string; row: number; task: TaskInput }[] = [];
  const warnings: string[] = [];
  for (const sheet of wb.worksheets) {
    if (!["takenlijst", "afgerond"].includes(sheet.name.toLowerCase()))
      continue;
    const header = sheet.getRow(2);
    if (text(header.getCell(2).value).trim().toLowerCase() !== "omschrijving") {
      warnings.push(
        `${sheet.name}: kolommen niet herkend; verwacht het originele Excelmodel.`,
      );
      continue;
    }
    sheet.eachRow((r, i) => {
      if (i < 3 || !text(r.getCell(2).value).trim()) return;
      if (rows.length >= 5000)
        throw new Error("Maximaal 5.000 taken per import");
      const st = text(r.getCell(4).value).trim().toLowerCase();
      const status = [
        "completed",
        "compleet",
        "complete",
        "afgewerkt",
        "afgerond",
      ].includes(st)
        ? "Afgewerkt"
        : st === "on hold"
          ? "On Hold"
          : ["in process", "in progress"].includes(st)
            ? "In Process"
            : "Open";
      const num = (v: ExcelJS.CellValue) => {
        const s = text(v).trim();
        return s ? Number(s.replace(",", ".")) : null;
      };
      const term = text(r.getCell(3).value).trim();
      const deadline = date(r.getCell(8).value);
      if (
        !deadline &&
        text(r.getCell(8).value) &&
        !["geen deadline", "n.v.t."].includes(
          text(r.getCell(8).value).toLowerCase(),
        )
      )
        warnings.push(
          `${sheet.name}, rij ${i}: deadline niet herkend en leeg gelaten.`,
        );
      const task = {
        ownerId,
        title: text(r.getCell(2).value),
        term: ["Adhoc", "Korte termijn", "Lange termijn"].includes(term)
          ? term
          : "",
        status,
        priority: num(r.getCell(5).value),
        requester: text(r.getCell(6).value),
        hours: num(r.getCell(7).value),
        deadline,
        plannedDate: null,
        startTime: null,
        notes: text(r.getCell(9).value),
        archived:
          sheet.name.toLowerCase() === "afgerond" && status === "Afgewerkt",
      };
      const parsed = taskSchema.safeParse(task);
      if (parsed.success)
        rows.push({ sheet: sheet.name, row: i, task: parsed.data });
      else
        warnings.push(
          `${sheet.name}, rij ${i}: overgeslagen — ${parsed.error.issues.map((x) => x.message).join(", ")}`,
        );
    });
  }
  if (!rows.length)
    throw new Error(
      "Geen bruikbare taken gevonden. Gebruik de tabbladen Takenlijst en/of Afgerond met kolomkoppen op rij 2.",
    );
  return { rows, warnings };
}

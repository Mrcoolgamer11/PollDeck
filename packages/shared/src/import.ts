import { z } from "zod";
import type { TemplateSlide } from "./templates.js";

/**
 * Importformat für Quizfragen.
 *
 * JSON: Array von Objekten
 *   { "type": "choice", "question": "…", "answers": ["a","b","c"], "correct": [2], "time": 20 }
 *   { "type": "text",   "question": "…", "answers": ["Paris"], "time": 30, "typos": true }
 *
 * CSV (Trenner `;` oder `,`, erste Zeile = Kopfzeile):
 *   type;question;answer1;answer2;answer3;answer4;correct;time
 *   choice;Was ist 7×8?;54;56;58;64;2;20
 *   text;Hauptstadt von Frankreich?;Paris;;;;;30
 *
 * Bei `choice` ist `correct` die Nummer der richtigen Antwort(en), 1-basiert,
 * mehrere mit `|` getrennt. Bei `text` sind alle Antwortspalten richtige Antworten.
 */
export const quizImportItemSchema = z.object({
  type: z.enum(["choice", "text"]).default("choice"),
  question: z.string().trim().min(1).max(300),
  answers: z.array(z.string().trim().max(300)).min(1).max(20),
  correct: z.array(z.number().int().min(1)).optional(),
  time: z.number().int().min(5).max(300).optional(),
  points: z.number().int().min(100).max(5000).optional(),
  typos: z.boolean().optional(),
});
export type QuizImportItem = z.infer<typeof quizImportItemSchema>;

export class QuizImportError extends Error {
  constructor(message: string, public line?: number) {
    super(message);
  }
}

/** Minimaler CSV-Parser mit Unterstützung für Anführungszeichen. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

function csvToItems(text: string): QuizImportItem[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new QuizImportError("empty");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const qi = col("question") >= 0 ? col("question") : col("frage");
  if (qi < 0) throw new QuizImportError("missing_question_column", 1);
  const ti = col("type") >= 0 ? col("type") : col("typ");
  const ci = col("correct") >= 0 ? col("correct") : col("richtig");
  const timeI = col("time") >= 0 ? col("time") : col("zeit");
  const answerCols = header
    .map((h, i) => (/^(answer|antwort)\s*\d+$/.test(h) ? i : -1))
    .filter((i) => i >= 0);
  if (!answerCols.length) throw new QuizImportError("missing_answer_columns", 1);

  return rows.slice(1).map((r, idx) => {
    const line = idx + 2;
    const rawType = (ti >= 0 ? r[ti] : "choice")?.trim().toLowerCase() || "choice";
    const type = rawType === "text" || rawType === "texteingabe" ? "text" : "choice";
    const answers = answerCols.map((i) => (r[i] ?? "").trim()).filter(Boolean);
    const correct =
      ci >= 0 && r[ci]?.trim()
        ? r[ci]
            .split(/[|/]/)
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !Number.isNaN(n))
        : undefined;
    const time = timeI >= 0 && r[timeI]?.trim() ? parseInt(r[timeI], 10) : undefined;
    const parsed = quizImportItemSchema.safeParse({ type, question: r[qi], answers, correct, time });
    if (!parsed.success) throw new QuizImportError("invalid_row", line);
    return parsed.data;
  });
}

/** Wandelt Importdaten (CSV oder JSON) in Quiz-Folien um. */
export function parseQuizImport(content: string, format: "csv" | "json"): TemplateSlide[] {
  let items: QuizImportItem[];
  if (format === "json") {
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      throw new QuizImportError("invalid_json");
    }
    const arr = Array.isArray(data) ? data : (data as { questions?: unknown })?.questions;
    const parsed = z.array(quizImportItemSchema).min(1).max(500).safeParse(arr);
    if (!parsed.success) throw new QuizImportError("invalid_json_structure");
    items = parsed.data;
  } else {
    items = csvToItems(content);
  }
  return items.map((item, idx) => {
    if (item.type === "text") {
      return {
        type: "quiz_text",
        title: item.question,
        config: {
          correctAnswers: item.answers,
          caseSensitive: false,
          allowTypos: item.typos ?? true,
          timeLimit: item.time ?? 30,
          basePoints: item.points ?? 1000,
        },
      } satisfies TemplateSlide<"quiz_text">;
    }
    if (item.answers.length < 2) throw new QuizImportError("too_few_answers", idx + 1);
    const options = item.answers.slice(0, 8).map((label, i) => ({ id: `o${i + 1}`, label, imageUrl: null }));
    const correct = (item.correct?.length ? item.correct : [1]).filter((n) => n <= options.length);
    if (!correct.length) throw new QuizImportError("invalid_correct", idx + 1);
    return {
      type: "quiz_choice",
      title: item.question,
      config: {
        options,
        correctOptionIds: correct.map((n) => `o${n}`),
        timeLimit: item.time ?? 20,
        basePoints: item.points ?? 1000,
      },
    } satisfies TemplateSlide<"quiz_choice">;
  });
}

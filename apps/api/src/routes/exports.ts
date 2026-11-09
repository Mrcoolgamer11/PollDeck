import type { FastifyInstance } from "fastify";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { isInteractive, type SlideResults, type QaQuestion } from "@polldeck/shared";
import { prisma } from "../lib/prisma.js";
import { notFound, sendFile } from "../lib/http.js";
import { requireUser } from "../lib/auth.js";
import { assertAccess } from "../lib/access.js";
import { loadRuntime, type Runtime } from "../live/runtime.js";
import { hostResults, leaderboard, questionsFor } from "../live/data.js";
import { formatAnswer, summaryRows, TYPE_LABELS } from "../lib/report.js";

async function loadExportData(sessionId: string) {
  const rt = await loadRuntime(sessionId, true);
  if (!rt) throw notFound();
  const session = await prisma.liveSession.findUniqueOrThrow({ where: { id: sessionId } });
  const responses = await prisma.response.findMany({
    where: { sessionId, status: { not: "REJECTED" } },
    include: { participant: { select: { name: true, id: true } } },
    orderBy: { createdAt: "asc" },
  });
  const questions = await prisma.question.findMany({
    where: { sessionId, status: { not: "REJECTED" } },
    include: { _count: { select: { upvotes: true } }, participant: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const results: Record<string, SlideResults> = {};
  const qa: Record<string, QaQuestion[]> = {};
  for (const s of rt.slides) {
    if (isInteractive(s.type)) results[s.id] = await hostResults(rt, s);
    if (s.type === "qa") qa[s.id] = await questionsFor(rt, s.id);
  }
  const lb = await leaderboard(rt);
  const participants = await prisma.participant.count({ where: { sessionId, kicked: false } });
  return { rt, session, responses, questions, results, qa, lb, participants };
}

type ExportData = Awaited<ReturnType<typeof loadExportData>>;

function anonName(id: string, name: string | null, map: Map<string, string>) {
  if (name) return name;
  if (!map.has(id)) map.set(id, `Teilnehmer ${map.size + 1}`);
  return map.get(id)!;
}

function responseRows(d: ExportData) {
  const names = new Map<string, string>();
  const rows: (string | number | boolean | null)[][] = [];
  const slideNo = new Map(d.rt.slides.map((s, i) => [s.id, i + 1]));
  for (const r of d.responses) {
    const slide = d.rt.slides.find((s) => s.id === r.slideId);
    if (!slide) continue;
    rows.push([
      slideNo.get(slide.id) ?? 0,
      slide.title,
      TYPE_LABELS[slide.type] ?? slide.type,
      anonName(r.participant.id, r.participant.name, names),
      formatAnswer(slide, r.value),
      r.isCorrect === null ? "" : r.isCorrect ? "ja" : "nein",
      r.points || "",
      r.timeMs !== null ? Math.round(r.timeMs / 100) / 10 : "",
      r.status === "PENDING" ? "nicht freigegeben" : "",
      r.createdAt.toISOString(),
    ]);
  }
  for (const q of d.questions) {
    const slide = d.rt.slides.find((s) => s.id === q.slideId);
    rows.push([
      slide ? (slideNo.get(slide.id) ?? 0) : 0,
      slide?.title ?? "",
      "Q&A",
      anonName(q.participantId, q.participant.name, names),
      q.text,
      "",
      `${q._count.upvotes} Upvotes`,
      "",
      q.answered ? "beantwortet" : q.status === "PENDING" ? "nicht freigegeben" : "",
      q.createdAt.toISOString(),
    ]);
  }
  return rows;
}

const HEADER = ["Folie", "Titel", "Typ", "Teilnehmer", "Antwort", "Richtig", "Punkte", "Zeit (s)", "Status", "Zeitpunkt"];

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fileBase(rt: Runtime, startedAt: Date) {
  return `${rt.title} ${startedAt.toISOString().slice(0, 10)}`;
}

/** PDFKit-Standardschriften unterstützen nur WinAnsi – Emojis u. Ä. entfernen. */
const pdfText = (s: string | number) =>
  String(s)
    .replace(/[✓]/g, "(richtig)")
    .replace(/▲/g, "^")
    .replace(/[^\u0000-ÿ€–—‘-„•…]/g, "")
    .trim();

export async function exportRoutes(app: FastifyInstance) {
  const guard = async (userId: Parameters<typeof assertAccess>[0], sessionId: string) => {
    const s = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { presentationId: true } });
    if (!s) throw notFound();
    await assertAccess(userId, s.presentationId, "view");
  };

  app.get<{ Params: { id: string } }>("/sessions/:id/export.csv", async (req, reply) => {
    const user = requireUser(req);
    await guard(user, req.params.id);
    const d = await loadExportData(req.params.id);
    const lines = [HEADER, ...responseRows(d)].map((r) => r.map(csvEscape).join(";"));
    return sendFile(reply, `${fileBase(d.rt, d.session.startedAt)}.csv`, "text/csv; charset=utf-8", "﻿" + lines.join("\r\n"));
  });

  app.get<{ Params: { id: string } }>("/sessions/:id/export.xlsx", async (req, reply) => {
    const user = requireUser(req);
    await guard(user, req.params.id);
    const d = await loadExportData(req.params.id);
    const wb = new ExcelJS.Workbook();
    wb.creator = "PollDeck";
    wb.created = new Date();

    const summary = wb.addWorksheet("Übersicht");
    summary.columns = [{ width: 50 }, { width: 30 }];
    summary.addRow([d.rt.title]).font = { bold: true, size: 16 };
    summary.addRow(["Gestartet", d.session.startedAt.toLocaleString("de-DE")]);
    summary.addRow(["Beendet", d.session.endedAt?.toLocaleString("de-DE") ?? "läuft"]);
    summary.addRow(["Teilnehmer", d.participants]);
    summary.addRow([]);
    d.rt.slides.forEach((slide, i) => {
      if (slide.type === "content") return;
      const head = summary.addRow([`${i + 1}. ${slide.title || TYPE_LABELS[slide.type]}`, TYPE_LABELS[slide.type]]);
      head.font = { bold: true };
      head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FF" } };
      for (const row of summaryRows(slide, d.results[slide.id], { questions: d.qa[slide.id], leaderboard: d.lb })) {
        summary.addRow(row);
      }
      summary.addRow([]);
    });

    const raw = wb.addWorksheet("Antworten");
    raw.addRow(HEADER).font = { bold: true };
    responseRows(d).forEach((r) => raw.addRow(r));
    raw.columns.forEach((c, i) => (c.width = [7, 40, 18, 20, 60, 8, 8, 9, 16, 24][i]));
    raw.views = [{ state: "frozen", ySplit: 1 }];

    if (d.lb.length) {
      const lbSheet = wb.addWorksheet("Leaderboard");
      lbSheet.addRow(["Rang", "Name", "Punkte", "Richtige Antworten"]).font = { bold: true };
      d.lb.forEach((e) => lbSheet.addRow([e.rank, e.name, e.score, e.correct]));
      lbSheet.columns.forEach((c, i) => (c.width = [8, 30, 12, 20][i]));
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return sendFile(
      reply,
      `${fileBase(d.rt, d.session.startedAt)}.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buf,
    );
  });

  app.get<{ Params: { id: string } }>("/sessions/:id/export.pdf", async (req, reply) => {
    const user = requireUser(req);
    await guard(user, req.params.id);
    const d = await loadExportData(req.params.id);
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: pdfText(d.rt.title), Creator: "PollDeck" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    const accent = d.rt.theme.accent || "#7c5cff";
    const pageWidth = doc.page.width - 100;
    doc.fontSize(22).fillColor("#111").text(pdfText(d.rt.title));
    doc.moveDown(0.3).fontSize(10).fillColor("#555");
    doc.text(
      `Ergebnisbericht · ${d.session.startedAt.toLocaleString("de-DE")} · ${d.participants} Teilnehmer · Code ${d.session.code}`,
    );
    doc.moveDown(1);

    d.rt.slides.forEach((slide, i) => {
      if (slide.type === "content") return;
      const rows = summaryRows(slide, d.results[slide.id], { questions: d.qa[slide.id], leaderboard: d.lb });
      if (doc.y > doc.page.height - 160) doc.addPage();
      doc.fontSize(13).fillColor("#111").text(pdfText(`${i + 1}. ${slide.title || TYPE_LABELS[slide.type]}`));
      const voters = d.results[slide.id]?.voters;
      doc.fontSize(9).fillColor("#777").text(pdfText(`${TYPE_LABELS[slide.type]}${voters !== undefined ? ` · ${voters} Teilnehmende` : ""}`));
      doc.moveDown(0.4);
      if (!rows.length) {
        doc.fontSize(10).fillColor("#999").text("Keine Antworten");
      }
      const numeric = rows.every(([, v]) => typeof v === "number");
      const max = numeric ? Math.max(1, ...rows.map(([, v]) => v as number)) : 1;
      for (const [label, value] of rows) {
        if (doc.y > doc.page.height - 70) doc.addPage();
        const y = doc.y;
        if (numeric) {
          const labelW = pageWidth * 0.45;
          doc.fontSize(10).fillColor("#222").text(pdfText(label), 50, y, { width: labelW, ellipsis: true, height: 14 });
          const barW = ((pageWidth * 0.45) * (value as number)) / max;
          doc.rect(50 + labelW + 8, y + 2, Math.max(1, barW), 9).fill(accent);
          doc.fillColor("#222").text(String(value), 50 + labelW + 14 + barW, y, { width: 60 });
          doc.y = y + 16;
        } else {
          doc.fontSize(10).fillColor("#222").text(pdfText(label), 50, y, { width: pageWidth * 0.62 });
          const h = doc.y - y;
          doc.fillColor("#555").text(pdfText(value), 50 + pageWidth * 0.65, y, { width: pageWidth * 0.35 });
          doc.y = Math.max(doc.y, y + h) + 4;
        }
        doc.x = 50;
      }
      doc.moveDown(1);
    });

    doc.end();
    return sendFile(reply, `${fileBase(d.rt, d.session.startedAt)}.pdf`, "application/pdf", await done);
  });
}

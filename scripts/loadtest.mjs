#!/usr/bin/env node
/**
 * PollDeck – Lasttest mit simulierten Teilnehmern.
 *
 * Verbindet N Socket.IO-Clients mit einer laufenden Sitzung und lässt sie auf
 * die aktuelle Folie antworten (Multiple Choice, Wortwolke, offene Frage,
 * Skala, Zahl schätzen, Quiz). Gemessen werden Verbindungsdauer,
 * Antwort-Latenz (Ack) und die Rate der Ergebnis-Broadcasts.
 *
 * Aufruf:
 *   node scripts/loadtest.mjs --url https://poll.nebendahl.eu --code 123456 --clients 300
 *
 * Optionen:
 *   --url       Basis-URL (Standard: http://localhost:5173)
 *   --code      6-stelliger Beitrittscode (Pflicht)
 *   --clients   Anzahl simulierter Teilnehmer (Standard: 300)
 *   --ramp      Zeitraum in ms, über den die Verbindungen aufgebaut werden (Standard: 10000)
 *   --spread    Zeitraum in ms, über den die Antworten verteilt werden (Standard: 5000)
 *   --duration  Gesamtdauer in Sekunden, danach Bericht (Standard: 40)
 */
import { io } from "socket.io-client";
import crypto from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]?.startsWith("--") ? "true" : arr[i + 1]]);
    return acc;
  }, []),
);
const URL_BASE = args.url ?? "http://localhost:5173";
const CODE = args.code;
const N = Number(args.clients ?? 300);
const RAMP = Number(args.ramp ?? 10000);
const SPREAD = Number(args.spread ?? 5000);
const DURATION = Number(args.duration ?? 40) * 1000;

if (!CODE || !/^\d{6}$/.test(CODE)) {
  console.error("Bitte --code <6-stelliger Code> angeben.");
  process.exit(1);
}

const WORDS = ["Sonne", "Strand", "Eis", "Urlaub", "Ferien", "Hitze", "Meer", "Freibad", "Grillen", "Fahrrad"];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function answerFor(slide) {
  const c = slide.config;
  switch (slide.type) {
    case "multiple_choice":
    case "quiz_choice":
      return { optionIds: [pick(c.options).id] };
    case "word_cloud":
      return { words: Array.from({ length: Math.min(c.maxEntries, 2) }, () => pick(WORDS)) };
    case "open_ended":
      return { text: `Lasttest-Antwort ${crypto.randomBytes(3).toString("hex")}` };
    case "scale":
      return { ratings: Object.fromEntries(c.statements.map((s) => [s.id, c.min + Math.floor(Math.random() * (c.max - c.min + 1))])) };
    case "number_guess":
      return { value: Math.round(c.min + Math.random() * (c.max - c.min)) };
    case "ranking":
      return { order: [...c.options].sort(() => Math.random() - 0.5).map((o) => o.id) };
    case "quiz_text":
      return { text: pick(["Paris", "paris", "Lyon", "Berlin"]) };
    default:
      return null;
  }
}

const stats = {
  connected: 0,
  connectErrors: 0,
  disconnects: 0,
  connectMs: [],
  ackMs: [],
  ackErrors: {},
  resultsEvents: 0,
  stateEvents: 0,
};
const sockets = [];

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function vote(socket, slide, answered) {
  if (!slide || answered.has(`${slide.id}:${slide.gen}`)) return;
  const value = answerFor(slide);
  if (!value) return;
  answered.add(`${slide.id}:${slide.gen}`);
  setTimeout(() => {
    const t0 = performance.now();
    socket.timeout(15000).emit("participant:respond", { slideId: slide.id, value }, (err, res) => {
      if (err) stats.ackErrors.timeout = (stats.ackErrors.timeout ?? 0) + 1;
      else if (!res?.ok) stats.ackErrors[res?.error ?? "unknown"] = (stats.ackErrors[res?.error ?? "unknown"] ?? 0) + 1;
      else stats.ackMs.push(performance.now() - t0);
    });
  }, Math.random() * SPREAD);
}

function startClient(i) {
  const t0 = performance.now();
  const answered = new Set();
  const socket = io(URL_BASE, {
    path: "/socket.io",
    transports: ["websocket"],
    reconnection: true,
    auth: { role: "participant", code: CODE, deviceId: `loadtest-${process.pid}-${i}-${crypto.randomBytes(4).toString("hex")}`, name: `Bot ${i + 1}` },
  });
  sockets.push(socket);
  const current = (s) =>
    s.mode === "SURVEY" ? null : s.slide && !s.ended ? { ...s.slide, gen: s.slideState?.generation ?? 0, started: !!s.slideState?.quizStartedAt } : null;
  const maybeVote = (s) => {
    const slide = current(s);
    if (!slide) return;
    if ((slide.type === "quiz_choice" || slide.type === "quiz_text") && !slide.started) return;
    vote(socket, slide, answered);
  };
  socket.on("connect", () => {
    stats.connected++;
    stats.connectMs.push(performance.now() - t0);
  });
  socket.on("connect_error", () => stats.connectErrors++);
  socket.on("disconnect", () => {
    stats.disconnects++;
    stats.connected--;
  });
  socket.on("audience:init", (s) => maybeVote(s));
  socket.on("audience:state", (s) => {
    stats.stateEvents++;
    maybeVote(s);
  });
  socket.on("audience:results", () => stats.resultsEvents++);
}

console.log(`Starte ${N} Clients gegen ${URL_BASE} (Code ${CODE}) …`);
for (let i = 0; i < N; i++) setTimeout(() => startClient(i), (RAMP / N) * i);

const started = Date.now();
const progress = setInterval(() => {
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `[${secs}s] verbunden: ${stats.connected}/${N}  Antworten: ${stats.ackMs.length}  Fehler: ${JSON.stringify(stats.ackErrors)}  Ergebnis-Events: ${stats.resultsEvents}`,
  );
}, 5000);

setTimeout(() => {
  clearInterval(progress);
  const seconds = (Date.now() - started) / 1000;
  console.log("\n===== Ergebnis =====");
  console.log(`Clients:                 ${N}`);
  console.log(`Verbunden am Ende:       ${stats.connected}`);
  console.log(`Verbindungsfehler:       ${stats.connectErrors}`);
  console.log(`Verbindungsaufbau p50/p95: ${percentile(stats.connectMs, 50).toFixed(0)} / ${percentile(stats.connectMs, 95).toFixed(0)} ms`);
  console.log(`Antworten bestätigt:     ${stats.ackMs.length}`);
  console.log(`Antwort-Latenz p50/p95/max: ${percentile(stats.ackMs, 50).toFixed(0)} / ${percentile(stats.ackMs, 95).toFixed(0)} / ${Math.max(0, ...stats.ackMs).toFixed(0)} ms`);
  console.log(`Antwort-Fehler:          ${JSON.stringify(stats.ackErrors)}`);
  console.log(`Ergebnis-Broadcasts:     ${(stats.resultsEvents / Math.max(1, N) / seconds).toFixed(2)} pro Client und Sekunde (Soll: ≤ 4)`);
  for (const s of sockets) s.disconnect();
  setTimeout(() => process.exit(0), 300);
}, DURATION);

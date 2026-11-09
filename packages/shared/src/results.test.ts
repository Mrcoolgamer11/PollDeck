import { describe, expect, it } from "vitest";
import {
  computeRanking,
  computeWordCloud,
  computeChoiceResults,
  computeScale,
  computeNumber,
  computePoints,
} from "./results.js";
import { computeQuizPoints, computeLeaderboard } from "./quiz.js";
import { normalizeWord, matchesTextAnswer, containsFilteredWord, levenshtein } from "./text.js";
import { validateResponse, ResponseValidationError } from "./responses.js";
import { parseQuizImport, parseCsv } from "./import.js";
import type { Slide } from "./slides.js";

const r = (participantId: string, value: unknown, extra: object = {}) => ({ id: participantId + Math.random(), participantId, value, ...extra });
const opts = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("Wortwolken-Normalisierung", () => {
  it("trimmt, fasst Leerzeichen zusammen und ignoriert Groß/Klein", () => {
    expect(normalizeWord("  Sommer ")).toBe("sommer");
    expect(normalizeWord("SOMMER")).toBe("sommer");
    expect(normalizeWord("Eis   essen")).toBe("eis essen");
    expect(normalizeWord("Sonne!")).toBe("sonne");
    expect(normalizeWord("Äpfel")).toBe("äpfel");
  });

  it("gruppiert Schreibweisen und zeigt die häufigste", () => {
    const res = computeWordCloud([
      r("p1", { words: ["Sonne", "eis"] }),
      r("p2", { words: ["sonne "] }),
      r("p3", { words: ["Sonne", "Strand"] }),
      r("p4", { words: ["EIS"] }),
    ]);
    expect(res.words[0]).toEqual({ text: "Sonne", count: 3 });
    expect(res.words.find((w) => w.text.toLowerCase() === "eis")?.count).toBe(2);
    expect(res.voters).toBe(4);
  });

  it("nimmt bei Gleichstand die zuerst eingesendete Schreibweise", () => {
    const res = computeWordCloud([r("p1", { words: ["Sonne"] }), r("p2", { words: ["sonne"] }), r("p3", { words: ["SONNE"] })]);
    expect(res.words).toEqual([{ text: "Sonne", count: 3 }]);
  });

  it("zählt einen Begriff pro Teilnehmer-Antwort nur einmal", () => {
    const res = computeWordCloud([r("p1", { words: ["Sonne", "SONNE", "sonne"] })]);
    expect(res.words).toEqual([{ text: "Sonne", count: 1 }]);
  });

  it("blendet gefilterte Begriffe aus", () => {
    const res = computeWordCloud([r("p1", { words: ["Sonne", "Scheiße"] })], ["scheiße"]);
    expect(res.words.map((w) => w.text)).toEqual(["Sonne"]);
  });
});

describe("Ranking", () => {
  it("vergibt gewichtete Punkte (n für Platz 1)", () => {
    const res = computeRanking(opts, [
      r("p1", { order: ["a", "b", "c"] }),
      r("p2", { order: ["b", "a", "c"] }),
      r("p3", { order: ["b", "c", "a"] }),
    ]);
    // a: 3+2+1 = 6, b: 2+3+3 = 8, c: 1+1+2 = 4
    expect(res.ranking.map((x) => [x.optionId, x.score])).toEqual([
      ["b", 8],
      ["a", 6],
      ["c", 4],
    ]);
    expect(res.ranking[0].averagePosition).toBe(1.33);
  });

  it("behält bei Gleichstand die ursprüngliche Reihenfolge", () => {
    const res = computeRanking(opts, []);
    expect(res.ranking.map((x) => x.optionId)).toEqual(["a", "b", "c"]);
    expect(res.ranking[0].averagePosition).toBeNull();
  });
});

describe("Quiz-Punkte", () => {
  it("gibt volle Punkte bei sofortiger richtiger Antwort", () => {
    expect(computeQuizPoints({ correct: true, elapsedMs: 0, timeLimitMs: 20000 })).toBe(1000);
  });
  it("gibt halbe Punkte am Ende des Countdowns", () => {
    expect(computeQuizPoints({ correct: true, elapsedMs: 20000, timeLimitMs: 20000 })).toBe(500);
  });
  it("skaliert linear dazwischen", () => {
    expect(computeQuizPoints({ correct: true, elapsedMs: 10000, timeLimitMs: 20000 })).toBe(750);
    expect(computeQuizPoints({ correct: true, elapsedMs: 5000, timeLimitMs: 20000, basePoints: 2000 })).toBe(1750);
  });
  it("gibt 0 Punkte für falsche oder zu späte Antworten", () => {
    expect(computeQuizPoints({ correct: false, elapsedMs: 0, timeLimitMs: 20000 })).toBe(0);
    expect(computeQuizPoints({ correct: true, elapsedMs: 30000, timeLimitMs: 20000 })).toBe(0);
  });
  it("erstellt ein Leaderboard mit geteilten Rängen", () => {
    const lb = computeLeaderboard(
      [
        { participantId: "a", points: 900, isCorrect: true },
        { participantId: "b", points: 500, isCorrect: true },
        { participantId: "c", points: 900, isCorrect: true },
        { participantId: "b", points: 600, isCorrect: true },
        { participantId: "d", points: 0, isCorrect: false },
      ],
      { a: "Anna", b: "Ben", c: "Cem", d: null },
    );
    expect(lb.map((e) => [e.name, e.score, e.rank])).toEqual([
      ["Ben", 1100, 1],
      ["Anna", 900, 2],
      ["Cem", 900, 2],
      ["", 0, 4],
    ]);
  });
});

describe("Quiz-Texteingabe", () => {
  it("ignoriert Groß/Klein und Leerzeichen", () => {
    expect(matchesTextAnswer("  paris ", ["Paris"])).toBe(true);
    expect(matchesTextAnswer("paris", ["Paris"], { caseSensitive: true })).toBe(false);
  });
  it("toleriert Tippfehler nur wenn erlaubt", () => {
    expect(matchesTextAnswer("butterfyl", ["butterfly"], { allowTypos: true })).toBe(true);
    expect(matchesTextAnswer("butterfyl", ["butterfly"], { allowTypos: false })).toBe(false);
    expect(matchesTextAnswer("cat", ["car"], { allowTypos: true })).toBe(false);
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("weitere Ergebnisse", () => {
  it("zählt Multiple Choice", () => {
    const res = computeChoiceResults(opts, [r("p1", { optionIds: ["a"] }), r("p2", { optionIds: ["a", "c"] })]);
    expect(res.counts).toEqual({ a: 2, b: 0, c: 1 });
    expect(res.voters).toBe(2);
  });
  it("berechnet Skalen-Durchschnitt und Verteilung", () => {
    const res = computeScale(
      { statements: [{ id: "s1", label: "" }], min: 1, max: 5, minLabel: "", maxLabel: "" },
      [r("p1", { ratings: { s1: 5 } }), r("p2", { ratings: { s1: 2 } }), r("p3", { ratings: { s1: null } })],
    );
    expect(res.statements.s1.average).toBe(3.5);
    expect(res.statements.s1.distribution[5]).toBe(1);
    expect(res.statements.s1.count).toBe(2);
  });
  it("berechnet Zahl-schätzen-Statistik", () => {
    const res = computeNumber({ min: 0, max: 100, correctAnswer: 50, unit: "" }, [
      r("p1", { value: 10 }),
      r("p2", { value: 30 }),
      r("p3", { value: 95 }),
      r("p4", { value: 100 }),
    ]);
    expect(res.mean).toBe(58.75);
    expect(res.median).toBe(62.5);
    expect(res.bins[9].count).toBe(2);
  });
  it("summiert 100 Punkte", () => {
    const res = computePoints(opts, [r("p1", { points: { a: 60, b: 40 } }), r("p2", { points: { a: 100 } })]);
    expect(res.totals).toEqual({ a: 160, b: 40, c: 0 });
    expect(res.averages.a).toBe(80);
  });
});

describe("Antwort-Validierung", () => {
  const slide = {
    id: "s",
    type: "points_100",
    position: 0,
    title: "",
    background: {},
    settings: {} as never,
    config: { options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], total: 100 },
  } as Slide;
  it("lehnt zu viele Punkte ab", () => {
    expect(() => validateResponse(slide, { points: { a: 80, b: 30 } })).toThrow(ResponseValidationError);
    expect(validateResponse(slide, { points: { a: 70, b: 30, x: 5 } })).toEqual({ points: { a: 70, b: 30 } });
  });
});

describe("Wortfilter", () => {
  it("findet nur ganze Wörter", () => {
    expect(containsFilteredWord("Das ist Scheiße!", ["scheiße"])).toBe(true);
    expect(containsFilteredWord("Cocktail", ["cock"])).toBe(false);
  });
});

describe("Quiz-Import", () => {
  it("liest CSV mit Semikolon und Anführungszeichen", () => {
    const csv = 'type;question;answer1;answer2;answer3;answer4;correct;time\nchoice;"Was ist 7×8; ehrlich?";54;56;58;64;2;15\ntext;Hauptstadt von Frankreich?;Paris;;;;;30\n';
    expect(parseCsv(csv)[1][1]).toBe("Was ist 7×8; ehrlich?");
    const slides = parseQuizImport(csv, "csv");
    expect(slides).toHaveLength(2);
    expect(slides[0].type).toBe("quiz_choice");
    expect((slides[0].config as { correctOptionIds: string[] }).correctOptionIds).toEqual(["o2"]);
    expect((slides[1].config as { correctAnswers: string[] }).correctAnswers).toEqual(["Paris"]);
  });
  it("liest JSON", () => {
    const slides = parseQuizImport(JSON.stringify([{ type: "choice", question: "Q", answers: ["a", "b"], correct: [1, 2] }]), "json");
    expect((slides[0].config as { correctOptionIds: string[] }).correctOptionIds).toEqual(["o1", "o2"]);
  });
});

import { anonymizeIp, findUploadRefs } from "./privacy.js";
describe("Datenschutz-Helfer", () => {
  it("kürzt IP-Adressen", () => {
    expect(anonymizeIp("203.0.113.57")).toBe("203.0.113.0");
    expect(anonymizeIp("::ffff:198.51.100.23")).toBe("198.51.100.0");
    expect(anonymizeIp("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3::");
    expect(anonymizeIp(undefined)).toBe("");
  });
  it("findet Upload-Referenzen", () => {
    const refs = findUploadRefs('{"imageUrl":"/api/uploads/mx1-abc_D.png","x":"/api/uploads/q-2.webp /api/uploads/evil.svg"}');
    expect([...refs].sort()).toEqual(["mx1-abc_D.png", "q-2.webp"]);
  });
});

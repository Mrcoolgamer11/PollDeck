import type { SlideType, SlideConfigMap, SlideSettings } from "./slides.js";

export interface TemplateSlide<T extends SlideType = SlideType> {
  type: T;
  title: string;
  description?: string;
  config: SlideConfigMap[T];
  settings?: Partial<SlideSettings>;
  notes?: string;
}

export interface PresentationTemplate {
  id: string;
  name: { de: string; en: string };
  description: { de: string; en: string };
  slides: TemplateSlide[];
}

const o = (...labels: string[]) => labels.map((label, i) => ({ id: `o${i + 1}`, label, imageUrl: null }));
const st = (...labels: string[]) => labels.map((label, i) => ({ id: `s${i + 1}`, label }));

export const TEMPLATES: PresentationTemplate[] = [
  {
    id: "klassenrat",
    name: { de: "Klassenrat-Abstimmung", en: "Class council vote" },
    description: {
      de: "Anliegen sammeln, priorisieren und abstimmen.",
      en: "Collect, prioritise and vote on class issues.",
    },
    slides: [
      { type: "content", title: "Klassenrat", config: { layout: "heading", heading: "Klassenrat", body: "Heute: Anliegen sammeln und abstimmen", bullets: [], quote: "", author: "" } },
      { type: "open_ended", title: "Welche Anliegen hast du für den Klassenrat?", config: { display: "wall", maxLength: 200 }, settings: { allowMultipleSubmissions: true, responseLimit: 3, moderation: true } },
      { type: "ranking", title: "Was ist uns am wichtigsten?", config: { options: o("Anliegen 1", "Anliegen 2", "Anliegen 3") } },
      { type: "multiple_choice", title: "Stimmst du dem Vorschlag zu?", config: { options: o("Ja", "Nein", "Enthaltung"), multiSelect: false, chartType: "pie" }, settings: { hideResultsUntilReveal: true } },
    ],
  },
  {
    id: "vokabel-quiz",
    name: { de: "Vokabel-Quiz", en: "Vocabulary quiz" },
    description: { de: "Englisch-Vokabeln mit Countdown und Leaderboard.", en: "Vocabulary quiz with timer and leaderboard." },
    slides: [
      { type: "content", title: "Vokabel-Quiz", config: { layout: "heading", heading: "Vokabel-Quiz 🇬🇧", body: "Schnell sein lohnt sich!", bullets: [], quote: "", author: "" } },
      { type: "quiz_choice", title: "Was heißt „Hund“ auf Englisch?", config: { options: o("dog", "cat", "house", "bird"), correctOptionIds: ["o1"], timeLimit: 20, basePoints: 1000 } },
      { type: "quiz_choice", title: "Was heißt „always“?", config: { options: o("manchmal", "nie", "immer", "oft"), correctOptionIds: ["o3"], timeLimit: 20, basePoints: 1000 } },
      { type: "quiz_text", title: "Übersetze: „der Schmetterling“", config: { correctAnswers: ["butterfly", "the butterfly"], caseSensitive: false, allowTypos: true, timeLimit: 30, basePoints: 1000 } },
      { type: "quiz_choice", title: "Welches Wort ist ein Verb?", config: { options: o("beautiful", "quickly", "to run", "table"), correctOptionIds: ["o3"], timeLimit: 20, basePoints: 1000 } },
      { type: "leaderboard", title: "Endstand", config: { topN: 10, final: true } },
    ],
  },
  {
    id: "stimmungsbarometer",
    name: { de: "Stimmungsbarometer", en: "Mood check" },
    description: { de: "Wie geht es der Gruppe heute?", en: "How is the group feeling today?" },
    slides: [
      { type: "multiple_choice", title: "Wie geht es dir heute?", config: { options: o("😄 Super", "🙂 Gut", "😐 Geht so", "🙁 Nicht so gut"), multiSelect: false, chartType: "donut" } },
      { type: "scale", title: "Wie fit fühlst du dich?", config: { statements: st("Energie", "Konzentration", "Motivation"), min: 1, max: 5, minLabel: "gar nicht", maxLabel: "sehr" } },
      { type: "word_cloud", title: "Beschreibe deine Stimmung in einem Wort", config: { maxEntries: 1, maxLength: 25 } },
    ],
  },
  {
    id: "feedback",
    name: { de: "Feedback zur Stunde", en: "Lesson feedback" },
    description: { de: "Kurzes Feedback am Ende der Stunde.", en: "Quick feedback at the end of a lesson." },
    slides: [
      { type: "scale", title: "Wie war die Stunde?", config: { statements: st("Ich habe etwas gelernt", "Das Tempo war passend", "Die Erklärungen waren verständlich"), min: 1, max: 5, minLabel: "stimme nicht zu", maxLabel: "stimme zu" } },
      { type: "word_cloud", title: "Was nimmst du aus der Stunde mit?", config: { maxEntries: 3, maxLength: 25 } },
      { type: "open_ended", title: "Was können wir besser machen?", config: { display: "wall", maxLength: 300 }, settings: { moderation: true } },
      { type: "qa", title: "Offene Fragen", config: { allowUpvotes: true, maxLength: 250 } },
    ],
  },
  {
    id: "brainstorming",
    name: { de: "Brainstorming", en: "Brainstorming" },
    description: { de: "Ideen sammeln, bewerten und priorisieren.", en: "Collect, rate and prioritise ideas." },
    slides: [
      { type: "word_cloud", title: "Woran denkst du beim Thema …?", config: { maxEntries: 3, maxLength: 25 } },
      { type: "open_ended", title: "Deine Ideen", config: { display: "wall", maxLength: 250 }, settings: { allowMultipleSubmissions: true, responseLimit: 5 } },
      { type: "grid_2x2", title: "Aufwand und Nutzen", config: { items: st("Idee A", "Idee B", "Idee C"), xLabel: "Aufwand", yLabel: "Nutzen", min: 0, max: 10 } },
      { type: "points_100", title: "Verteile 100 Punkte", config: { options: o("Idee A", "Idee B", "Idee C"), total: 100 } },
    ],
  },
];

/** Demo-Präsentation mit jedem Folientyp (für das Seed-Skript). */
export const DEMO_PRESENTATION: { title: string; slides: TemplateSlide[] } = {
  title: "PollDeck-Demo: alle Folientypen",
  slides: [
    { type: "content", title: "Willkommen", config: { layout: "heading", heading: "Willkommen bei PollDeck", body: "Tritt mit dem Code oben bei und mach mit!", bullets: [], quote: "", author: "" }, notes: "Begrüßung, Code zeigen." },
    { type: "multiple_choice", title: "Welches Fach magst du am liebsten?", config: { options: o("Mathe", "Deutsch", "Englisch", "Sport", "Kunst"), multiSelect: false, chartType: "bar" } },
    { type: "word_cloud", title: "Was fällt dir zum Thema Sommer ein?", config: { maxEntries: 3, maxLength: 25 } },
    { type: "open_ended", title: "Was war heute dein Highlight?", config: { display: "wall", maxLength: 250 } },
    { type: "scale", title: "Wie sehr stimmst du zu?", config: { statements: st("Hausaufgaben sind sinnvoll", "Ich lerne gern in Gruppen", "Pausen sind zu kurz"), min: 1, max: 5, minLabel: "gar nicht", maxLabel: "voll und ganz" } },
    { type: "ranking", title: "Sortiere nach Wichtigkeit", config: { options: o("Freunde", "Schule", "Hobbys", "Familie") } },
    { type: "points_100", title: "Wofür soll die Klassenkasse ausgegeben werden?", config: { options: o("Ausflug", "Klassenfest", "Spiele", "Bücher"), total: 100 } },
    { type: "grid_2x2", title: "Bewerte die Projektideen", config: { items: st("Schulgarten", "Schülerzeitung", "Spendenlauf"), xLabel: "Aufwand", yLabel: "Spaß", min: 0, max: 10 } },
    { type: "number_guess", title: "Wie viele Einwohner hat Deutschland (in Mio.)?", config: { min: 0, max: 200, correctAnswer: 84, unit: "Mio." } },
    { type: "qa", title: "Deine Fragen", config: { allowUpvotes: true, maxLength: 250 } },
    { type: "quiz_choice", title: "Was ist 7 × 8?", config: { options: o("54", "56", "58", "64"), correctOptionIds: ["o2"], timeLimit: 20, basePoints: 1000 } },
    { type: "quiz_text", title: "Hauptstadt von Frankreich?", config: { correctAnswers: ["Paris"], caseSensitive: false, allowTypos: true, timeLimit: 30, basePoints: 1000 } },
    { type: "leaderboard", title: "Endstand", config: { topN: 10, final: true } },
  ],
};

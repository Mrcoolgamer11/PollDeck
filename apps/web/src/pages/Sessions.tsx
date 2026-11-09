import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, FileDown, FileSpreadsheet, FileText, MonitorPlay, Play, Square, Trash2 } from "lucide-react";
import {
  defaultSlideLiveState,
  isInteractive,
  type LeaderboardEntry,
  type QaQuestion,
  type Slide,
  type SlideResults,
  type ThemeConfig,
} from "@polldeck/shared";
import { del, download, get, post } from "../lib/api";
import { Button, Card, EmptyState, IconButton, Modal, Spinner, useErrorText, useToast } from "../components/ui";
import { SlideView, formatCode } from "../slides/SlideView";
import { SLIDE_META } from "../slides/meta";

interface SessionItem {
  id: string;
  code: string;
  status: "ACTIVE" | "ENDED";
  mode: "PRESENTER" | "SURVEY";
  startedAt: string;
  endedAt: string | null;
  participants: number;
  responses: number;
}

/** Alle Sitzungen einer Präsentation. */
export function SessionListPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const errText = useErrorText();
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [title, setTitle] = useState("");
  const [access, setAccess] = useState<"owner" | "edit" | "view">("view");
  const [confirm, setConfirm] = useState<SessionItem | null>(null);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      get<{ sessions: SessionItem[] }>(`/api/presentations/${id}/sessions`),
      get<{ presentation: { title: string; access: "owner" | "edit" | "view" } }>(`/api/presentations/${id}`),
    ]);
    setSessions(s.sessions);
    setTitle(p.presentation.title);
    setAccess(p.presentation.access);
  }, [id]);
  useEffect(() => {
    load().catch((e) => toast(errText(e), "error"));
  }, [load, toast, errText]);

  if (!sessions) return <Spinner />;
  const canEdit = access !== "view";
  return (
    <div>
      <Link to="/dashboard" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("nav.presentations")}
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">
          {t("sessions.title")}: {title}
        </h1>
        {canEdit && (
          <>
            <Link to={`/edit/${id}`} className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50 dark:ring-slate-600 dark:hover:bg-slate-800">
              {t("dashboard.edit")}
            </Link>
            <Button
              onClick={async () => {
                try {
                  const r = await post<{ id: string }>(`/api/presentations/${id}/sessions`, { mode: "PRESENTER", restart: true });
                  navigate(`/present/${r.id}`);
                } catch (e) {
                  toast(errText(e), "error");
                }
              }}
            >
              <Play className="h-4 w-4" aria-hidden /> {t("sessions.newSession")}
            </Button>
          </>
        )}
      </div>
      {!sessions.length ? (
        <EmptyState title={t("sessions.empty")}>{t("sessions.emptyHint")}</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">{t("sessions.started")}</th>
                <th className="px-4 py-3">{t("sessions.mode")}</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">{t("sessions.participants")}</th>
                <th className="px-4 py-3">{t("sessions.responses")}</th>
                <th className="px-4 py-3">{t("sessions.status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3">
                    <Link to={`/sessions/${s.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                      {new Date(s.startedAt).toLocaleString(i18n.language)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{s.mode === "SURVEY" ? t("present.surveyMode") : t("present.presenterMode")}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCode(s.code)}</td>
                  <td className="px-4 py-3 tabular-nums">{s.participants}</td>
                  <td className="px-4 py-3 tabular-nums">{s.responses}</td>
                  <td className="px-4 py-3">
                    {s.status === "ACTIVE" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">{t("sessions.active")}</span>
                    ) : (
                      <span className="text-slate-500">{t("sessions.ended")}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {s.status === "ACTIVE" && canEdit && (
                      <>
                        <IconButton label={t("sessions.openPresenter")} onClick={() => navigate(`/present/${s.id}`)}>
                          <MonitorPlay className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label={t("present.end")}
                          onClick={async () => {
                            await post(`/api/sessions/${s.id}/end`);
                            load();
                          }}
                        >
                          <Square className="h-4 w-4" />
                        </IconButton>
                      </>
                    )}
                    {canEdit && (
                      <IconButton label={t("common.delete")} onClick={() => setConfirm(s)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t("sessions.deleteTitle")}
        footer={
          <Button
            variant="danger"
            onClick={async () => {
              await del(`/api/sessions/${confirm!.id}`);
              setConfirm(null);
              load();
            }}
          >
            {t("common.delete")}
          </Button>
        }
      >
        <p>{t("sessions.deleteConfirm")}</p>
      </Modal>
    </div>
  );
}

interface SessionDetail {
  id: string;
  code: string;
  status: "ACTIVE" | "ENDED";
  mode: string;
  startedAt: string;
  endedAt: string | null;
  presentationId: string;
  title: string;
  theme: ThemeConfig;
  access: string;
  participants: number;
  online: number;
  slides: Slide[];
  results: Record<string, SlideResults>;
  questions: Record<string, QaQuestion[]>;
  leaderboard: LeaderboardEntry[];
}

/** Archivierte Ergebnisse einer Sitzung inkl. Export. */
export function SessionResultsPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<SessionDetail | null>(null);
  useEffect(() => {
    get<{ session: SessionDetail }>(`/api/sessions/${id}`).then((r) => setS(r.session));
  }, [id]);
  if (!s) return <Spinner />;
  const revealedState = { ...defaultSlideLiveState(), revealed: true, resultsVisible: true, quizStartedAt: 1 };
  const slides = s.slides.filter((x) => x.type !== "content");
  return (
    <div>
      <Link to={`/sessions/p/${s.presentationId}`} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("sessions.title")}
      </Link>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">{s.title}</h1>
          <p className="text-sm text-slate-500">
            {new Date(s.startedAt).toLocaleString(i18n.language)}
            {s.endedAt && ` – ${new Date(s.endedAt).toLocaleTimeString(i18n.language)}`} · {t("sessions.participantsCount", { count: s.participants })} · Code {formatCode(s.code)}
          </p>
        </div>
        <Button variant="secondary" onClick={() => download(`/api/sessions/${s.id}/export.csv`)}>
          <FileDown className="h-4 w-4" aria-hidden /> CSV
        </Button>
        <Button variant="secondary" onClick={() => download(`/api/sessions/${s.id}/export.xlsx`)}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden /> XLSX
        </Button>
        <Button variant="secondary" onClick={() => download(`/api/sessions/${s.id}/export.pdf`)}>
          <FileText className="h-4 w-4" aria-hidden /> {t("sessions.pdfReport")}
        </Button>
      </div>
      <ol className="grid gap-6 xl:grid-cols-2">
        {slides.map((slide) => {
          const Icon = SLIDE_META[slide.type].icon;
          const idx = s.slides.indexOf(slide) + 1;
          return (
            <li key={slide.id}>
              <Card className="p-3">
                <div className="mb-2 flex items-center gap-2 px-1 text-sm text-slate-500">
                  <span className="font-semibold tabular-nums">{idx}.</span>
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{t(`slideTypes.${slide.type}.name`)}</span>
                  {isInteractive(slide.type) && <span className="ml-auto tabular-nums">{t("present.responsesShort", { count: s.results[slide.id]?.voters ?? 0 })}</span>}
                </div>
                <div className="overflow-hidden rounded-lg ring-1 ring-black/10">
                  <SlideView
                    slide={slide}
                    theme={s.theme}
                    results={s.results[slide.id]}
                    showResults
                    slideState={revealedState}
                    questions={s.questions[slide.id]}
                    leaderboard={s.leaderboard}
                    responseCount={s.results[slide.id]?.voters ?? s.questions[slide.id]?.length}
                    archived
                  />
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

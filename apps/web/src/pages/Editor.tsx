import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Copy,
  FileUp,
  GripVertical,
  History,
  Loader2,
  Play,
  Plus,
  Settings2,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import {
  SLIDE_TYPES,
  safeParseSlideConfig,
  type PresentationSettings,
  type Slide,
  type SlideSettings,
  type SlideType,
  type ThemeConfig,
} from "@polldeck/shared";
import { del, get, patch, post, put } from "../lib/api";
import { Button, Field, IconButton, Input, Modal, Select, Spinner, Textarea, Toggle, cx, useErrorText, useToast } from "../components/ui";
import { SlideView } from "../slides/SlideView";
import { SLIDE_META } from "../slides/meta";
import { ConfigEditor } from "../editor/ConfigEditor";
import { ImagePicker } from "../editor/ImagePicker";

interface PresentationData {
  id: string;
  title: string;
  themeId: string | null;
  builtinTheme: string;
  theme: ThemeConfig;
  settings: PresentationSettings;
  access: "owner" | "edit" | "view";
  shares: { id: string; role: "VIEW" | "EDIT"; user: { id: string; name: string; email: string } }[];
  activeSessions: { id: string; code: string; mode: string }[];
  slides: Slide[];
}
interface ThemeItem {
  id: string;
  name: string;
  config: ThemeConfig;
  builtin: boolean;
}

/** Entfernt Eingaben, die serverseitig ungültig wären (z. B. leere Lösungen). */
function cleanConfig(slide: Slide): Slide["config"] | null {
  let cfg = slide.config as Record<string, unknown>;
  if (slide.type === "quiz_text") {
    const answers = (cfg.correctAnswers as string[]).map((s) => s.trim()).filter(Boolean);
    if (!answers.length) return null;
    cfg = { ...cfg, correctAnswers: answers };
  }
  if (slide.type === "content") cfg = { ...cfg, bullets: (cfg.bullets as string[]).slice(0, 20) };
  const parsed = safeParseSlideConfig(slide.type, cfg);
  return parsed.success ? (parsed.data as Slide["config"]) : null;
}

export function EditorPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const errText = useErrorText();
  const [p, setP] = useState<PresentationData | null>(null);
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [typePicker, setTypePicker] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Slide | null>(null);
  const [tab, setTab] = useState<"content" | "settings">("content");
  const pending = useRef<Record<string, Record<string, unknown>>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flush = useCallback(async () => {
    const batch = pending.current;
    pending.current = {};
    const ids = Object.keys(batch);
    if (!ids.length) return;
    setSaving("saving");
    try {
      await Promise.all(ids.map((sid) => put(`/api/slides/${sid}`, batch[sid])));
      setSaving("saved");
    } catch (e) {
      setSaving("error");
      toast(errText(e), "error");
    }
  }, [toast, errText]);

  /** Lädt die Präsentation neu – vorher ausstehende Änderungen speichern, damit nichts verloren geht. */
  const load = useCallback(async () => {
    clearTimeout(timer.current);
    await flush();
    const r = await get<{ presentation: PresentationData }>(`/api/presentations/${id}`);
    setP(r.presentation);
    setSelected((s) => (s && r.presentation.slides.some((x) => x.id === s) ? s : r.presentation.slides[0]?.id ?? null));
  }, [id, flush]);

  useEffect(() => {
    let cancelled = false;
    get<{ presentation: PresentationData }>(`/api/presentations/${id}`)
      .then((r) => {
        if (cancelled) return;
        setP(r.presentation);
        setSelected(r.presentation.slides[0]?.id ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        toast(errText(e), "error");
        navigate("/dashboard");
      });
    get<{ themes: ThemeItem[] }>("/api/themes").then((r) => !cancelled && setThemes(r.themes)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, navigate, toast, errText]);

  // Beim Verlassen ungespeicherte Änderungen sichern.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      flush();
    };
  }, [flush]);

  const updateSlide = (slideId: string, change: Partial<Slide>) => {
    setP((prev) => {
      if (!prev) return prev;
      const slides = prev.slides.map((s) => (s.id === slideId ? ({ ...s, ...change } as Slide) : s));
      const slide = slides.find((s) => s.id === slideId)!;
      const payload: Record<string, unknown> = { ...change };
      if ("config" in change) {
        const cleaned = cleanConfig(slide);
        if (cleaned) payload.config = cleaned;
        else delete payload.config;
      }
      if (Object.keys(payload).length) {
        pending.current[slideId] = { ...(pending.current[slideId] ?? {}), ...payload };
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, 600);
        setSaving("saving");
      }
      return { ...prev, slides };
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = async (e: DragEndEvent) => {
    if (!p || !e.over || e.active.id === e.over.id) return;
    const oldIndex = p.slides.findIndex((s) => s.id === e.active.id);
    const newIndex = p.slides.findIndex((s) => s.id === e.over!.id);
    const slides = arrayMove(p.slides, oldIndex, newIndex);
    setP({ ...p, slides });
    await put(`/api/presentations/${p.id}/slides/order`, { ids: slides.map((s) => s.id) }).catch((err) => toast(errText(err), "error"));
  };

  const addSlide = async (type: SlideType) => {
    if (!p) return;
    await flush();
    const idx = p.slides.findIndex((s) => s.id === selected);
    const r = await post<{ slide: Slide }>(`/api/presentations/${p.id}/slides`, { type, position: idx + 1 });
    const slides = [...p.slides];
    slides.splice(idx + 1, 0, r.slide);
    setP({ ...p, slides });
    setSelected(r.slide.id);
    setTypePicker(false);
    setTab("content");
  };

  const duplicateSlide = async (s: Slide) => {
    if (!p) return;
    await flush();
    const r = await post<{ slide: Slide }>(`/api/slides/${s.id}/duplicate`);
    const idx = p.slides.findIndex((x) => x.id === s.id);
    const slides = [...p.slides];
    slides.splice(idx + 1, 0, r.slide);
    setP({ ...p, slides });
    setSelected(r.slide.id);
  };

  const deleteSlide = async (s: Slide) => {
    if (!p) return;
    delete pending.current[s.id];
    await del(`/api/slides/${s.id}`);
    const idx = p.slides.findIndex((x) => x.id === s.id);
    const slides = p.slides.filter((x) => x.id !== s.id);
    setP({ ...p, slides });
    setSelected(slides[Math.max(0, idx - 1)]?.id ?? null);
    setConfirmDelete(null);
  };

  const changeType = async (s: Slide, type: SlideType) => {
    await flush();
    const r = await put<{ slide: Slide }>(`/api/slides/${s.id}`, { type });
    setP((prev) => prev && { ...prev, slides: prev.slides.map((x) => (x.id === s.id ? r.slide : x)) });
  };

  const present = async (mode: "PRESENTER" | "SURVEY") => {
    if (!p) return;
    await flush();
    try {
      const r = await post<{ id: string }>(`/api/presentations/${p.id}/sessions`, { mode });
      navigate(`/present/${r.id}`);
    } catch (e) {
      toast(errText(e), "error");
    }
  };

  const savePresentation = async (data: Partial<{ title: string; themeId: string | null; settings: Partial<PresentationSettings> }>) => {
    if (!p) return;
    try {
      await patch(`/api/presentations/${p.id}`, data);
      if (data.themeId !== undefined) {
        const theme = themes.find((x) => x.id === data.themeId)?.config ?? p.theme;
        setP({ ...p, themeId: data.themeId, theme });
      }
      if (data.settings) setP((prev) => prev && { ...prev, settings: { ...prev.settings, ...data.settings } });
    } catch (e) {
      toast(errText(e), "error");
    }
  };

  const slide = useMemo(() => p?.slides.find((s) => s.id === selected) ?? null, [p, selected]);

  if (!p) return <Spinner className="min-h-screen" />;
  const readOnly = p.access === "view";
  const currentThemeId = p.themeId ?? p.builtinTheme;

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <Link to="/dashboard" className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t("editor.back")}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Input
          aria-label={t("dashboard.titleLabel")}
          className="max-w-xs flex-1 font-semibold"
          defaultValue={p.title}
          disabled={readOnly}
          maxLength={200}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== p.title) {
              setP({ ...p, title: v });
              savePresentation({ title: v });
            }
          }}
        />
        <span className="flex items-center gap-1 text-xs text-slate-500" aria-live="polite">
          {saving === "saving" && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {t("editor.saving")}
            </>
          )}
          {saving === "saved" && (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> {t("common.saved")}
            </>
          )}
          {saving === "error" && <span className="text-red-600">{t("editor.saveError")}</span>}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Select aria-label={t("editor.theme")} className="!w-40 py-1.5" value={currentThemeId} disabled={readOnly} onChange={(e) => savePresentation({ themeId: e.target.value })}>
            {themes.map((th) => (
              <option key={th.id} value={th.id}>
                {th.name}
              </option>
            ))}
          </Select>
          {!readOnly && (
            <>
              <IconButton label={t("editor.presentationSettings")} onClick={() => setSettingsOpen(true)}>
                <Settings2 className="h-5 w-5" />
              </IconButton>
              <IconButton label={t("editor.importQuiz")} onClick={() => setImportOpen(true)}>
                <FileUp className="h-5 w-5" />
              </IconButton>
            </>
          )}
          {p.access === "owner" && (
            <IconButton label={t("editor.share")} onClick={() => setShareOpen(true)}>
              <Share2 className="h-5 w-5" />
            </IconButton>
          )}
          <Link to={`/sessions/p/${p.id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t("dashboard.results")} title={t("dashboard.results")}>
            <History className="h-5 w-5" />
          </Link>
          {!readOnly && (
            <>
              <Button variant="secondary" size="sm" onClick={() => present("SURVEY")} title={t("editor.surveyHint")}>
                <ClipboardList className="h-4 w-4" aria-hidden /> {t("editor.survey")}
              </Button>
              <Button size="sm" onClick={() => present("PRESENTER")}>
                <Play className="h-4 w-4" aria-hidden /> {p.activeSessions.length ? t("dashboard.resume") : t("dashboard.present")}
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Folienliste */}
        <nav className="flex shrink-0 flex-col border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:w-56 md:border-b-0 md:border-r" aria-label={t("editor.slides")}>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={p.slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <ol className="flex gap-2 md:flex-col">
                  {p.slides.map((s, i) => (
                    <SortableSlide
                      key={s.id}
                      slide={s}
                      index={i}
                      active={s.id === selected}
                      readOnly={readOnly}
                      onSelect={() => setSelected(s.id)}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          </div>
          {!readOnly && (
            <div className="border-t border-slate-200 p-2 dark:border-slate-800">
              <Button className="w-full" onClick={() => setTypePicker(true)}>
                <Plus className="h-4 w-4" aria-hidden /> {t("editor.addSlide")}
              </Button>
            </div>
          )}
        </nav>

        {/* Vorschau */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-auto p-4" aria-label={t("editor.preview")}>
          {slide ? (
            <div className="w-full max-w-4xl">
              <div className="overflow-hidden rounded-xl shadow-xl ring-1 ring-black/10">
                <SlideView slide={slide} theme={p.theme} preview />
              </div>
              {!readOnly && (
                <div className="mt-3 flex justify-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => duplicateSlide(slide)}>
                    <Copy className="h-4 w-4" aria-hidden /> {t("editor.duplicateSlide")}
                  </Button>
                  <Button variant="secondary" size="sm" disabled={p.slides.length <= 1} onClick={() => setConfirmDelete(slide)}>
                    <Trash2 className="h-4 w-4" aria-hidden /> {t("editor.deleteSlide")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-500">{t("editor.noSlides")}</p>
          )}
        </section>

        {/* Einstellungen */}
        {slide && (
          <aside className="flex min-h-0 shrink-0 flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:w-96 md:border-l md:border-t-0" aria-label={t("editor.slideSettings")}>
            <div role="tablist" className="flex border-b border-slate-200 dark:border-slate-800">
              {(["content", "settings"] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={cx(
                    "flex-1 border-b-2 px-4 py-2.5 text-sm font-medium",
                    tab === k ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-slate-500",
                  )}
                >
                  {k === "content" ? t("editor.tabContent") : t("editor.tabSettings")}
                </button>
              ))}
            </div>
            <fieldset disabled={readOnly} className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
              {tab === "content" ? (
                <>
                  <Field label={t("editor.slideType")}>
                    {(fid) => (
                      <Select id={fid} value={slide.type} onChange={(e) => changeType(slide, e.target.value as SlideType)}>
                        {SLIDE_TYPES.map((ty) => (
                          <option key={ty} value={ty}>
                            {t(`slideTypes.${ty}.name`)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={slide.type === "content" ? t("editor.slideTitleOptional") : t("editor.question")}>
                    {(fid) => <Input id={fid} value={slide.title} maxLength={300} onChange={(e) => updateSlide(slide.id, { title: e.target.value })} />}
                  </Field>
                  <Field label={t("editor.description")} hint={t("editor.optional")}>
                    {(fid) => (
                      <Textarea id={fid} rows={2} value={slide.description ?? ""} maxLength={2000} onChange={(e) => updateSlide(slide.id, { description: e.target.value || null })} />
                    )}
                  </Field>
                  <Field label={t("editor.image")}>
                    {() => <ImagePicker value={slide.imageUrl} label={t("editor.addImage")} onChange={(url) => updateSlide(slide.id, { imageUrl: url })} />}
                  </Field>
                  <hr className="border-slate-200 dark:border-slate-800" />
                  <ConfigEditor slide={slide} onChange={(config) => updateSlide(slide.id, { config })} />
                </>
              ) : (
                <SlideSettingsForm slide={slide} onChange={(change) => updateSlide(slide.id, change)} />
              )}
            </fieldset>
          </aside>
        )}
      </div>

      <TypePicker open={typePicker} onClose={() => setTypePicker(false)} onPick={addSlide} />
      <PresentationSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={p.settings} onChange={(s) => savePresentation({ settings: s })} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} presentation={p} onChanged={load} />
      <ImportQuizModal open={importOpen} onClose={() => setImportOpen(false)} presentationId={p.id} onImported={load} />
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t("editor.deleteSlide")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={() => confirmDelete && deleteSlide(confirmDelete)}>
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p>{t("editor.deleteSlideConfirm", { title: confirmDelete?.title || t("editor.untitledSlide") })}</p>
      </Modal>
    </div>
  );
}

function SortableSlide({ slide, index, active, onSelect, readOnly }: { slide: Slide; index: number; active: boolean; onSelect: () => void; readOnly: boolean }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id, disabled: readOnly });
  const Icon = SLIDE_META[slide.type].icon;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx("w-40 shrink-0 md:w-auto", isDragging && "z-10 opacity-80")}
    >
      <div
        className={cx(
          "group flex items-center gap-1 rounded-lg p-2 ring-1 transition",
          active ? "bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-900/30" : "bg-white ring-slate-200 hover:ring-brand-300 dark:bg-slate-900 dark:ring-slate-700",
        )}
      >
        {!readOnly && (
          <button {...attributes} {...listeners} className="cursor-grab touch-none rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label={t("editor.dragHandle", { n: index + 1 })}>
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-current={active ? "true" : undefined}>
          <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-slate-500">{index + 1}</span>
          <Icon className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{slide.title || t(`slideTypes.${slide.type}.name`)}</span>
            <span className="block truncate text-[11px] text-slate-500">{t(`slideTypes.${slide.type}.name`)}</span>
          </span>
        </button>
      </div>
    </li>
  );
}

function TypePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t: SlideType) => void }) {
  const { t } = useTranslation();
  const groups: { key: "poll" | "quiz" | "content"; label: string }[] = [
    { key: "poll", label: t("editor.groupPoll") },
    { key: "quiz", label: t("editor.groupQuiz") },
    { key: "content", label: t("editor.groupContent") },
  ];
  return (
    <Modal open={open} onClose={onClose} title={t("editor.addSlide")} wide>
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</h3>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SLIDE_TYPES.filter((ty) => SLIDE_META[ty].group === g.key).map((ty) => {
              const Icon = SLIDE_META[ty].icon;
              return (
                <button
                  key={ty}
                  onClick={() => onPick(ty)}
                  className="flex flex-col items-start gap-1 rounded-xl p-3 text-left ring-1 ring-slate-200 transition hover:bg-brand-50 hover:ring-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:ring-slate-700 dark:hover:bg-brand-900/30"
                >
                  <Icon className="h-5 w-5 text-brand-600 dark:text-brand-300" aria-hidden />
                  <span className="text-sm font-semibold">{t(`slideTypes.${ty}.name`)}</span>
                  <span className="text-xs text-slate-500">{t(`slideTypes.${ty}.desc`)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </Modal>
  );
}

function SlideSettingsForm({ slide, onChange }: { slide: Slide; onChange: (c: Partial<Slide>) => void }) {
  const { t } = useTranslation();
  const s = slide.settings;
  const set = (patch: Partial<SlideSettings>) => onChange({ settings: { ...s, ...patch } });
  const interactive = !["content", "leaderboard"].includes(slide.type);
  const isQuiz = slide.type === "quiz_choice" || slide.type === "quiz_text";
  return (
    <div className="space-y-4">
      {interactive && (
        <>
          <Toggle checked={s.hideResultsUntilReveal} onChange={(v) => set({ hideResultsUntilReveal: v })} label={t("editor.hideResults")} description={t("editor.hideResultsHint")} />
          <Toggle checked={s.showResultsToAudience} onChange={(v) => set({ showResultsToAudience: v })} label={t("editor.showResultsToAudience")} />
          {!isQuiz && slide.type !== "qa" && (
            <>
              <Toggle checked={s.allowMultipleSubmissions} onChange={(v) => set({ allowMultipleSubmissions: v })} label={t("editor.allowMultiple")} />
              {s.allowMultipleSubmissions && (
                <Field label={t("editor.responseLimit")} hint={t("editor.responseLimitHint")}>
                  {(id) => (
                    <Input id={id} type="number" min={1} max={100} value={s.responseLimit ?? ""} onChange={(e) => set({ responseLimit: e.target.value ? Math.min(100, Math.max(1, Number(e.target.value))) : null })} />
                  )}
                </Field>
              )}
            </>
          )}
          {(slide.type === "open_ended" || slide.type === "qa") && (
            <Toggle checked={s.moderation} onChange={(v) => set({ moderation: v })} label={t("editor.moderation")} description={t("editor.moderationHint")} />
          )}
          {(isQuiz || s.timerSeconds !== null) && (
            <Toggle
              checked={s.revealOnTimerEnd}
              onChange={(v) => set({ revealOnTimerEnd: v })}
              label={t("editor.revealOnTimerEnd")}
              description={s.revealOnTimerEnd ? t("editor.revealOnTimerEndOn") : t("editor.revealOnTimerEndOff")}
            />
          )}
          {!isQuiz && (
            <Field label={t("editor.timer")} hint={t("editor.timerHint")}>
              {(id) => (
                <Input id={id} type="number" min={5} max={3600} value={s.timerSeconds ?? ""} onChange={(e) => set({ timerSeconds: e.target.value ? Math.min(3600, Math.max(5, Number(e.target.value))) : null })} />
              )}
            </Field>
          )}
          <hr className="border-slate-200 dark:border-slate-800" />
        </>
      )}
      <Field label={t("editor.backgroundColor")}>
        {(id) => (
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="color"
              className="h-9 w-14 cursor-pointer rounded border border-slate-300"
              value={slide.background.color || "#101425"}
              onChange={(e) => onChange({ background: { ...slide.background, color: e.target.value } })}
            />
            {slide.background.color && (
              <Button size="sm" variant="ghost" onClick={() => onChange({ background: { ...slide.background, color: null } })}>
                {t("editor.useThemeColor")}
              </Button>
            )}
          </div>
        )}
      </Field>
      <Field label={t("editor.backgroundImage")}>
        {() => <ImagePicker value={slide.background.imageUrl} label={t("editor.addImage")} onChange={(url) => onChange({ background: { ...slide.background, imageUrl: url } })} />}
      </Field>
      <Field label={t("editor.notes")} hint={t("editor.notesHint")}>
        {(id) => <Textarea id={id} rows={5} value={slide.notes ?? ""} maxLength={10000} onChange={(e) => onChange({ notes: e.target.value || null })} />}
      </Field>
    </div>
  );
}

function PresentationSettingsModal({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: PresentationSettings;
  onChange: (s: Partial<PresentationSettings>) => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t("editor.presentationSettings")}>
      <Toggle checked={settings.showJoinBanner} onChange={(v) => onChange({ showJoinBanner: v })} label={t("editor.showJoinBanner")} />
      <Toggle checked={settings.reactionsEnabled} onChange={(v) => onChange({ reactionsEnabled: v })} label={t("editor.reactions")} />
      <Toggle checked={settings.showParticipantCount} onChange={(v) => onChange({ showParticipantCount: v })} label={t("editor.showParticipantCount")} />
      <Toggle checked={settings.requireNames} onChange={(v) => onChange({ requireNames: v })} label={t("editor.requireNames")} description={t("editor.requireNamesHint")} />
      <Toggle checked={settings.autoLeaderboard} onChange={(v) => onChange({ autoLeaderboard: v })} label={t("editor.autoLeaderboard")} />
    </Modal>
  );
}

function ShareModal({ open, onClose, presentation, onChanged }: { open: boolean; onClose: () => void; presentation: PresentationData; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"VIEW" | "EDIT">("VIEW");
  return (
    <Modal open={open} onClose={onClose} title={t("editor.share")}>
      <p className="text-sm text-slate-500">{t("editor.shareHint")}</p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await post(`/api/presentations/${presentation.id}/shares`, { email, role });
            setEmail("");
            onChanged();
          } catch (err) {
            toast(errText(err), "error");
          }
        }}
      >
        <Input type="email" required placeholder={t("auth.email")} aria-label={t("auth.email")} className="min-w-0 flex-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select aria-label={t("editor.permission")} className="!w-36" value={role} onChange={(e) => setRole(e.target.value as "VIEW" | "EDIT")}>
          <option value="VIEW">{t("editor.canView")}</option>
          <option value="EDIT">{t("editor.canEdit")}</option>
        </Select>
        <Button type="submit">{t("editor.invite")}</Button>
      </form>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {presentation.shares.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
            <Users className="h-4 w-4 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {s.user.name} <span className="text-slate-500">({s.user.email})</span>
            </span>
            <Select
              aria-label={t("editor.permission")}
              className="!w-32 py-1"
              value={s.role}
              onChange={async (e) => {
                await post(`/api/presentations/${presentation.id}/shares`, { email: s.user.email, role: e.target.value });
                onChanged();
              }}
            >
              <option value="VIEW">{t("editor.canView")}</option>
              <option value="EDIT">{t("editor.canEdit")}</option>
            </Select>
            <IconButton
              label={t("common.remove")}
              onClick={async () => {
                await del(`/api/presentations/${presentation.id}/shares/${s.id}`);
                onChanged();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </li>
        ))}
        {!presentation.shares.length && <li className="py-2 text-sm text-slate-500">{t("editor.notShared")}</li>}
      </ul>
    </Modal>
  );
}

function ImportQuizModal({ open, onClose, presentationId, onImported }: { open: boolean; onClose: () => void; presentationId: string; onImported: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const [busy, setBusy] = useState(false);
  const example = `type;question;answer1;answer2;answer3;answer4;correct;time
choice;Was ist 7 × 8?;54;56;58;64;2;20
text;Hauptstadt von Frankreich?;Paris;;;;;30`;
  return (
    <Modal open={open} onClose={onClose} title={t("editor.importQuiz")} wide>
      <p className="text-sm">{t("editor.importHint")}</p>
      <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800">{example}</pre>
      <p className="text-xs text-slate-500">{t("editor.importFormat")}</p>
      <div className="flex flex-wrap gap-2">
        <a className="text-sm text-brand-600 underline dark:text-brand-300" href="/beispiel-quiz.csv" download>
          {t("editor.exampleCsv")}
        </a>
        <a className="text-sm text-brand-600 underline dark:text-brand-300" href="/beispiel-quiz.json" download>
          {t("editor.exampleJson")}
        </a>
      </div>
      <input
        type="file"
        accept=".csv,.json,text/csv,application/json"
        aria-label={t("editor.chooseFile")}
        disabled={busy}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            const content = await f.text();
            const format = f.name.toLowerCase().endsWith(".json") ? "json" : "csv";
            const r = await post<{ imported: number }>(`/api/presentations/${presentationId}/import-quiz`, { content, format });
            toast(t("editor.imported", { count: r.imported }), "success");
            onImported();
            onClose();
          } catch (err) {
            const line = (err as { details?: { line?: number } }).details?.line;
            toast(`${errText(err)}${line ? ` (${t("editor.line", { n: line })})` : ""}`, "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </Modal>
  );
}

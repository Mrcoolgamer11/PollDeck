import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Palette, Plus, Trash2 } from "lucide-react";
import { slideSettingsSchema, themeConfigSchema, type Slide, type ThemeConfig } from "@polldeck/shared";
import { del, get, post, put } from "../lib/api";
import { Button, Card, Field, IconButton, Input, Select, Spinner, cx, useErrorText, useToast } from "../components/ui";
import { SlideView } from "../slides/SlideView";
import { ImagePicker } from "../editor/ImagePicker";

interface ThemeItem {
  id: string;
  name: string;
  config: ThemeConfig;
  builtin: boolean;
}

const sampleSlide: Slide = {
  id: "sample",
  type: "multiple_choice",
  position: 0,
  title: "",
  background: {},
  settings: slideSettingsSchema.parse({}),
  config: {
    options: [
      { id: "a", label: "A", imageUrl: null },
      { id: "b", label: "B", imageUrl: null },
      { id: "c", label: "C", imageUrl: null },
      { id: "d", label: "D", imageUrl: null },
    ],
    multiSelect: false,
    chartType: "bar",
  },
};

export function ThemesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const [themes, setThemes] = useState<ThemeItem[] | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string; config: ThemeConfig } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => get<{ themes: ThemeItem[] }>("/api/themes").then((r) => setThemes(r.themes)), []);
  useEffect(() => {
    load();
  }, [load]);

  const preview = useMemo(
    () => ({
      ...sampleSlide,
      title: t("themes.sampleQuestion"),
    }),
    [t],
  );

  if (!themes) return <Spinner />;
  const set = (patch: Partial<ThemeConfig>) => setEditing((e) => e && { ...e, config: { ...e.config, ...patch } });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Palette className="h-6 w-6" aria-hidden /> {t("themes.title")}
        </h1>
        <Button onClick={() => setEditing({ name: t("themes.newName"), config: themeConfigSchema.parse({}) })}>
          <Plus className="h-4 w-4" aria-hidden /> {t("themes.new")}
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <ul className="grid content-start gap-4 sm:grid-cols-2">
          {themes.map((th) => (
            <li key={th.id}>
              <Card className={cx("space-y-3", editing?.id === th.id && "ring-2 ring-brand-600")}>
                <div className="overflow-hidden rounded-lg ring-1 ring-black/10">
                  <SlideView slide={{ ...preview, title: th.name }} theme={th.config} preview results={{ kind: "choice", counts: { a: 5, b: 9, c: 3, d: 6 }, voters: 23 }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{th.name}</span>
                  {th.builtin ? (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{t("themes.builtin")}</span>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setEditing({ id: th.id, name: th.name, config: th.config })}>
                        {t("dashboard.edit")}
                      </Button>
                      <IconButton
                        label={t("common.delete")}
                        onClick={async () => {
                          await del(`/api/themes/${th.id}`);
                          if (editing?.id === th.id) setEditing(null);
                          load();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </>
                  )}
                  {th.builtin && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ name: `${th.name} (${t("themes.copy")})`, config: th.config })}>
                      {t("themes.duplicate")}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>

        {editing && (
          <Card className="space-y-4 self-start lg:sticky lg:top-20">
            <h2 className="font-semibold">{editing.id ? t("themes.edit") : t("themes.new")}</h2>
            <div className="overflow-hidden rounded-lg ring-1 ring-black/10">
              <SlideView
                slide={{ ...preview, title: editing.name }}
                theme={editing.config}
                preview
                results={{ kind: "choice", counts: { a: 5, b: 9, c: 3, d: 6 }, voters: 23 }}
              />
            </div>
            <Field label={t("common.name")}>{(id) => <Input id={id} value={editing.name} maxLength={60} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("themes.mode")}>
                {(id) => (
                  <Select id={id} value={editing.config.mode} onChange={(e) => set({ mode: e.target.value as ThemeConfig["mode"] })}>
                    <option value="dark">{t("themes.dark")}</option>
                    <option value="light">{t("themes.light")}</option>
                  </Select>
                )}
              </Field>
              <Field label={t("themes.font")}>
                {(id) => (
                  <Select id={id} value={editing.config.font} onChange={(e) => set({ font: e.target.value as ThemeConfig["font"] })}>
                    <option value="inter">Inter</option>
                    <option value="rounded">Nunito</option>
                    <option value="serif">Serif</option>
                    <option value="mono">Mono</option>
                  </Select>
                )}
              </Field>
              {(["background", "text", "accent"] as const).map((k) => (
                <Field key={k} label={t(`themes.${k}`)}>
                  {(id) => (
                    <input id={id} type="color" className="h-10 w-full cursor-pointer rounded border border-slate-300" value={editing.config[k]} onChange={(e) => set({ [k]: e.target.value })} />
                  )}
                </Field>
              ))}
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">{t("themes.chartColors")}</legend>
              <div className="flex flex-wrap gap-2">
                {editing.config.chartColors.map((c, i) => (
                  <input
                    key={i}
                    type="color"
                    aria-label={t("themes.chartColorN", { n: i + 1 })}
                    className="h-9 w-9 cursor-pointer rounded border border-slate-300"
                    value={c}
                    onChange={(e) => set({ chartColors: editing.config.chartColors.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                ))}
              </div>
            </fieldset>
            <Field label={t("themes.logo")} hint={t("themes.logoHint")}>
              {() => <ImagePicker value={editing.config.logoUrl} label={t("editor.addImage")} onChange={(url) => set({ logoUrl: url })} />}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (editing.id) await put(`/api/themes/${editing.id}`, { name: editing.name, config: editing.config });
                    else {
                      const r = await post<{ id: string }>("/api/themes", { name: editing.name, config: editing.config });
                      setEditing({ ...editing, id: r.id });
                    }
                    toast(t("common.saved"), "success");
                    load();
                  } catch (e) {
                    toast(errText(e), "error");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("common.save")}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

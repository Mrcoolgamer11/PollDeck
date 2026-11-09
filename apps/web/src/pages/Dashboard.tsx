import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Copy,
  Download,
  Folder,
  FolderPlus,
  History,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { del, download, get, patch, post } from "../lib/api";
import { Button, Card, EmptyState, Field, IconButton, Input, Modal, Select, Spinner, cx, useErrorText, useToast } from "../components/ui";

interface PresentationItem {
  id: string;
  title: string;
  folderId: string | null;
  updatedAt: string;
  owner: string;
  access: "owner" | "edit" | "view";
  slideCount: number;
  sessionCount: number;
  activeSession: { id: string; code: string } | null;
}
interface FolderItem {
  id: string;
  name: string;
  _count: { presentations: number };
}
interface TemplateItem {
  id: string;
  name: { de: string; en: string };
  description: { de: string; en: string };
  slideCount: number;
}

type Filter = { kind: "all" } | { kind: "shared" } | { kind: "folder"; id: string } | { kind: "unfiled" };

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const errText = useErrorText();
  const [items, setItems] = useState<PresentationItem[] | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [createOpen, setCreateOpen] = useState(false);
  const [folderModal, setFolderModal] = useState<{ id?: string; name: string } | null>(null);
  const [moveItem, setMoveItem] = useState<PresentationItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PresentationItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lang = (i18n.language === "en" ? "en" : "de") as "de" | "en";

  const load = useCallback(async () => {
    const [p, f] = await Promise.all([
      get<{ presentations: PresentationItem[] }>(`/api/presentations${q ? `?q=${encodeURIComponent(q)}` : ""}`),
      get<{ folders: FolderItem[] }>("/api/folders"),
    ]);
    setItems(p.presentations);
    setFolders(f.folders);
  }, [q]);

  useEffect(() => {
    const h = setTimeout(() => load().catch((e) => toast(errText(e), "error")), q ? 250 : 0);
    return () => clearTimeout(h);
  }, [load, q, toast, errText]);

  useEffect(() => {
    get<{ templates: TemplateItem[] }>("/api/templates").then((r) => setTemplates(r.templates)).catch(() => undefined);
  }, []);

  const visible = useMemo(() => {
    if (!items) return [];
    switch (filter.kind) {
      case "shared":
        return items.filter((p) => p.access !== "owner");
      case "folder":
        return items.filter((p) => p.folderId === filter.id);
      case "unfiled":
        return items.filter((p) => p.access === "owner" && !p.folderId);
      default:
        return items;
    }
  }, [items, filter]);

  const startSession = async (p: PresentationItem) => {
    try {
      const r = await post<{ id: string }>(`/api/presentations/${p.id}/sessions`, { mode: "PRESENTER" });
      navigate(`/present/${r.id}`);
    } catch (e) {
      toast(errText(e), "error");
    }
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const r = await post<{ id: string }>("/api/presentations/import", data);
      toast(t("dashboard.imported"), "success");
      navigate(`/edit/${r.id}`);
    } catch (e) {
      toast(e instanceof SyntaxError ? t("errors.invalid_json") : errText(e), "error");
    }
  };

  const sideLink = (active: boolean) =>
    cx(
      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm",
      active ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "hover:bg-slate-100 dark:hover:bg-slate-800",
    );

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-60 lg:shrink-0" aria-label={t("dashboard.folders")}>
        <div className="space-y-1">
          <button className={sideLink(filter.kind === "all")} onClick={() => setFilter({ kind: "all" })}>
            <span>{t("dashboard.all")}</span>
            <span className="text-xs text-slate-500">{items?.length ?? ""}</span>
          </button>
          <button className={sideLink(filter.kind === "unfiled")} onClick={() => setFilter({ kind: "unfiled" })}>
            <span>{t("dashboard.unfiled")}</span>
          </button>
          <button className={sideLink(filter.kind === "shared")} onClick={() => setFilter({ kind: "shared" })}>
            <span className="inline-flex items-center gap-2">
              <Users className="h-4 w-4" aria-hidden /> {t("dashboard.shared")}
            </span>
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between px-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("dashboard.folders")}</h2>
          <IconButton label={t("dashboard.newFolder")} onClick={() => setFolderModal({ name: "" })}>
            <FolderPlus className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="mt-1 space-y-1">
          {folders.map((f) => (
            <div key={f.id} className="group flex items-center">
              <button
                className={sideLink(filter.kind === "folder" && filter.id === f.id)}
                onClick={() => setFilter({ kind: "folder", id: f.id })}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Folder className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{f.name}</span>
                </span>
                <span className="text-xs text-slate-500">{f._count.presentations}</span>
              </button>
              <IconButton label={t("common.rename")} className="opacity-0 focus:opacity-100 group-hover:opacity-100" onClick={() => setFolderModal({ id: f.id, name: f.name })}>
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          ))}
          {!folders.length && <p className="px-3 text-xs text-slate-500">{t("dashboard.noFolders")}</p>}
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-2xl font-bold">{t("dashboard.title")}</h1>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              type="search"
              placeholder={t("dashboard.search")}
              aria-label={t("dashboard.search")}
              className="w-56 pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden /> {t("dashboard.importJson")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = "";
            }}
          />
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> {t("dashboard.new")}
          </Button>
        </div>

        {!items ? (
          <Spinner />
        ) : !visible.length ? (
          <EmptyState icon={<BarChart3 className="h-10 w-10" />} title={t("dashboard.empty")}>
            <Button className="mt-3" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> {t("dashboard.new")}
            </Button>
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((p) => (
              <li key={p.id}>
                <PresentationCard
                  p={p}
                  onPresent={() => startSession(p)}
                  onDuplicate={async () => {
                    await post(`/api/presentations/${p.id}/duplicate`);
                    toast(t("dashboard.duplicated"), "success");
                    load();
                  }}
                  onMove={() => setMoveItem(p)}
                  onExport={() => download(`/api/presentations/${p.id}/export`)}
                  onDelete={() => setConfirmDelete(p)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        templates={templates}
        lang={lang}
        folderId={filter.kind === "folder" ? filter.id : null}
        onCreated={(id) => navigate(`/edit/${id}`)}
      />

      <Modal
        open={!!folderModal}
        onClose={() => setFolderModal(null)}
        title={folderModal?.id ? t("dashboard.renameFolder") : t("dashboard.newFolder")}
        footer={
          <>
            {folderModal?.id && (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={async () => {
                  await del(`/api/folders/${folderModal.id}`);
                  setFolderModal(null);
                  setFilter({ kind: "all" });
                  load();
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> {t("common.delete")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setFolderModal(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!folderModal?.name.trim()}
              onClick={async () => {
                if (!folderModal) return;
                if (folderModal.id) await patch(`/api/folders/${folderModal.id}`, { name: folderModal.name });
                else await post("/api/folders", { name: folderModal.name });
                setFolderModal(null);
                load();
              }}
            >
              {t("common.save")}
            </Button>
          </>
        }
      >
        <Field label={t("common.name")}>
          {(id) => (
            <Input id={id} value={folderModal?.name ?? ""} maxLength={100} onChange={(e) => setFolderModal((f) => f && { ...f, name: e.target.value })} />
          )}
        </Field>
      </Modal>

      <Modal open={!!moveItem} onClose={() => setMoveItem(null)} title={t("dashboard.moveTo")}>
        <Select
          aria-label={t("dashboard.folders")}
          value={moveItem?.folderId ?? ""}
          onChange={async (e) => {
            if (!moveItem) return;
            await patch(`/api/presentations/${moveItem.id}`, { folderId: e.target.value || null });
            setMoveItem(null);
            load();
          }}
        >
          <option value="">{t("dashboard.noFolder")}</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t("dashboard.deleteTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirmDelete) return;
                await del(`/api/presentations/${confirmDelete.id}`);
                setConfirmDelete(null);
                load();
              }}
            >
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p>{t("dashboard.deleteConfirm", { title: confirmDelete?.title })}</p>
      </Modal>
    </div>
  );
}

function PresentationCard({
  p,
  onPresent,
  onDuplicate,
  onMove,
  onExport,
  onDelete,
}: {
  p: PresentationItem;
  onPresent: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);
  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800";
  return (
    <Card className="flex h-full flex-col">
      <div className="mb-3 flex items-start gap-2">
        <Link to={p.access === "view" ? `/sessions/p/${p.id}` : `/edit/${p.id}`} className="min-w-0 flex-1">
          <h2 className="line-clamp-2 font-semibold hover:text-brand-600">{p.title}</h2>
        </Link>
        <div className="relative" ref={menuRef}>
          <IconButton label={t("common.more")} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <MoreVertical className="h-4 w-4" />
          </IconButton>
          {menu && (
            <div role="menu" className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
              <button role="menuitem" className={item} onClick={() => (setMenu(false), onDuplicate())}>
                <Copy className="h-4 w-4" aria-hidden /> {t("dashboard.duplicate")}
              </button>
              {p.access === "owner" && (
                <button role="menuitem" className={item} onClick={() => (setMenu(false), onMove())}>
                  <Folder className="h-4 w-4" aria-hidden /> {t("dashboard.moveTo")}
                </button>
              )}
              <Link role="menuitem" className={item} to={`/sessions/p/${p.id}`}>
                <History className="h-4 w-4" aria-hidden /> {t("dashboard.results")}
              </Link>
              <button role="menuitem" className={item} onClick={() => (setMenu(false), onExport())}>
                <Download className="h-4 w-4" aria-hidden /> {t("dashboard.exportJson")}
              </button>
              {p.access === "owner" && (
                <button role="menuitem" className={cx(item, "text-red-600")} onClick={() => (setMenu(false), onDelete())}>
                  <Trash2 className="h-4 w-4" aria-hidden /> {t("common.delete")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("dashboard.slides", { count: p.slideCount })} · {t("dashboard.sessions", { count: p.sessionCount })}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {p.access !== "owner" && <>{t("dashboard.by", { name: p.owner })} · </>}
        {t("dashboard.updated", { date: new Date(p.updatedAt).toLocaleDateString(i18n.language) })}
      </p>
      {p.activeSession && (
        <p className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> {t("dashboard.live", { code: p.activeSession.code })}
        </p>
      )}
      <div className="mt-auto flex gap-2 pt-4">
        {p.access !== "view" && (
          <>
            <Link
              to={`/edit/${p.id}`}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50 dark:ring-slate-600 dark:hover:bg-slate-800"
            >
              <Pencil className="h-4 w-4" aria-hidden /> {t("dashboard.edit")}
            </Link>
            <Button size="sm" className="flex-1" onClick={onPresent}>
              <Play className="h-4 w-4" aria-hidden /> {p.activeSession ? t("dashboard.resume") : t("dashboard.present")}
            </Button>
          </>
        )}
        {p.access === "view" && (
          <Link to={`/sessions/p/${p.id}`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 dark:ring-slate-600">
            <History className="h-4 w-4" aria-hidden /> {t("dashboard.results")}
          </Link>
        )}
      </div>
    </Card>
  );
}

function CreateModal({
  open,
  onClose,
  templates,
  lang,
  folderId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  templates: TemplateItem[];
  lang: "de" | "en";
  folderId: string | null;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const errText = useErrorText();
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setTitle("");
      setTemplate("");
      setError("");
    }
  }, [open]);
  const create = async () => {
    setBusy(true);
    try {
      const tpl = templates.find((x) => x.id === template);
      const r = await post<{ id: string }>("/api/presentations", {
        title: title.trim() || (tpl ? tpl.name[lang] : t("dashboard.untitled")),
        templateId: template || undefined,
        folderId,
      });
      onCreated(r.id);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const tile = (active: boolean) =>
    cx(
      "rounded-xl p-3 text-left ring-1 transition",
      active ? "bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-900/30" : "ring-slate-200 hover:ring-brand-300 dark:ring-slate-700",
    );
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t("dashboard.new")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={create} loading={busy}>
            {t("dashboard.create")}
          </Button>
        </>
      }
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Field label={t("dashboard.titleLabel")}>
        {(id) => (
          <Input id={id} value={title} maxLength={200} placeholder={t("dashboard.untitled")} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        )}
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("dashboard.template")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" aria-pressed={!template} className={tile(!template)} onClick={() => setTemplate("")}>
            <div className="font-semibold">{t("dashboard.blank")}</div>
            <div className="text-xs text-slate-500">{t("dashboard.blankDesc")}</div>
          </button>
          {templates.map((tpl) => (
            <button key={tpl.id} type="button" aria-pressed={template === tpl.id} className={tile(template === tpl.id)} onClick={() => setTemplate(tpl.id)}>
              <div className="font-semibold">{tpl.name[lang]}</div>
              <div className="text-xs text-slate-500">
                {tpl.description[lang]} · {t("dashboard.slides", { count: tpl.slideCount })}
              </div>
            </button>
          ))}
        </div>
      </fieldset>
    </Modal>
  );
}

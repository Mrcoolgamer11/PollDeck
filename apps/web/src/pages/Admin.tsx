import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, RefreshCw, Shield, Trash2, UserPlus } from "lucide-react";
import type { InstanceSettings } from "@polldeck/shared";
import { del, get, patch, post, put, uploadImage } from "../lib/api";
import { useApp } from "../lib/app";
import { Button, Card, Field, IconButton, Input, Modal, Select, Spinner, Textarea, Toggle, cx, useErrorText, useToast } from "../components/ui";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "PRESENTER";
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  sso: boolean;
  presentations: number;
}
interface Stats {
  users: number;
  presentations: number;
  sessionsTotal: number;
  responses: number;
  activeSessions: { id: string; code: string; mode: string; startedAt: string; title: string; owner: string; participants: number; responses: number; online: number }[];
  storage: { database: number; uploads: number };
}

const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
};

export function AdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"overview" | "users" | "invites" | "settings">("overview");
  const tabs = [
    ["overview", t("admin.overview")],
    ["users", t("admin.users")],
    ["invites", t("admin.invites")],
    ["settings", t("admin.settings")],
  ] as const;
  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold">
        <Shield className="h-6 w-6" aria-hidden /> {t("admin.title")}
      </h1>
      <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              tab === k ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "overview" && <Overview />}
        {tab === "users" && <Users />}
        {tab === "invites" && <Invites />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

function Overview() {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<Stats | null>(null);
  const load = useCallback(() => get<Stats>("/api/admin/stats").then(setS), []);
  useEffect(() => {
    load();
    const h = setInterval(load, 10000);
    return () => clearInterval(h);
  }, [load]);
  if (!s) return <Spinner />;
  const tiles = [
    [t("admin.statUsers"), s.users],
    [t("admin.statPresentations"), s.presentations],
    [t("admin.statSessions"), s.sessionsTotal],
    [t("admin.statResponses"), s.responses],
    [t("admin.statDatabase"), fmtBytes(s.storage.database)],
    [t("admin.statUploads"), fmtBytes(s.storage.uploads)],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([label, value]) => (
          <Card key={String(label)}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t("admin.activeSessions")}</h2>
          <IconButton label={t("common.refresh")} onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </IconButton>
        </div>
        {!s.activeSessions.length ? (
          <p className="text-sm text-slate-500">{t("admin.noActiveSessions")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">{t("admin.colPresentation")}</th>
                  <th className="py-2 pr-3">{t("admin.colOwner")}</th>
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">{t("admin.colOnline")}</th>
                  <th className="py-2 pr-3">{t("admin.colParticipants")}</th>
                  <th className="py-2 pr-3">{t("admin.colResponses")}</th>
                  <th className="py-2">{t("admin.colStarted")}</th>
                </tr>
              </thead>
              <tbody>
                {s.activeSessions.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3 font-medium">{a.title}</td>
                    <td className="py-2 pr-3">{a.owner}</td>
                    <td className="py-2 pr-3 tabular-nums">{a.code}</td>
                    <td className="py-2 pr-3 tabular-nums">{a.online}</td>
                    <td className="py-2 pr-3 tabular-nums">{a.participants}</td>
                    <td className="py-2 pr-3 tabular-nums">{a.responses}</td>
                    <td className="py-2">{new Date(a.startedAt).toLocaleString(i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Users() {
  const { t, i18n } = useTranslation();
  const { user: me } = useApp();
  const toast = useToast();
  const errText = useErrorText();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "PRESENTER" });
  const [confirm, setConfirm] = useState<AdminUser | null>(null);
  const load = useCallback(() => get<{ users: AdminUser[] }>("/api/admin/users").then((r) => setUsers(r.users)), []);
  useEffect(() => {
    load();
  }, [load]);
  const update = async (u: AdminUser, data: Partial<AdminUser>) => {
    try {
      await patch(`/api/admin/users/${u.id}`, data);
      load();
    } catch (e) {
      toast(errText(e), "error");
    }
  };
  if (!users) return <Spinner />;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{t("admin.users")}</h2>
        <Button size="sm" onClick={() => setCreate(true)}>
          <UserPlus className="h-4 w-4" aria-hidden /> {t("admin.createUser")}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">{t("common.name")}</th>
              <th className="py-2 pr-3">{t("auth.email")}</th>
              <th className="py-2 pr-3">{t("admin.role")}</th>
              <th className="py-2 pr-3">{t("admin.colPresentations")}</th>
              <th className="py-2 pr-3">{t("admin.lastLogin")}</th>
              <th className="py-2 pr-3">{t("admin.status")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-3 font-medium">
                  {u.name} {u.sso && <span className="ml-1 rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">SSO</span>}
                </td>
                <td className="py-2 pr-3">{u.email}</td>
                <td className="py-2 pr-3">
                  <Select
                    aria-label={t("admin.role")}
                    className="py-1"
                    value={u.role}
                    disabled={u.id === me?.id}
                    onChange={(e) => update(u, { role: e.target.value as AdminUser["role"] })}
                  >
                    <option value="PRESENTER">{t("admin.rolePresenter")}</option>
                    <option value="ADMIN">{t("admin.roleAdmin")}</option>
                  </Select>
                </td>
                <td className="py-2 pr-3 tabular-nums">{u.presentations}</td>
                <td className="py-2 pr-3">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString(i18n.language) : "–"}</td>
                <td className="py-2 pr-3">
                  <Button size="sm" variant={u.disabled ? "danger" : "secondary"} disabled={u.id === me?.id} onClick={() => update(u, { disabled: !u.disabled })}>
                    {u.disabled ? t("admin.locked") : t("admin.active")}
                  </Button>
                </td>
                <td className="py-2 text-right">
                  <IconButton label={t("common.delete")} disabled={u.id === me?.id} onClick={() => setConfirm(u)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={create}
        onClose={() => setCreate(false)}
        title={t("admin.createUser")}
        footer={
          <Button
            onClick={async () => {
              try {
                await post("/api/admin/users", form);
                setCreate(false);
                setForm({ name: "", email: "", password: "", role: "PRESENTER" });
                load();
              } catch (e) {
                toast(errText(e), "error");
              }
            }}
          >
            {t("common.create")}
          </Button>
        }
      >
        <Field label={t("common.name")}>{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label={t("auth.email")}>{(id) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label={t("auth.password")} hint={t("auth.passwordHint")}>
          {(id) => <Input id={id} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <Field label={t("admin.role")}>
          {(id) => (
            <Select id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="PRESENTER">{t("admin.rolePresenter")}</option>
              <option value="ADMIN">{t("admin.roleAdmin")}</option>
            </Select>
          )}
        </Field>
      </Modal>
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t("admin.deleteUser")}
        footer={
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await del(`/api/admin/users/${confirm!.id}`);
                setConfirm(null);
                load();
              } catch (e) {
                toast(errText(e), "error");
              }
            }}
          >
            {t("common.delete")}
          </Button>
        }
      >
        <p>{t("admin.deleteUserConfirm", { name: confirm?.name, email: confirm?.email })}</p>
      </Modal>
    </Card>
  );
}

function Invites() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const { config } = useApp();
  const [invites, setInvites] = useState<{ id: string; email: string | null; role: string; expiresAt: string }[]>([]);
  const [form, setForm] = useState({ email: "", role: "PRESENTER", sendMail: false });
  const [link, setLink] = useState("");
  const load = useCallback(() => get<{ invites: typeof invites }>("/api/admin/invites").then((r) => setInvites(r.invites)), []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <h2 className="font-semibold">{t("admin.createInvite")}</h2>
        <Field label={t("admin.inviteEmail")} hint={t("admin.inviteEmailHint")}>
          {(id) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field label={t("admin.role")}>
          {(id) => (
            <Select id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="PRESENTER">{t("admin.rolePresenter")}</option>
              <option value="ADMIN">{t("admin.roleAdmin")}</option>
            </Select>
          )}
        </Field>
        <Toggle
          checked={form.sendMail}
          disabled={!config?.mailEnabled || !form.email}
          onChange={(v) => setForm({ ...form, sendMail: v })}
          label={t("admin.sendInviteMail")}
          description={!config?.mailEnabled ? t("auth.mailDisabled") : undefined}
        />
        <Button
          onClick={async () => {
            try {
              const r = await post<{ link: string; mailed: boolean }>("/api/admin/invites", { ...form, email: form.email || undefined });
              setLink(r.link);
              if (r.mailed) toast(t("admin.inviteMailed"), "success");
              load();
            } catch (e) {
              toast(errText(e), "error");
            }
          }}
        >
          {t("admin.createInvite")}
        </Button>
        {link && (
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
            <p className="mb-1 text-xs text-slate-500">{t("admin.inviteLink")}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all text-xs">{link}</code>
              <IconButton
                label={t("common.copy")}
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  toast(t("common.copied"), "success");
                }}
              >
                <Copy className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">{t("admin.openInvites")}</h2>
        {!invites.length && <p className="text-sm text-slate-500">{t("admin.noInvites")}</p>}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium">{i.email ?? t("admin.anyEmail")}</div>
                <div className="text-xs text-slate-500">
                  {i.role === "ADMIN" ? t("admin.roleAdmin") : t("admin.rolePresenter")} · {t("admin.expires", { date: new Date(i.expiresAt).toLocaleDateString(i18n.language) })}
                </div>
              </div>
              <IconButton label={t("common.delete")} onClick={async () => (await del(`/api/admin/invites/${i.id}`), load())}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function SettingsTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const errText = useErrorText();
  const { refresh } = useApp();
  const [s, setS] = useState<InstanceSettings | null>(null);
  const [defaults, setDefaults] = useState<string[]>([]);
  const [filterText, setFilterText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    get<{ settings: InstanceSettings; defaultWordFilter: string[] }>("/api/admin/settings").then((r) => {
      setS(r.settings);
      setDefaults(r.defaultWordFilter);
      setFilterText(r.settings.wordFilter.join("\n"));
    });
  }, []);
  if (!s) return <Spinner />;
  const save = async () => {
    setBusy(true);
    try {
      const wordFilter = [...new Set(filterText.split(/[\n,]/).map((w) => w.trim()).filter(Boolean))];
      const r = await put<{ settings: InstanceSettings }>("/api/admin/settings", { ...s, wordFilter });
      setS(r.settings);
      await refresh();
      toast(t("common.saved"), "success");
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <h2 className="font-semibold">{t("admin.instance")}</h2>
        <Field label={t("admin.appName")}>{(id) => <Input id={id} value={s.appName} maxLength={60} onChange={(e) => setS({ ...s, appName: e.target.value })} />}</Field>
        <Field label={t("admin.logo")}>
          {(id) => (
            <div className="flex items-center gap-3">
              {s.logoUrl && <img src={s.logoUrl} alt="" className="h-10 w-10 rounded object-contain ring-1 ring-slate-200" />}
              <input
                id={id}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="text-sm"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setS({ ...s, logoUrl: await uploadImage(f) });
                  } catch (err) {
                    toast(errText(err), "error");
                  }
                }}
              />
              {s.logoUrl && (
                <Button size="sm" variant="ghost" onClick={() => setS({ ...s, logoUrl: null })}>
                  {t("common.remove")}
                </Button>
              )}
            </div>
          )}
        </Field>
        <Field label={t("admin.defaultLocale")}>
          {(id) => (
            <Select id={id} value={s.defaultLocale} onChange={(e) => setS({ ...s, defaultLocale: e.target.value as "de" | "en" })}>
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </Select>
          )}
        </Field>
        <Field label={t("admin.registration")}>
          {(id) => (
            <Select id={id} value={s.registrationMode} onChange={(e) => setS({ ...s, registrationMode: e.target.value as InstanceSettings["registrationMode"] })}>
              <option value="open">{t("admin.regOpen")}</option>
              <option value="invite">{t("admin.regInvite")}</option>
              <option value="closed">{t("admin.regClosed")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("admin.maxUpload")}>
          {(id) => (
            <Input id={id} type="number" min={1} max={100} value={s.maxUploadMb} onChange={(e) => setS({ ...s, maxUploadMb: Number(e.target.value) || 1 })} />
          )}
        </Field>
      </Card>
      <Card className="space-y-4">
        <h2 className="font-semibold">{t("admin.wordFilter")}</h2>
        <Toggle
          checked={s.useDefaultWordFilter}
          onChange={(v) => setS({ ...s, useDefaultWordFilter: v })}
          label={t("admin.useDefaultFilter")}
          description={t("admin.defaultFilterCount", { count: defaults.length })}
        />
        <Field label={t("admin.customWords")} hint={t("admin.customWordsHint")}>
          {(id) => <Textarea id={id} rows={10} value={filterText} onChange={(e) => setFilterText(e.target.value)} />}
        </Field>
      </Card>
      <Card className="space-y-4 lg:col-span-2">
        <h2 className="font-semibold">{t("admin.legal")}</h2>
        <p className="text-sm text-slate-500">{t("admin.legalHint")}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label={t("legal.imprint")}>
            {(id) => <Textarea id={id} rows={10} maxLength={20000} value={s.imprint} onChange={(e) => setS({ ...s, imprint: e.target.value })} />}
          </Field>
          <Field label={t("legal.privacy")}>
            {(id) => <Textarea id={id} rows={10} maxLength={50000} value={s.privacy} onChange={(e) => setS({ ...s, privacy: e.target.value })} />}
          </Field>
        </div>
      </Card>
      <div className="lg:col-span-2">
        <Button onClick={save} loading={busy}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { PublicUser } from "@polldeck/shared";
import { get, post } from "../lib/api";
import { useApp } from "../lib/app";
import { AuthLayout } from "../components/Layout";
import { Button, Field, Input, useErrorText } from "../components/ui";

function ErrorBox({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200" role="alert">
      {text}
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const { config, setUser } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const errText = useErrorText();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(params.get("error") ? errText({ code: params.get("error") }) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (config?.needsSetup) navigate("/register", { replace: true });
  }, [config, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await post<{ user: PublicUser }>("/api/auth/login", { email, password });
      setUser(res.user);
      navigate(params.get("next") || "/dashboard", { replace: true });
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t("auth.loginTitle")}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox text={error} />
        <Field label={t("auth.email")}>
          {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t("auth.password")}>
          {(id) => (
            <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <Button type="submit" className="w-full" loading={busy}>
          {t("auth.login")}
        </Button>
        {config?.oidcEnabled && (
          <a
            href="/api/auth/oidc/login"
            className="flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50 dark:ring-slate-600 dark:hover:bg-slate-800"
          >
            {t("auth.loginWith", { provider: config.oidcLabel })}
          </a>
        )}
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <Link to="/forgot" className="text-brand-600 hover:underline dark:text-brand-300">
            {t("auth.forgot")}
          </Link>
          {config?.registrationMode === "open" && (
            <Link to="/register" className="text-brand-600 hover:underline dark:text-brand-300">
              {t("auth.noAccount")}
            </Link>
          )}
        </div>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const { config, setUser, refresh } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const errText = useErrorText();
  const inviteToken = params.get("invite") ?? undefined;
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (inviteToken)
      get<{ valid: boolean; email?: string | null }>(`/api/auth/invite/${inviteToken}`).then((r) => {
        if (!r.valid) setError(t("errors.invite_invalid"));
        else if (r.email) setForm((f) => ({ ...f, email: r.email! }));
      });
  }, [inviteToken, t]);

  const closed = !config?.needsSetup && !inviteToken && config?.registrationMode !== "open";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await post<{ user: PublicUser }>("/api/auth/register", { ...form, inviteToken });
      setUser(res.user);
      await refresh();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={config?.needsSetup ? t("auth.setupTitle") : t("auth.registerTitle")}>
      {config?.needsSetup && <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{t("auth.setupHint")}</p>}
      {closed ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {config?.registrationMode === "invite" ? t("auth.inviteOnly") : t("auth.registrationClosed")}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox text={error} />
          <Field label={t("auth.name")}>
            {(id) => <Input id={id} autoComplete="name" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          </Field>
          <Field label={t("auth.email")}>
            {(id) => <Input id={id} type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
          </Field>
          <Field label={t("auth.password")} hint={t("auth.passwordHint")}>
            {(id) => (
              <Input id={id} type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            )}
          </Field>
          <Button type="submit" className="w-full" loading={busy}>
            {config?.needsSetup ? t("auth.createAdmin") : t("auth.register")}
          </Button>
        </form>
      )}
      {!config?.needsSetup && (
        <p className="mt-4 text-sm">
          <Link to="/login" className="text-brand-600 hover:underline dark:text-brand-300">
            {t("auth.haveAccount")}
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}

export function ForgotPage() {
  const { t } = useTranslation();
  const { config } = useApp();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout title={t("auth.forgotTitle")}>
      {sent ? (
        <p className="text-sm">{t("auth.forgotSent")}</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await post("/api/auth/forgot", { email }).catch(() => undefined);
            setBusy(false);
            setSent(true);
          }}
        >
          {!config?.mailEnabled && <p className="text-sm text-amber-700 dark:text-amber-300">{t("auth.mailDisabled")}</p>}
          <Field label={t("auth.email")}>
            {(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Button type="submit" className="w-full" loading={busy}>
            {t("auth.sendResetLink")}
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm">
        <Link to="/login" className="text-brand-600 hover:underline dark:text-brand-300">
          {t("auth.backToLogin")}
        </Link>
      </p>
    </AuthLayout>
  );
}

export function ResetPage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const errText = useErrorText();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout title={t("auth.resetTitle")}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await post("/api/auth/reset", { token, password });
            navigate("/login");
          } catch (err) {
            setError(errText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox text={error} />
        <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" className="w-full" loading={busy}>
          {t("auth.savePassword")}
        </Button>
      </form>
    </AuthLayout>
  );
}

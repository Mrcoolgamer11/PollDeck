import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { useApp } from "../lib/app";
import { get } from "../lib/api";
import { Logo } from "../components/Layout";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { Button } from "../components/ui";

export function HomePage() {
  const { t } = useTranslation();
  const { user, config } = useApp();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.replace(/\D/g, "");
    if (c.length !== 6) return setError(t("join.invalidCode"));
    setBusy(true);
    try {
      await get(`/api/join/${c}`);
      navigate(`/${c}`);
    } catch {
      setError(t("join.notFound"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-900 text-white">
      <header className="flex items-center justify-between p-4">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguageSwitch className="text-white" />
          <Link
            to={user ? "/dashboard" : "/login"}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
          >
            {user ? t("nav.dashboard") : t("auth.login")}
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
        <h1 className="mb-2 text-center text-3xl font-extrabold sm:text-5xl">{t("join.headline")}</h1>
        <p className="mb-8 text-center text-white/80">{t("join.subline", { domain: config?.appDomain ?? location.host })}</p>
        <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-2xl">
          <label htmlFor="code" className="mb-2 block text-sm font-semibold text-slate-600">
            {t("join.codeLabel")}
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9 ]*"
            maxLength={7}
            placeholder="123 456"
            value={code}
            onChange={(e) => {
              setError("");
              const d = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d);
            }}
            className="mb-3 w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-center text-3xl font-bold tracking-[0.3em] outline-none focus:border-brand-600"
            aria-invalid={!!error}
            aria-describedby={error ? "code-error" : undefined}
          />
          {error && (
            <p id="code-error" className="mb-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {t("join.submit")} <ArrowRight className="h-5 w-5" aria-hidden />
          </Button>
        </form>
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { get } from "../lib/api";
import { Logo } from "../components/Layout";
import { Spinner } from "../components/ui";

/** Impressum bzw. Datenschutzerklärung – Text aus dem Admin-Bereich. */
export function LegalPage({ kind }: { kind: "imprint" | "privacy" }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ imprint: string; privacy: string } | null>(null);
  useEffect(() => {
    get<{ imprint: string; privacy: string }>("/api/auth/legal").then(setData);
  }, []);
  const text = data?.[kind] ?? "";
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="mx-auto flex max-w-3xl items-center justify-between p-4">
        <Link to="/">
          <Logo />
        </Link>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t("legal.back")}
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="mb-6 text-3xl font-bold">{kind === "imprint" ? t("legal.imprint") : t("legal.privacy")}</h1>
        {!data ? (
          <Spinner />
        ) : text.trim() ? (
          <div className="whitespace-pre-line leading-relaxed">{text}</div>
        ) : (
          <p className="text-slate-500">{t("legal.empty")}</p>
        )}
      </main>
    </div>
  );
}

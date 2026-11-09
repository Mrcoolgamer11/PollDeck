import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { setLanguage } from "../lib/i18n";
import { patch } from "../lib/api";
import { useApp } from "../lib/app";
import { cx } from "./ui";

export function LanguageSwitch({ className, compact }: { className?: string; compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const { user } = useApp();
  const next = i18n.language === "de" ? "en" : "de";
  return (
    <button
      type="button"
      onClick={() => {
        setLanguage(next);
        if (user) patch("/api/auth/me", { locale: next }).catch(() => undefined);
      }}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:bg-white/10",
        className,
      )}
      aria-label={t("common.switchLanguage")}
      title={t("common.switchLanguage")}
    >
      <Languages className="h-4 w-4" aria-hidden />
      {!compact && <span>{next.toUpperCase()}</span>}
    </button>
  );
}

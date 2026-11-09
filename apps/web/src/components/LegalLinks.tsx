import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApp } from "../lib/app";
import { cx } from "./ui";

/** Links zu Impressum und Datenschutz (nur, wenn im Admin-Bereich hinterlegt). */
export function LegalLinks({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { config } = useApp();
  if (!config?.hasImprint && !config?.hasPrivacy) return null;
  return (
    <nav className={cx("flex justify-center gap-4 py-4 text-xs opacity-70", className)} aria-label={t("legal.nav")}>
      {config.hasImprint && (
        <Link to="/impressum" className="hover:underline">
          {t("legal.imprint")}
        </Link>
      )}
      {config.hasPrivacy && (
        <Link to="/datenschutz" className="hover:underline">
          {t("legal.privacy")}
        </Link>
      )}
    </nav>
  );
}

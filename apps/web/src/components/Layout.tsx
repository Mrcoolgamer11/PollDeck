import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3, LogOut, Moon, Palette, Shield, Sun, User } from "lucide-react";
import { useApp } from "../lib/app";
import { LanguageSwitch } from "./LanguageSwitch";
import { IconButton, cx } from "./ui";

export function Logo({ className }: { className?: string }) {
  const { config } = useApp();
  return (
    <span className={cx("inline-flex items-center gap-2 font-bold", className)}>
      {config?.logoUrl ? (
        <img src={config.logoUrl} alt="" className="h-7 w-7 rounded object-contain" />
      ) : (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
          <BarChart3 className="h-4 w-4" aria-hidden />
        </span>
      )}
      <span>{config?.appName ?? "PollDeck"}</span>
    </span>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const { user, logout, darkMode, toggleDark } = useApp();
  const navigate = useNavigate();
  const link = ({ isActive }: { isActive: boolean }) =>
    cx(
      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
      isActive
        ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
    );
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        {t("common.skipToContent")}
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
          <Link to="/dashboard" className="mr-4">
            <Logo />
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto" aria-label={t("nav.main")}>
            <NavLink to="/dashboard" className={link}>
              <BarChart3 className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t("nav.presentations")}</span>
            </NavLink>
            <NavLink to="/themes" className={link}>
              <Palette className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t("nav.themes")}</span>
            </NavLink>
            {user?.role === "ADMIN" && (
              <NavLink to="/admin" className={link}>
                <Shield className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">{t("nav.admin")}</span>
              </NavLink>
            )}
          </nav>
          <LanguageSwitch compact />
          <IconButton label={darkMode ? t("common.lightMode") : t("common.darkMode")} onClick={toggleDark}>
            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </IconButton>
          <NavLink to="/profile" className={link} aria-label={t("nav.profile")}>
            <User className="h-4 w-4" aria-hidden />
            <span className="hidden max-w-[10rem] truncate md:inline">{user?.name}</span>
          </NavLink>
          <IconButton
            label={t("nav.logout")}
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            <LogOut className="h-5 w-5" />
          </IconButton>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export function AuthLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const { darkMode, toggleDark } = useApp();
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-50 to-slate-100 text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between p-4">
        <Link to="/">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <IconButton label={darkMode ? t("common.lightMode") : t("common.darkMode")} onClick={toggleDark}>
            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </IconButton>
        </div>
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:p-8">
          <h1 className="mb-6 text-2xl font-bold">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}


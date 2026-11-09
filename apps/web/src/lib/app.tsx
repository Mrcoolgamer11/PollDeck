import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicConfig, PublicUser } from "@polldeck/shared";
import { get, post } from "./api";
import { applyDefaultLanguage, setLanguage } from "./i18n";

interface AppCtx {
  config: PublicConfig | null;
  user: PublicUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: PublicUser | null) => void;
  logout: () => Promise<void>;
  darkMode: boolean;
  toggleDark: () => void;
}

const Ctx = createContext<AppCtx>(null as unknown as AppCtx);

function initialDark() {
  try {
    const s = localStorage.getItem("pd_dark");
    if (s) return s === "1";
  } catch {
    /* noop */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDark] = useState(initialDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      localStorage.setItem("pd_dark", darkMode ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [darkMode]);

  const setUser = useCallback((u: PublicUser | null) => {
    setUserState(u);
    if (u?.locale) setLanguage(u.locale, false);
  }, []);

  const refresh = useCallback(async () => {
    const [cfg, me] = await Promise.all([
      get<PublicConfig>("/api/auth/config"),
      get<{ user: PublicUser | null }>("/api/auth/me"),
    ]);
    setConfig(cfg);
    applyDefaultLanguage(cfg.defaultLocale);
    document.title = cfg.appName;
    setUser(me.user);
  }, [setUser]);

  useEffect(() => {
    refresh()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [refresh]);

  const logout = useCallback(async () => {
    await post("/api/auth/logout");
    setUserState(null);
  }, []);

  return (
    <Ctx.Provider
      value={{ config, user, loading, refresh, setUser, logout, darkMode, toggleDark: () => setDark((d) => !d) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);

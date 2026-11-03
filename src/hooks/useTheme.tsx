import { createContext, useContext, useEffect, useState, ReactNode } from "react";

/** What the user picked. 'system' follows the OS preference live. */
export type ThemeMode = "system" | "light" | "dark";
/** What is actually painted. */
export type ResolvedTheme = "light" | "dark";

type Ctx = {
  /** Resolved theme — use this for rendering decisions. */
  theme: ResolvedTheme;
  /** The user's choice, including 'system'. */
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggleTheme: () => void;
  setTheme: (t: ResolvedTheme) => void;
};

const ThemeContext = createContext<Ctx | undefined>(undefined);
const STORAGE_KEY = "qrcraft-theme";

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start from 'system' on both server and first client render so hydration matches;
  // the stored preference is applied in an effect right after mount.
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemPref, setSystemPref] = useState<ResolvedTheme>("light");

  useEffect(() => {
    setModeState(getInitialMode());
    setSystemPref(systemTheme());
  }, []);

  // Track OS changes live while in system mode.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemPref(e.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const theme: ResolvedTheme = mode === "system" ? systemPref : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    localStorage.setItem(STORAGE_KEY, mode);
  }, [theme, mode]);

  const setMode = (m: ThemeMode) => setModeState(m);
  const setTheme = (t: ResolvedTheme) => setModeState(t);
  const toggleTheme = () => setModeState(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

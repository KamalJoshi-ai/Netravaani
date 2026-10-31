"use client";

import React, { createContext, useContext, useEffect, useMemo, useCallback } from "react";

export type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    try {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("netravaani_theme", "light");
    } catch {
      // ignore
    }
  }, []);

  const setTheme = useCallback(() => {}, []);
  const toggleTheme = useCallback(() => {}, []);

  const contextValue = useMemo(() => ({ theme: "light" as Theme, toggleTheme, setTheme }), [toggleTheme, setTheme]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Reusable Theme Toggle button - returns null because light mode is enforced.
 */
export function ThemeToggle(props?: {
  className?: string;
  showLabel?: boolean;
}): React.ReactNode {
  void props;
  return null;
}

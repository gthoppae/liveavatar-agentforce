'use client';

import { createContext, useContext, useEffect, useCallback, useSyncExternalStore, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Theme store for useSyncExternalStore
let currentTheme: Theme = 'dark';
const listeners = new Set<() => void>();

function getSnapshot(): Theme {
  return currentTheme;
}

function getServerSnapshot(): Theme {
  return 'dark';
}

function subscribeToTheme(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function setThemeValue(newTheme: Theme) {
  currentTheme = newTheme;
  listeners.forEach(listener => listener());
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeToTheme, getSnapshot, getServerSnapshot);

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    let initial: Theme;
    if (stored) {
      initial = stored;
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      initial = 'light';
    } else {
      initial = 'dark';
    }

    if (initial !== currentTheme) {
      setThemeValue(initial);
    }
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(initial);
  }, []);

  // Sync theme changes to DOM and localStorage
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setThemeValue(newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

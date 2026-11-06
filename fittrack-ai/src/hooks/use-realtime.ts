"use client";

import { useEffect, useRef } from "react";
import { DATA_CHANGED } from "@/lib/data";

/**
 * Richiama `onChange` quando cambia una delle tabelle indicate: dopo un salvataggio
 * in questa o in un'altra scheda, e quando l'app torna in primo piano (es. dati
 * inseriti da un altro dispositivo).
 */
export function useRealtime(tables: string[], onChange: () => void) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  const key = tables.join(",");

  useEffect(() => {
    const watched = new Set(key.split(","));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 150);
    };
    const onLocal = (e: Event) => {
      const t = (e as CustomEvent<{ table: string }>).detail?.table;
      if (!t || watched.has(t)) fire();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === DATA_CHANGED && e.newValue && watched.has(e.newValue.split(":")[0])) fire();
    };
    const onVisible = () => document.visibilityState === "visible" && fire();
    window.addEventListener(DATA_CHANGED, onLocal);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", fire);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED, onLocal);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", fire);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);
}

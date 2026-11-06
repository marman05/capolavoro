"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Richiama `onChange` quando cambia una delle tabelle indicate (anche da un altro
 * dispositivo). Supabase Realtime applica la RLS: arrivano solo le righe dell'utente.
 */
export function useRealtime(tables: string[], onChange: () => void) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`rt-${key}-${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => cb.current(), 250);
      });
    }
    channel.subscribe();
    const onFocus = () => cb.current();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
    };
  }, [key]);
}

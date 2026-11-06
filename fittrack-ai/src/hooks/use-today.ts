"use client";

import { useEffect, useState } from "react";
import { toISODate } from "@/lib/date";

/** Data odierna (yyyy-MM-dd) che si aggiorna automaticamente a mezzanotte. */
export function useToday() {
  const [today, setToday] = useState(() => toISODate());
  useEffect(() => {
    const id = setInterval(() => {
      const t = toISODate();
      setToday((prev) => (prev === t ? prev : t));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

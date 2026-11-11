"use client";
import { useEffect, useState } from "react";

export function useMedia(query: string, initial = false) {
  const [on, setOn] = useState(initial);
  useEffect(() => {
    const m = window.matchMedia(query);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [query]);
  return on;
}

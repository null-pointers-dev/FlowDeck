"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Re-renders the server page when one of the topics changes. Falls back to a 30-second refresh. */
export function LiveRefresh({ topics }: { topics: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = topics.join(",");
  useEffect(() => {
    const es = new EventSource(`/api/live?topics=${encodeURIComponent(key)}`);
    es.onmessage = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const poll = setInterval(() => router.refresh(), 30_000);
    return () => {
      es.close();
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, router]);
  return null;
}

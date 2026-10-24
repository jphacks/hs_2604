"use client";
import { useEffect, useEffectEvent, useState } from "react";

type State<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: string };

/** リポジトリからの読み込み。deps が変わるたびに読み直し、reload() で手動でも読み直せる */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const runLoad = useEffectEvent(load);
  const key = JSON.stringify(deps);

  useEffect(() => {
    let alive = true;
    runLoad().then(
      (data) => alive && setState({ status: "ready", data }),
      (e: unknown) => alive && setState({ status: "error", error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [key, tick]);

  return { state, reload: () => setTick((t) => t + 1) };
}

/** 失敗したときの文言（ValidationError は複数行） */
export function errorMessages(e: unknown): string[] {
  if (e && typeof e === "object" && "messages" in e && Array.isArray((e as { messages: unknown }).messages)) {
    return (e as { messages: string[] }).messages;
  }
  return [e instanceof Error ? e.message : String(e)];
}

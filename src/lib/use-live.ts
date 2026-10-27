import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { DEFAULT_LIVE, activeQuests } from "./live-settings";
import { getLiveSettings } from "./social.functions";
import { setQuestConfig } from "./streak";

/** Owner's live-feature switches (defaults until loaded, so nothing flickers off). */
export function useLive() {
  const q = useQuery({ queryKey: ["live-settings"], queryFn: () => getLiveSettings(), staleTime: 30_000, placeholderData: DEFAULT_LIVE });
  const s = q.data ?? DEFAULT_LIVE;
  useEffect(() => { setQuestConfig(activeQuests(s)); }, [s]);
  return s;
}

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Shows "Install" only when the browser offers home-screen install (Android/desktop Chrome, Edge). */
export function InstallButton() {
  const [evt, setEvt] = useState<Prompt | null>(null);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as Prompt); };
    const done = () => setEvt(null);
    addEventListener("beforeinstallprompt", on);
    addEventListener("appinstalled", done);
    return () => { removeEventListener("beforeinstallprompt", on); removeEventListener("appinstalled", done); };
  }, []);
  if (!evt) return null;
  return (
    <button
      onClick={async () => { await evt.prompt(); await evt.userChoice.catch(() => null); setEvt(null); }}
      className="inline-flex items-center gap-1 rounded-full p-2 text-sm hover:bg-accent sm:px-3 sm:py-1.5"
      aria-label="Install app" title="Install LoopgramChannel"
    >
      <Download className="h-5 w-5 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Install</span>
    </button>
  );
}

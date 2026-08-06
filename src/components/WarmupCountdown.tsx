import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Timer } from "lucide-react";

/**
 * Every draft opens with a short warm-up period after it starts, so everyone
 * can get into the room before the first pick is live. Picks and nominations
 * are rejected server-side until `warmup_until` passes.
 */
export function useWarmup(warmupUntil: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!warmupUntil) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [warmupUntil]);

  if (!warmupUntil) return { active: false, secondsLeft: 0 };
  const ms = new Date(warmupUntil).getTime() - now;
  return { active: ms > 0, secondsLeft: Math.max(0, Math.ceil(ms / 1000)) };
}

export function WarmupBanner({
  secondsLeft,
  label = "Draft begins in",
}: {
  secondsLeft: number;
  label?: string;
}) {
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");
  return (
    <Card className="border-2 border-primary/40 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Timer className="h-5 w-5 text-primary" />
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-primary">
              {label}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Get settled — picks unlock when the countdown hits zero.
            </p>
          </div>
        </div>
        <div className="font-mono text-3xl font-black tabular-nums text-primary">
          {mm}:{ss}
        </div>
      </div>
    </Card>
  );
}

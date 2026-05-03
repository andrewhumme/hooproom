import { ArrowDown, ArrowUp, ListOrdered, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type QueueItem } from "@/hooks/useDraftQueue";

interface Props {
  queue: QueueItem[];
  takenIds: Set<string>;
  onRemove: (playerId: string) => void;
  onMoveUp: (playerId: string) => void;
  onMoveDown: (playerId: string) => void;
  isSlow: boolean;
}

export function DraftQueuePanel({
  queue,
  takenIds,
  onRemove,
  onMoveUp,
  onMoveDown,
  isSlow,
}: Props) {
  return (
    <Card className="overflow-hidden border-2">
      <div className="flex items-center justify-between border-b-2 border-border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-primary" />
          <div>
            <div className="text-xs font-black uppercase tracking-widest">
              My Queue
            </div>
            <div className="text-[10px] text-muted-foreground">
              {isSlow
                ? "Used for autopicks when your clock runs out"
                : "Pre-rank picks for when you're away"}
            </div>
          </div>
        </div>
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
          {queue.length}
        </span>
      </div>
      {queue.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          Tap the <strong>＋</strong> on any player to add them to your queue.
        </div>
      ) : (
        <ul className="max-h-[40vh] divide-y divide-border overflow-y-auto">
          {queue.map((q, idx) => {
            const taken = takenIds.has(q.player_id);
            return (
              <li
                key={q.id}
                className={`flex items-center gap-2 px-3 py-2 ${
                  taken ? "opacity-40" : ""
                }`}
              >
                <span className="w-5 shrink-0 text-center text-[11px] font-black text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">
                    {q.player_name}
                    {taken && (
                      <span className="ml-1 text-[10px] font-bold uppercase text-destructive">
                        drafted
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {q.player_team} · {q.player_position}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onMoveUp(q.player_id)}
                    disabled={idx === 0}
                    title="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onMoveDown(q.player_id)}
                    disabled={idx === queue.length - 1}
                    title="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => onRemove(q.player_id)}
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

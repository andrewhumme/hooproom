import { useState } from "react";
import { Check, Eye } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { isListedRoom, watchUrl, type WatchableRoom } from "@/lib/watchLink";

type Props = {
  room: WatchableRoom;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
};

/** Copies the room's view-only watch link. Renders nothing if unavailable. */
export function WatchLinkButton({ room, size = "sm", variant = "outline", className }: Props) {
  const [copied, setCopied] = useState(false);
  const url = watchUrl(room);
  if (!url) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this watch link:", url);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleCopy}
      size={size}
      variant={variant}
      className={`font-bold ${className ?? ""}`}
      title={
        isListedRoom(room)
          ? "Public view-only link — anyone can watch, no account needed"
          : "Private view-only link — anyone with this link can watch, but can't join"
      }
    >
      {copied ? <Check /> : <Eye />}
      {copied ? "Copied!" : "Copy watch link"}
    </Button>
  );
}

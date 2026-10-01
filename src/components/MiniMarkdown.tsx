// Tiny, safe Markdown renderer for admin-edited site copy. Supports
// paragraphs (blank-line separated), "## " / "### " headings, "- " bullet
// lists, **bold**, *italic* and [links](https://…). Builds React elements —
// never raw HTML — so edited text can't inject markup or scripts.
import { Fragment, type ReactNode } from "react";

const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/))/i;

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[1] != null) out.push(<strong key={key} className="font-bold text-foreground">{m[1]}</strong>);
    else if (m[2] != null) out.push(<em key={key}>{m[2]}</em>);
    else if (SAFE_HREF.test(m[4])) {
      out.push(
        <a key={key} href={m[4]} className="font-semibold text-primary underline-offset-2 hover:underline">
          {m[3]}
        </a>,
      );
    } else out.push(m[3]); // unsafe link target: show the text only
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MiniMarkdown({ source, className }: { source: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(<p key={k}>{inline(para.join(" "), k)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      const k = `l${blocks.length}`;
      blocks.push(
        <ul key={k} className="list-disc space-y-1 pl-5">
          {list.map((item, j) => (
            <li key={j}>{inline(item, `${k}-${j}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (heading) {
      flushPara();
      flushList();
      const k = `h${blocks.length}`;
      blocks.push(
        heading[1] === "##" ? (
          <h2 key={k} className="pt-2 text-lg font-bold text-foreground">{inline(heading[2], k)}</h2>
        ) : (
          <h3 key={k} className="pt-1 text-base font-bold text-foreground">{inline(heading[2], k)}</h3>
        ),
      );
    } else if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className={className}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}

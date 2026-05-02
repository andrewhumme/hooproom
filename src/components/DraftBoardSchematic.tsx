/**
 * Editorial schematic of a live snake draft board.
 * Pure SVG — no people, no AI, no photography.
 *
 * Tells the HoopRoom story: 10 teams, multiple rounds, a snake path
 * weaving through picks, an "on the clock" highlight, and a pick clock.
 *
 * Design notes:
 * - Uses semantic CSS tokens (var(--primary), var(--foreground), etc.)
 *   so it adapts to theme without code changes.
 * - Whiteboard / coach's diagram aesthetic. Hairline strokes, monospaced
 *   tick labels, deliberate negative space.
 */
export function DraftBoardSchematic({ className }: { className?: string }) {
  const teams = 10;
  const rounds = 6;
  const cellW = 56;
  const cellH = 38;
  const padX = 64;
  const padY = 72;
  const boardW = teams * cellW;
  const boardH = rounds * cellH;
  const W = padX * 2 + boardW;
  const H = padY * 2 + boardH + 80;

  // Snake-order pick number for (round, col), 1-indexed display.
  const pickAt = (r: number, c: number) =>
    r % 2 === 0 ? r * teams + c + 1 : r * teams + (teams - c);

  // Picks already made (filled cells). Highlight the next pick.
  const made = 24;
  const onTheClock = made + 1;

  // Build the snake path connecting picks in order.
  const cellCenter = (n: number) => {
    const idx = n - 1;
    const r = Math.floor(idx / teams);
    const colInRow = idx % teams;
    const c = r % 2 === 0 ? colInRow : teams - 1 - colInRow;
    return {
      x: padX + c * cellW + cellW / 2,
      y: padY + r * cellH + cellH / 2,
    };
  };

  const snakePoints: string[] = [];
  for (let n = 1; n <= rounds * teams; n++) {
    const { x, y } = cellCenter(n);
    snakePoints.push(`${x},${y}`);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Schematic of a live HoopRoom snake draft board with pick clock"
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern
          id="grid-bg"
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 16 0 L 0 0 0 16"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.06"
            strokeWidth="0.5"
          />
        </pattern>
        <linearGradient id="snake-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="color-mix(in oklab, var(--primary) 15%, transparent)" />
          <stop offset="100%" stopColor="color-mix(in oklab, var(--primary) 60%, transparent)" />
        </linearGradient>
      </defs>

      {/* Paper grid */}
      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        fill="url(#grid-bg)"
        className="text-foreground"
      />

      {/* Corner registration ticks — like a technical drawing */}
      {[
        [padX - 24, padY - 24],
        [W - padX + 24, padY - 24],
        [padX - 24, padY + boardH + 24],
        [W - padX + 24, padY + boardH + 24],
      ].map(([cx, cy], i) => (
        <g key={i} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" className="text-foreground">
          <line x1={cx - 6} y1={cy} x2={cx + 6} y2={cy} />
          <line x1={cx} y1={cy - 6} x2={cx} y2={cy + 6} />
        </g>
      ))}

      {/* Top axis label */}
      <text
        x={padX}
        y={padY - 32}
        className="fill-muted-foreground"
        style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: 2 }}
      >
        TEAMS · 01—10
      </text>
      <text
        x={W - padX}
        y={padY - 32}
        textAnchor="end"
        className="fill-muted-foreground"
        style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: 2 }}
      >
        SNAKE · 6 RDS
      </text>

      {/* Column headers (team numbers) */}
      {Array.from({ length: teams }, (_, c) => (
        <text
          key={`col-${c}`}
          x={padX + c * cellW + cellW / 2}
          y={padY - 12}
          textAnchor="middle"
          className="fill-foreground"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, fontWeight: 700 }}
        >
          {String(c + 1).padStart(2, "0")}
        </text>
      ))}

      {/* Row labels (round numbers) */}
      {Array.from({ length: rounds }, (_, r) => (
        <text
          key={`row-${r}`}
          x={padX - 14}
          y={padY + r * cellH + cellH / 2 + 3}
          textAnchor="end"
          className="fill-muted-foreground"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, letterSpacing: 1 }}
        >
          R{r + 1}
        </text>
      ))}

      {/* Board frame */}
      <rect
        x={padX}
        y={padY}
        width={boardW}
        height={boardH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-foreground"
      />

      {/* Cells */}
      {Array.from({ length: rounds }).map((_, r) =>
        Array.from({ length: teams }).map((_, c) => {
          const n = pickAt(r, c);
          const isMade = n <= made;
          const isClock = n === onTheClock;
          return (
            <g key={`cell-${r}-${c}`}>
              <rect
                x={padX + c * cellW}
                y={padY + r * cellH}
                width={cellW}
                height={cellH}
                fill={
                  isClock
                    ? "color-mix(in oklab, var(--primary) 14%, transparent)"
                    : isMade
                      ? "color-mix(in oklab, var(--foreground) 4%, transparent)"
                      : "transparent"
                }
                stroke="currentColor"
                strokeOpacity="0.18"
                strokeWidth="0.75"
                className="text-foreground"
              />
              {isMade && (
                <text
                  x={padX + c * cellW + cellW / 2}
                  y={padY + r * cellH + cellH / 2 + 3}
                  textAnchor="middle"
                  className="fill-foreground"
                  style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, fontWeight: 600, opacity: 0.7 }}
                >
                  ·{String(n).padStart(2, "0")}·
                </text>
              )}
              {isClock && (
                <>
                  <rect
                    x={padX + c * cellW + 4}
                    y={padY + r * cellH + 4}
                    width={cellW - 8}
                    height={cellH - 8}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padX + c * cellW + cellW / 2}
                    y={padY + r * cellH + cellH / 2 + 3}
                    textAnchor="middle"
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 10,
                      fontWeight: 800,
                      fill: "var(--primary)",
                      letterSpacing: 1,
                    }}
                  >
                    {String(n).padStart(2, "0")}
                  </text>
                </>
              )}
            </g>
          );
        }),
      )}

      {/* Snake path through the board */}
      <polyline
        points={snakePoints.slice(0, made).join(" ")}
        fill="none"
        stroke="var(--primary)"
        strokeOpacity="0.55"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={snakePoints.slice(made - 1, made + 1).join(" ")}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />

      {/* Pick clock + caption */}
      <g transform={`translate(${padX}, ${padY + boardH + 40})`}>
        {/* Tick marks for the clock */}
        <g stroke="currentColor" strokeOpacity="0.35" className="text-foreground">
          {Array.from({ length: 30 }, (_, i) => {
            const x = (i / 29) * (boardW * 0.55);
            const tall = i % 5 === 0;
            return (
              <line
                key={i}
                x1={x}
                y1={0}
                x2={x}
                y2={tall ? 10 : 5}
                strokeWidth={tall ? 1.25 : 0.75}
              />
            );
          })}
        </g>
        <text
          x={0}
          y={32}
          className="fill-muted-foreground"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: 2 }}
        >
          PICK CLOCK · 00:23 REMAINING
        </text>

        {/* Right-side caption */}
        <g transform={`translate(${boardW * 0.6}, -4)`}>
          <text
            x={0}
            y={0}
            className="fill-muted-foreground"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, letterSpacing: 2 }}
          >
            FIG. 01
          </text>
          <text
            x={0}
            y={16}
            className="fill-foreground"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}
          >
            LIVE SNAKE DRAFT
          </text>
          <text
            x={0}
            y={32}
            className="fill-muted-foreground"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 10 }}
          >
            10 teams · 6 rounds shown
          </text>
        </g>
      </g>
    </svg>
  );
}

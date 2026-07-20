import { formatCurrency } from "@/lib/utils";

const compactFormatter = new Intl.NumberFormat("es-BO", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/* Plain CSS bars, no chart library — 7 days of confirmed revenue (Bs).
 * The last entry is always "today" by construction (spec #6c: gold
 * gradient bar + "Bs X hoy" caption, "mejor día" when it's the peak). */
export function MiniBarChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...data.map((day) => day.value));
  const today = data[data.length - 1] as { label: string; value: number } | undefined;
  const isBestDay = Boolean(today && today.value > 0 && today.value === max);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2 sm:gap-3">
        {data.map((day, i) => {
          const isToday = i === data.length - 1;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                {compactFormatter.format(day.value)}
              </span>
              <div className="flex h-20 w-full items-end overflow-hidden rounded-md bg-muted">
                <div
                  className={
                    isToday
                      ? "w-full rounded-t-md bg-gradient-to-t from-gold to-gold-bright transition-[height] duration-300"
                      : "w-full rounded-t-md bg-primary transition-[height] duration-300"
                  }
                  style={{ height: `${Math.round((day.value / max) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground">
                {day.label}
              </span>
            </div>
          );
        })}
      </div>
      {today && (
        <p className="text-center text-xs text-muted-foreground">
          <span className="font-mono font-semibold text-gold">
            {formatCurrency(today.value)}
          </span>{" "}
          hoy{isBestDay ? " · mejor día de la semana" : ""}
        </p>
      )}
    </div>
  );
}

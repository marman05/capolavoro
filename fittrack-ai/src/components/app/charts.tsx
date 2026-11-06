"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };
const GRID = "var(--border)";

interface Point {
  label: string;
  [k: string]: string | number | boolean | null;
}

interface TipEntry {
  dataKey?: unknown;
  value?: unknown;
  color?: string;
  name?: unknown;
}
interface TipProps {
  active?: boolean;
  payload?: readonly TipEntry[];
  label?: unknown;
  unit: string;
  names?: Record<string, string>;
}

function TooltipBox({ active, payload, label, unit, names }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium capitalize">{String(label ?? "")}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="tabular flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {names?.[String(p.dataKey)] ?? String(p.name ?? "")}:{" "}
          <span className="font-semibold text-foreground">
            {p.value == null ? "—" : Math.round(Number(p.value) * 10) / 10} {unit}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Barre singola serie con linea obiettivo opzionale. */
export function SimpleBarChart({
  data,
  dataKey,
  color,
  unit,
  name,
  goal,
  height = 220,
}: {
  data: Point[];
  dataKey: string;
  color: string;
  unit: string;
  name: string;
  goal?: number;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={(p) => <TooltipBox active={p.active} payload={p.payload as readonly TipEntry[]} label={p.label} unit={unit} names={{ [dataKey]: name }} />} />
        {goal ? (
          <ReferenceLine
            y={goal}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{ value: `Obiettivo ${goal}`, position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
          />
        ) : null}
        <Bar dataKey={dataKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Macronutrienti impilati per giorno (3 serie, legenda sempre visibile). */
export function MacroStackChart({ data, height = 240 }: { data: Point[]; height?: number }) {
  const series = [
    { key: "protein", name: "Proteine", color: "var(--protein)" },
    { key: "carbs", name: "Carboidrati", color: "var(--carbs)" },
    { key: "fat", name: "Grassi", color: "var(--fat)" },
  ];
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={(p) => <TooltipBox active={p.active} payload={p.payload as readonly TipEntry[]} label={p.label} unit="g" names={Object.fromEntries(series.map((s) => [s.key, s.name]))} />}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="m"
              fill={s.color}
              stroke="var(--card)"
              strokeWidth={2}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={36}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Linea (peso corporeo) con obiettivo tratteggiato. */
export function TrendLineChart({
  data,
  dataKey,
  color,
  unit,
  name,
  goal,
  height = 240,
}: {
  data: Point[];
  dataKey: string;
  color: string;
  unit: string;
  name: string;
  goal?: number | null;
  height?: number;
}) {
  const values = data.map((d) => Number(d[dataKey])).filter((v) => Number.isFinite(v) && v > 0);
  if (goal) values.push(goal);
  const min = values.length ? Math.floor(Math.min(...values) - 1) : 0;
  const max = values.length ? Math.ceil(Math.max(...values) + 1) : 100;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} domain={[min, max]} />
        <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={(p) => <TooltipBox active={p.active} payload={p.payload as readonly TipEntry[]} label={p.label} unit={unit} names={{ [dataKey]: name }} />} />
        {goal ? (
          <ReferenceLine
            y={goal}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{ value: `Obiettivo ${goal} ${unit}`, position: "insideBottomRight", fontSize: 10, fill: "var(--muted-foreground)" }}
          />
        ) : null}
        <Line
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          connectNulls
          dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: color }}
          activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Area cumulativa (acqua bevuta durante la giornata). */
export function CumulativeAreaChart({
  data,
  dataKey,
  color,
  unit,
  name,
  goal,
  height = 200,
}: {
  data: Point[];
  dataKey: string;
  color: string;
  unit: string;
  name: string;
  goal?: number;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
        <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={(p) => <TooltipBox active={p.active} payload={p.payload as readonly TipEntry[]} label={p.label} unit={unit} names={{ [dataKey]: name }} />} />
        {goal ? <ReferenceLine y={goal} stroke="var(--muted-foreground)" strokeDasharray="4 4" /> : null}
        <Area type="stepAfter" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} fill={`url(#fill-${dataKey})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

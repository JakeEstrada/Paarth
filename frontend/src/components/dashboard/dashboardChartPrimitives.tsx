import { useMemo, useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { alpha, type Theme } from '@mui/material/styles';
import { format } from 'date-fns';

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
};

export type ChartPoint = {
  date: string;
  [key: string]: string | number;
};

function formatAxisDay(date: string) {
  const [, month, day] = String(date).split('-');
  if (!month || !day) return date;
  return `${Number(month)}/${Number(day)}`;
}

function formatTipDay(date: string) {
  const [year, month, day] = String(date).split('-').map(Number);
  if (!year || !month || !day) return date;
  return format(new Date(year, month - 1, day), 'EEE M/d');
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const padded = value * 1.12;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  return Math.ceil(padded / magnitude) * magnitude;
}

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1.25 }}>
      {series.map((item) => (
        <Box key={item.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: item.color }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {item.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export function AreaChart({
  data,
  series,
  height = 220,
  formatValue,
}: {
  data: ChartPoint[];
  series: ChartSeries[];
  height?: number;
  formatValue?: (value: number) => string;
}) {
  const theme = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const pad = { l: 44, r: 16, t: 18, b: 28 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = useMemo(() => {
    const peak = Math.max(
      0,
      ...data.flatMap((row) => series.map((item) => Number(row[item.key]) || 0)),
    );
    return niceMax(peak);
  }, [data, series]);

  const points = data.map((row, index) => {
    const x = data.length <= 1 ? pad.l + innerW / 2 : pad.l + (index / (data.length - 1)) * innerW;
    const ys: Record<string, number> = {};
    series.forEach((item) => {
      ys[item.key] = pad.t + innerH - ((Number(row[item.key]) || 0) / max) * innerH;
    });
    return { row, x, ys };
  });

  const ticks = data.filter((_, index) => {
    if (data.length <= 8) return true;
    const step = Math.ceil(data.length / 7);
    return index % step === 0 || index === data.length - 1;
  });

  const active = hover == null ? null : points[hover];
  const showValue = formatValue || ((value: number) => String(value));

  return (
    <Box sx={{ width: '100%', overflow: 'hidden' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((item) => (
            <linearGradient key={item.key} id={`dash-fill-${item.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={item.color} stopOpacity="0.42" />
              <stop offset="100%" stopColor={item.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={pad.l}
            x2={pad.l + innerW}
            y1={pad.t + innerH * (1 - frac)}
            y2={pad.t + innerH * (1 - frac)}
            stroke={theme.palette.divider}
            strokeDasharray="4 6"
          />
        ))}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + innerH} stroke={theme.palette.divider} />
        <line
          x1={pad.l}
          y1={pad.t + innerH}
          x2={pad.l + innerW}
          y2={pad.t + innerH}
          stroke={theme.palette.divider}
        />
        {series.map((item) => {
          const line = points.map((point) => `${point.x},${point.ys[item.key] ?? pad.t + innerH}`).join(' ');
          const area = `${pad.l},${pad.t + innerH} ${line} ${pad.l + innerW},${pad.t + innerH}`;
          return (
            <g key={item.key}>
              <polygon points={area} fill={`url(#dash-fill-${item.key})`} />
              <polyline points={line} fill="none" stroke={item.color} strokeWidth="2.6" strokeLinejoin="round" />
            </g>
          );
        })}
        {ticks.map((row) => {
          const point = points.find((item) => item.row.date === row.date);
          if (!point) return null;
          return (
            <text
              key={row.date}
              x={point.x}
              y={height - 8}
              textAnchor="middle"
              fill={theme.palette.text.secondary}
              fontSize="11"
            >
              {formatAxisDay(row.date)}
            </text>
          );
        })}
        <text x={pad.l} y={12} fill={theme.palette.text.secondary} fontSize="11">
          {showValue(max)}
        </text>
        {data.map((_, index) => {
          const bandW = data.length > 1 ? innerW / (data.length - 1) : innerW;
          const x = points[index].x - bandW / 2;
          return (
            <rect
              key={`hit-${index}`}
              x={x}
              y={pad.t}
              width={bandW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
          );
        })}
        {active ? (
          <g pointerEvents="none">
            <line
              x1={active.x}
              x2={active.x}
              y1={pad.t}
              y2={pad.t + innerH}
              stroke={theme.palette.text.secondary}
              strokeDasharray="3 3"
            />
            {series.map((item) => (
              <circle
                key={item.key}
                cx={active.x}
                cy={active.ys[item.key]}
                r={4.5}
                fill={item.color}
                stroke={theme.palette.background.paper}
                strokeWidth="2"
              />
            ))}
          </g>
        ) : null}
      </svg>
      {active ? (
        <Box
          sx={{
            mt: 0.5,
            px: 1,
            py: 0.75,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.04),
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
            {formatTipDay(String(active.row.date))}
          </Typography>
          {series.map((item) => (
            <Typography key={item.key} variant="caption" sx={{ display: 'block', color: item.color, fontWeight: 600 }}>
              {item.label}: {showValue(Number(active.row[item.key]) || 0)}
            </Typography>
          ))}
        </Box>
      ) : (
        <ChartLegend series={series} />
      )}
    </Box>
  );
}

export function StackedBarChart({
  data,
  series,
  height = 220,
}: {
  data: ChartPoint[];
  series: ChartSeries[];
  height?: number;
}) {
  const theme = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const pad = { l: 36, r: 12, t: 16, b: 28 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const totals = data.map((row) => series.reduce((sum, item) => sum + (Number(row[item.key]) || 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const gap = data.length > 20 ? 1.5 : 4;
  const barW = data.length ? Math.max(4, innerW / data.length - gap) : innerW;
  const ticks = data.filter((_, index) => {
    if (data.length <= 10) return true;
    const step = Math.ceil(data.length / 7);
    return index % step === 0 || index === data.length - 1;
  });
  const active = hover == null ? null : data[hover];

  return (
    <Box sx={{ width: '100%', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} onMouseLeave={() => setHover(null)}>
        {[0.5, 1].map((frac) => (
          <line
            key={frac}
            x1={pad.l}
            x2={pad.l + innerW}
            y1={pad.t + innerH * (1 - frac)}
            y2={pad.t + innerH * (1 - frac)}
            stroke={theme.palette.divider}
            strokeDasharray="4 6"
          />
        ))}
        {data.map((row, index) => {
          const x = pad.l + (index + 0.5) * (innerW / data.length) - barW / 2;
          let y = pad.t + innerH;
          return (
            <g key={row.date} onMouseEnter={() => setHover(index)}>
              {series.map((item) => {
                const value = Number(row[item.key]) || 0;
                const h = (value / max) * innerH;
                y -= h;
                if (h <= 0) return null;
                return <rect key={item.key} x={x} y={y} width={barW} height={h} rx={1.5} fill={item.color} />;
              })}
            </g>
          );
        })}
        {ticks.map((row) => {
          const index = data.findIndex((item) => item.date === row.date);
          const x = pad.l + (index + 0.5) * (innerW / data.length);
          return (
            <text key={row.date} x={x} y={height - 8} textAnchor="middle" fill={theme.palette.text.secondary} fontSize="11">
              {formatAxisDay(row.date)}
            </text>
          );
        })}
      </svg>
      {active ? (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
            {formatTipDay(String(active.date))}
          </Typography>
          {series.map((item) => (
            <Typography key={item.key} variant="caption" sx={{ display: 'block', color: item.color, fontWeight: 600 }}>
              {item.label}: {Number(active[item.key]) || 0}
            </Typography>
          ))}
        </Box>
      ) : (
        <ChartLegend series={series} />
      )}
    </Box>
  );
}

function donutArc(cx: number, cy: number, r: number, start: number, end: number) {
  const startX = cx + r * Math.cos(start);
  const startY = cy + r * Math.sin(start);
  const endX = cx + r * Math.cos(end);
  const endY = cy + r * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${startX} ${startY} A ${r} ${r} 0 ${large} 1 ${endX} ${endY}`;
}

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: { label: string; value: number; color: string }[];
  centerLabel: string;
  centerValue: string;
}) {
  const theme = useTheme();
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0) || 1;
  const cx = 110;
  const cy = 110;
  const r = 74;
  let angle = -Math.PI / 2;
  const arcs = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const sweep = (slice.value / total) * Math.PI * 2;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      return { ...slice, sweep, start, end, d: donutArc(cx, cy, r, start, end) };
    });

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <Box sx={{ position: 'relative', width: 220, height: 220, flexShrink: 0 }}>
        <svg viewBox="0 0 220 220" width="220" height="220">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={theme.palette.divider} strokeWidth="22" />
          {arcs.map((arc) =>
            arc.sweep >= Math.PI * 1.999 ? (
              <circle key={arc.label} cx={cx} cy={cy} r={r} fill="none" stroke={arc.color} strokeWidth="22" />
            ) : (
              <path key={arc.label} d={arc.d} fill="none" stroke={arc.color} strokeWidth="22" strokeLinecap="butt" />
            ),
          )}
        </svg>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
            {centerValue}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {centerLabel}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 160 }}>
        {slices.map((slice) => (
          <Box key={slice.label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: slice.color, flexShrink: 0 }} />
              <Typography variant="body2" noWrap>
                {slice.label}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {slice.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function chartPanelSx(theme: Theme) {
  return {
    p: { xs: 2, sm: 2.5 },
    borderRadius: 3,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    boxShadow:
      theme.palette.mode === 'dark' ? '0 1px 0 rgba(255,255,255,0.04)' : '0 8px 24px rgba(15, 23, 42, 0.05)',
  };
}

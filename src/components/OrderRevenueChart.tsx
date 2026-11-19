import React, { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Order } from '../types';

export type RevenueRange = '24h' | '7d' | '30d' | '1y';

interface OrderRevenueChartProps {
  orders: Order[];
}

interface BucketPoint {
  key: string;
  label: string;
  shortLabel: string;
  value: number;
  count: number;
}

const RANGE_OPTIONS: Array<{ id: RevenueRange; label: string; subtitle: string }> = [
  { id: '24h', label: 'Last 24 Hours', subtitle: 'Hourly 3h intervals' },
  { id: '7d', label: 'Last 7 Days', subtitle: 'Daily order totals' },
  { id: '30d', label: 'Last Month', subtitle: 'Trailing 30 days' },
  { id: '1y', label: 'Last Year', subtitle: 'Trailing 12 months' },
];

export function extractOrderTimestampMs(createdAt: unknown): number | null {
  if (!createdAt) return null;
  if (createdAt instanceof Date) {
    return Number.isFinite(createdAt.getTime()) ? createdAt.getTime() : null;
  }
  if (typeof createdAt === 'number' && Number.isFinite(createdAt)) {
    return createdAt;
  }
  if (typeof createdAt === 'string') {
    const parsed = Date.parse(createdAt);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof createdAt === 'object' && createdAt !== null) {
    if ('toMillis' in createdAt && typeof (createdAt as { toMillis?: unknown }).toMillis === 'function') {
      const ms = (createdAt as { toMillis: () => number }).toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if ('seconds' in createdAt && typeof (createdAt as { seconds?: unknown }).seconds === 'number') {
      return (createdAt as { seconds: number }).seconds * 1000;
    }
  }
  return null;
}

function formatInrCompact(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `₹${Math.round(value)}`;
}

export const OrderRevenueChart: React.FC<OrderRevenueChartProps> = ({ orders }) => {
  const [range, setRange] = useState<RevenueRange>('7d');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const validOrders = useMemo(() => {
    return orders
      .filter((o) => o.status !== 'cancelled')
      .map((o) => {
        const ms = extractOrderTimestampMs(o.createdAt);
        return ms !== null ? { order: o, ms } : null;
      })
      .filter((entry): entry is { order: Order; ms: number } => entry !== null);
  }, [orders]);

  const nowMs = Date.now();

  const summaryByRange = useMemo(() => {
    const compute = (windowMs: number) => {
      const cutoff = nowMs - windowMs;
      let total = 0;
      let count = 0;
      for (const { order, ms } of validOrders) {
        if (ms >= cutoff && ms <= nowMs + 60_000) {
          total += Number(order.totalAmount) || 0;
          count += 1;
        }
      }
      return { total, count };
    };

    const oneYearCutoff = (() => {
      const d = new Date(nowMs);
      d.setFullYear(d.getFullYear() - 1);
      return d.getTime();
    })();

    let yearTotal = 0;
    let yearCount = 0;
    for (const { order, ms } of validOrders) {
      if (ms >= oneYearCutoff && ms <= nowMs + 60_000) {
        yearTotal += Number(order.totalAmount) || 0;
        yearCount += 1;
      }
    }

    return {
      '24h': compute(24 * 60 * 60 * 1000),
      '7d': compute(7 * 24 * 60 * 60 * 1000),
      '30d': compute(30 * 24 * 60 * 60 * 1000),
      '1y': { total: yearTotal, count: yearCount },
    };
  }, [validOrders, nowMs]);

  const buckets: BucketPoint[] = useMemo(() => {
    if (range === '24h') {
      // 8 buckets of 3 hours each covering trailing 24h
      const bucketMs = 3 * 60 * 60 * 1000;
      const anchor = new Date(nowMs);
      anchor.setMinutes(0, 0, 0);
      const endMs = anchor.getTime() + 60 * 60 * 1000;
      const startMs = endMs - 8 * bucketMs;

      const pts: BucketPoint[] = Array.from({ length: 8 }, (_, idx) => {
        const bStart = new Date(startMs + idx * bucketMs);
        const bEnd = new Date(bStart.getTime() + bucketMs);
        const fmt = (d: Date) =>
          d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
        return {
          key: `h_${idx}`,
          label: `${fmt(bStart)} – ${fmt(bEnd)}`,
          shortLabel: fmt(bStart),
          value: 0,
          count: 0,
        };
      });

      for (const { order, ms } of validOrders) {
        if (ms < startMs || ms > endMs) continue;
        const idx = Math.min(7, Math.max(0, Math.floor((ms - startMs) / bucketMs)));
        pts[idx].value += Number(order.totalAmount) || 0;
        pts[idx].count += 1;
      }
      return pts;
    }

    if (range === '7d' || range === '30d') {
      const days = range === '7d' ? 7 : 30;
      const todayStart = new Date(nowMs);
      todayStart.setHours(0, 0, 0, 0);
      const dayMs = 24 * 60 * 60 * 1000;
      const startMs = todayStart.getTime() - (days - 1) * dayMs;
      const endMs = todayStart.getTime() + dayMs;

      const pts: BucketPoint[] = Array.from({ length: days }, (_, idx) => {
        const d = new Date(startMs + idx * dayMs);
        const full = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const short =
          range === '7d'
            ? d.toLocaleDateString('en-IN', { weekday: 'short' })
            : idx === 0 || idx === days - 1 || idx % 5 === 0
              ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
              : '';
        return {
          key: `d_${idx}`,
          label: full,
          shortLabel: short,
          value: 0,
          count: 0,
        };
      });

      for (const { order, ms } of validOrders) {
        if (ms < startMs || ms >= endMs) continue;
        const idx = Math.min(days - 1, Math.max(0, Math.floor((ms - startMs) / dayMs)));
        pts[idx].value += Number(order.totalAmount) || 0;
        pts[idx].count += 1;
      }
      return pts;
    }

    // 1y -> 12 calendar months ending with current month
    const nowDate = new Date(nowMs);
    const startMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() - 11, 1);
    const pts: BucketPoint[] = Array.from({ length: 12 }, (_, idx) => {
      const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + idx, 1);
      return {
        key: `${d.getFullYear()}_${d.getMonth()}`,
        label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        shortLabel: d.toLocaleDateString('en-IN', { month: 'short' }),
        value: 0,
        count: 0,
      };
    });

    for (const { order, ms } of validOrders) {
      const d = new Date(ms);
      const monthDiff =
        (d.getFullYear() - startMonth.getFullYear()) * 12 +
        (d.getMonth() - startMonth.getMonth());
      if (monthDiff >= 0 && monthDiff < 12) {
        pts[monthDiff].value += Number(order.totalAmount) || 0;
        pts[monthDiff].count += 1;
      }
    }
    return pts;
  }, [range, validOrders, nowMs]);

  const activeSummary = summaryByRange[range];
  const avgValue = activeSummary.count > 0 ? Math.round(activeSummary.total / activeSummary.count) : 0;
  const maxBucketValue = Math.max(...buckets.map((b) => b.value), 0);
  const yAxisMax = maxBucketValue > 0 ? Math.ceil((maxBucketValue * 1.15) / 100) * 100 : 1000;

  const activePoint =
    buckets.find((b) => b.key === hoveredKey) ||
    buckets.reduce<BucketPoint | null>(
      (best, curr) => (!best || curr.value > best.value ? curr : best),
      null
    );

  // SVG dimensions
  const chartW = 720;
  const chartH = 220;
  const padLeft = 58;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 32;
  const plotW = chartW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;
  const stepW = plotW / Math.max(1, buckets.length);
  const barW = Math.min(34, Math.max(8, stepW * 0.62));

  return (
    <section
      aria-label="Order value analytics"
      className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="w-5 h-5 text-orange-600 shrink-0" />
          <div>
            <h3 className="text-base font-bold text-slate-900">Order Value Analytics</h3>
            <p className="text-xs text-slate-500">
              Revenue breakdown across non-cancelled orders
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Order revenue timeframe"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-full"
        >
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={range === opt.id}
              onClick={() => {
                setRange(opt.id);
                setHoveredKey(null);
              }}
              className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                range === opt.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Timeframe Comparison Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {RANGE_OPTIONS.map((opt) => {
          const stat = summaryByRange[opt.id];
          const isSelected = range === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setRange(opt.id);
                setHoveredKey(null);
              }}
              className={`text-left p-3.5 rounded-xl border transition-colors ${
                isSelected
                  ? 'border-orange-600 bg-orange-50/60'
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <span className="text-xs font-medium text-slate-600 block">{opt.label}</span>
              <span className="text-lg font-bold font-mono-num text-slate-900 tabular-nums mt-0.5 block">
                ₹{stat.total.toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-slate-500 font-mono-num tabular-nums">
                {stat.count} {stat.count === 1 ? 'order' : 'orders'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Period Detail & Bar Graph */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-1">
          <div>
            <span>Selected period average: </span>
            <span className="font-bold font-mono-num text-slate-900 tabular-nums">
              ₹{avgValue.toLocaleString('en-IN')} / order
            </span>
          </div>
          {activePoint && (
            <div className="font-mono-num tabular-nums text-slate-700">
              <span>{activePoint.label}: </span>
              <span className="font-bold text-orange-700">
                ₹{activePoint.value.toLocaleString('en-IN')}
              </span>
              <span>
                {' '}
                ({activePoint.count} {activePoint.count === 1 ? 'order' : 'orders'})
              </span>
            </div>
          )}
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            role="img"
            aria-label={`Order revenue bar graph for ${RANGE_OPTIONS.find((o) => o.id === range)?.label}`}
            className="w-full min-w-[520px] h-56 select-none"
          >
            {/* Horizontal grid lines & Y-axis ticks */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padTop + plotH * (1 - ratio);
              const val = Math.round(yAxisMax * ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={chartW - padRight}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray={ratio === 0 ? undefined : '3 3'}
                    strokeWidth={1}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 text-[11px] font-mono-num"
                  >
                    {formatInrCompact(val)}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {buckets.map((bucket, idx) => {
              const barHeight =
                bucket.value > 0
                  ? Math.max(4, Math.round((bucket.value / yAxisMax) * plotH))
                  : 2;
              const x = padLeft + idx * stepW + (stepW - barW) / 2;
              const y = padTop + plotH - barHeight;
              const isHovered = hoveredKey === bucket.key;
              const fill =
                bucket.value <= 0
                  ? '#cbd5e1'
                  : isHovered
                    ? '#c2410c'
                    : '#ea580c';

              return (
                <g
                  key={bucket.key}
                  onMouseEnter={() => setHoveredKey(bucket.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className="cursor-pointer"
                >
                  {/* Invisible wider hit column */}
                  <rect
                    x={padLeft + idx * stepW}
                    y={padTop}
                    width={stepW}
                    height={plotH}
                    fill="transparent"
                  />
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barHeight}
                    rx={bucket.value > 0 ? 4 : 1}
                    fill={fill}
                  >
                    <title>
                      {`${bucket.label}: ₹${bucket.value.toLocaleString('en-IN')} (${bucket.count} orders)`}
                    </title>
                  </rect>
                  {bucket.shortLabel && (
                    <text
                      x={x + barW / 2}
                      y={chartH - 10}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono-num"
                    >
                      {bucket.shortLabel}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
};

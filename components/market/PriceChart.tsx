"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Timeframe } from "@/lib/market/gecko";
import { clsx } from "@/lib/clsx";
import { formatPrice, formatUsd } from "@/lib/format";

/**
 * Price chart.
 *
 * Built on lightweight-charts, which is TradingView's own renderer. The hosted
 * TradingView widget is not an option here: it can only draw symbols listed on
 * exchanges it already indexes, and a pool that opened four minutes ago on
 * Robinhood Chain will never be one of them. Drawing our own candles from the
 * pool's OHLCV is the only way this chart works for the tokens the product
 * exists to show.
 *
 * Indicators are computed here rather than fetched. They are all functions of
 * the candles already on screen, and a round trip to recompute a moving average
 * would be slower than doing it and pointless either way.
 */

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

type Overlay = "ema9" | "ema21" | "sma50" | "vwap" | "bb";

const OVERLAYS: { id: Overlay; label: string; colour: string }[] = [
  { id: "ema9", label: "EMA 9", colour: "#f2b705" },
  { id: "ema21", label: "EMA 21", colour: "#4a9eff" },
  { id: "sma50", label: "SMA 50", colour: "#c77dff" },
  { id: "vwap", label: "VWAP", colour: "#ff7ac6" },
  { id: "bb", label: "Bollinger", colour: "#8d97a5" },
];

type Point = { time: UTCTimestamp; value: number };

function ema(candles: Candle[], period: number): Point[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const out: Point[] = [];
  let prev = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  out.push({ time: candles[period - 1].time as UTCTimestamp, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time as UTCTimestamp, value: prev });
  }
  return out;
}

function sma(candles: Candle[], period: number): Point[] {
  if (candles.length < period) return [];
  const out: Point[] = [];
  let sum = candles.slice(0, period).reduce((s, c) => s + c.close, 0);
  out.push({ time: candles[period - 1].time as UTCTimestamp, value: sum / period });
  for (let i = period; i < candles.length; i++) {
    sum += candles[i].close - candles[i - period].close;
    out.push({ time: candles[i].time as UTCTimestamp, value: sum / period });
  }
  return out;
}

/**
 * Session VWAP is meaningless on a pool with no session, so this is a running
 * volume-weighted average over the whole loaded window. Labelled VWAP because
 * that is what traders call it; it is the honest version for a 24/7 market.
 */
function vwap(candles: Candle[]): Point[] {
  let pv = 0;
  let vol = 0;
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * (c.volume || 0);
    vol += c.volume || 0;
    return {
      time: c.time as UTCTimestamp,
      value: vol > 0 ? pv / vol : c.close,
    };
  });
}

function bollinger(
  candles: Candle[],
  period = 20,
  mult = 2,
): { upper: Point[]; lower: Point[] } {
  const upper: Point[] = [];
  const lower: Point[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, c) => s + c.close, 0) / period;
    const variance =
      slice.reduce((s, c) => s + (c.close - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const time = candles[i].time as UTCTimestamp;
    upper.push({ time, value: mean + mult * sd });
    lower.push({ time, value: mean - mult * sd });
  }
  return { upper, lower };
}

export function PriceChart({
  poolAddress,
  initialCandles,
  initialTimeframe = "1h",
}: {
  poolAddress: string;
  initialCandles: Candle[];
  initialTimeframe?: Timeframe;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const chart = useRef<IChartApi | null>(null);
  const price = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lines = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [candles, setCandles] = useState<Candle[]>(initialCandles);
  const [loading, setLoading] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const [active, setActive] = useState<Set<Overlay>>(new Set(["ema21"]));
  const [hover, setHover] = useState<Candle | null>(null);

  const last = candles.at(-1) ?? null;
  const shown = hover ?? last;

  const change = useMemo(() => {
    if (candles.length < 2) return null;
    const first = candles[0].open;
    const close = (shown ?? candles.at(-1))!.close;
    return first > 0 ? ((close - first) / first) * 100 : null;
  }, [candles, shown]);

  // ── Build the chart once. ──────────────────────────────────────────
  useEffect(() => {
    const el = box.current;
    if (!el) return;

    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const ink3 = token("--c-ink-3") || "#989d98";
    const lineSoft = token("--c-line-soft") || "#212422";
    const up = token("--c-green") || "#CCFF00";
    const down = token("--c-red") || "#f24522";

    const c = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: ink3,
        fontFamily: css.getPropertyValue("--font-mono") || "monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: lineSoft },
        horzLines: { color: lineSoft },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: ink3, width: 1, style: 3, labelBackgroundColor: up },
        horzLine: { color: ink3, width: 1, style: 3, labelBackgroundColor: up },
      },
      rightPriceScale: { borderColor: lineSoft, scaleMargins: { top: 0.08, bottom: 0.28 } },
      timeScale: { borderColor: lineSoft, timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
    });

    price.current = c.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
      priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
    });

    volume.current = c.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    c.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    c.subscribeCrosshairMove((param) => {
      if (!param.time || !price.current) {
        setHover(null);
        return;
      }
      const bar = param.seriesData.get(price.current) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      if (!bar) {
        setHover(null);
        return;
      }
      setHover({
        time: param.time as number,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: 0,
      });
    });

    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      price.current = null;
      volume.current = null;
      lines.current.clear();
    };
  }, []);

  // ── Feed it data. ──────────────────────────────────────────────────
  useEffect(() => {
    if (!price.current || !volume.current) return;

    price.current.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const css = getComputedStyle(document.documentElement);
    const up = css.getPropertyValue("--c-green-line").trim() || "#13471b";
    const down = css.getPropertyValue("--c-red-line").trim() || "#611e11";

    volume.current.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? up : down,
      })),
    );

    chart.current?.timeScale().fitContent();
  }, [candles]);

  // ── Overlays. ──────────────────────────────────────────────────────
  useEffect(() => {
    const c = chart.current;
    if (!c) return;

    const wanted = new Map<string, { data: Point[]; colour: string }>();
    if (active.has("ema9")) wanted.set("ema9", { data: ema(candles, 9), colour: "#f2b705" });
    if (active.has("ema21")) wanted.set("ema21", { data: ema(candles, 21), colour: "#4a9eff" });
    if (active.has("sma50")) wanted.set("sma50", { data: sma(candles, 50), colour: "#c77dff" });
    if (active.has("vwap")) wanted.set("vwap", { data: vwap(candles), colour: "#ff7ac6" });
    if (active.has("bb")) {
      const { upper, lower } = bollinger(candles);
      wanted.set("bb-upper", { data: upper, colour: "#8d97a5" });
      wanted.set("bb-lower", { data: lower, colour: "#8d97a5" });
    }

    for (const [key, series] of lines.current) {
      if (!wanted.has(key)) {
        c.removeSeries(series);
        lines.current.delete(key);
      }
    }

    for (const [key, { data, colour }] of wanted) {
      let series = lines.current.get(key);
      if (!series) {
        series = c.addSeries(LineSeries, {
          color: colour,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        lines.current.set(key, series);
      }
      series.setData(data);
    }
  }, [active, candles]);

  useEffect(() => {
    chart.current
      ?.priceScale("right")
      .applyOptions({ mode: logScale ? 1 : 0 });
  }, [logScale]);

  // ── Timeframe. ─────────────────────────────────────────────────────
  async function pick(tf: Timeframe) {
    if (tf === timeframe) return;
    setTimeframe(tf);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/candles?pool=${poolAddress}&tf=${tf}`,
      );
      if (res.ok) setCandles((await res.json()) as Candle[]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col">
      {/* ── Controls ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft px-4 py-2.5">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => pick(tf)}
              aria-pressed={tf === timeframe}
              className={clsx(
                "tnum shrink-0 rounded-md px-2.5 py-1 text-micro transition-colors duration-100",
                tf === timeframe
                  ? "bg-surface-2 text-ink"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        <span className="h-4 w-px shrink-0 bg-line" aria-hidden="true" />

        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {OVERLAYS.map((o) => {
            const on = active.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setActive((prev) => {
                    const next = new Set(prev);
                    if (next.has(o.id)) next.delete(o.id);
                    else next.add(o.id);
                    return next;
                  })
                }
                className={clsx(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-micro whitespace-nowrap",
                  "transition-colors duration-100",
                  on ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                <span
                  className="h-0.5 w-3 rounded-full"
                  style={{ background: on ? o.colour : "currentColor" }}
                />
                {o.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setLogScale((v) => !v)}
          aria-pressed={logScale}
          className={clsx(
            "ml-auto shrink-0 rounded-md px-2.5 py-1 text-micro transition-colors duration-100",
            logScale ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink",
          )}
        >
          Log
        </button>
      </div>

      {/* ── OHLC readout ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line-soft px-4 py-2">
        <Reading label="O" value={shown ? formatPrice(shown.open) : null} />
        <Reading label="H" value={shown ? formatPrice(shown.high) : null} />
        <Reading label="L" value={shown ? formatPrice(shown.low) : null} />
        <Reading label="C" value={shown ? formatPrice(shown.close) : null} />
        {last && (
          <Reading label="Vol" value={formatUsd(last.volume)} />
        )}
        {change !== null && (
          <span
            className={clsx(
              "tnum text-micro",
              change > 0 ? "text-green" : change < 0 ? "text-red" : "text-ink-2",
            )}
          >
            {change > 0 ? "+" : ""}
            {change.toFixed(2)}%
          </span>
        )}
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────── */}
      <div className="relative">
        <div ref={box} className="h-[340px] w-full md:h-[460px]" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/60">
            <span className="text-micro text-ink-3">Loading</span>
          </div>
        )}
        {!loading && candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-body text-ink-3">
              No candles for this timeframe yet
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Reading({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-micro text-ink-3">{label}</span>
      <span className="tnum text-micro text-ink">{value ?? "-"}</span>
    </span>
  );
}

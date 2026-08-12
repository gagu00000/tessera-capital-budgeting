/**
 * Tornado chart — required output 12.
 *
 * One bar per driver, spanning the NPV produced at the adverse end of its
 * plausible range to the NPV at the favourable end, sorted by the width of that
 * span. The widest bar is the assumption the decision actually turns on.
 *
 * Two things this chart does that a default tornado usually does not:
 *
 *  - the bar is split at the BASE-CASE NPV rather than at zero, so the two
 *    halves read directly as "how much worse" and "how much better" than the
 *    published case, which is the comparison a reader is actually making;
 *  - the NPV = 0 line is drawn explicitly, so a bar crossing it is visibly a
 *    driver capable of flipping the decision on its own.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { TornadoBar } from '../engine/sensitivity';
import { linearScale, ticks } from './scale';
import { compactMoney, money, driverValue } from '../lib/format';
import { TONE_HEX, TONE_RGB, driverTone } from '../ui/primitives';

const ROW_HEIGHT = 40;
const BAR_HEIGHT = 20;
const LABEL_WIDTH = 178;
const RIGHT_GUTTER = 124; // wide enough for a currency switching value
const TOP_PAD = 26;
const BOTTOM_PAD = 34;

export function Tornado({
  bars,
  baseNpv,
  width = 900,
}: {
  bars: TornadoBar[];
  baseNpv: number;
  width?: number;
}) {
  const [active, setActive] = useState<string | null>(null);

  const height = TOP_PAD + bars.length * ROW_HEIGHT + BOTTOM_PAD;
  const plotLeft = LABEL_WIDTH;
  const plotRight = width - RIGHT_GUTTER;

  const values = bars.flatMap((b) => [b.npvAtMin, b.npvAtMax]);
  const lo = Math.min(...values, baseNpv, 0);
  const hi = Math.max(...values, baseNpv, 0);
  const pad = (hi - lo) * 0.08 || 1;

  const x = linearScale([lo - pad, hi + pad], [plotLeft, plotRight]);
  const axisTicks = ticks([lo - pad, hi + pad], 5);

  return (
    /**
     * The entrance animation lives on this HTML wrapper, not on the SVG rows.
     * framer-motion's whileInView relies on IntersectionObserver, and observing
     * SVG child elements is unreliable — the rows silently stayed at opacity 0
     * and the entire chart body vanished. Nothing inside the <svg> is animated,
     * so the geometry is correct whether or not any animation ever runs.
     */
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="-mx-2 overflow-x-auto"
    >
      {/* Scales to the panel rather than sitting at a fixed pixel width, which
          previously overflowed the container and clipped the right gutter. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full min-w-[680px]"
        role="img"
        aria-label="Tornado chart of net present value sensitivity by driver"
      >
        {/* Gridlines */}
        {axisTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={TOP_PAD - 8}
              y2={height - BOTTOM_PAD}
              stroke="rgb(255 255 255 / 0.055)"
            />
            <text
              x={x(tick)}
              y={height - BOTTOM_PAD + 16}
              textAnchor="middle"
              className="numeric"
              fontSize="9.5"
              fill="#5d6577"
            >
              {compactMoney(tick)}
            </text>
          </g>
        ))}

        {/* NPV = 0 — the line that decides accept from reject */}
        <line
          x1={x(0)}
          x2={x(0)}
          y1={TOP_PAD - 12}
          y2={height - BOTTOM_PAD + 2}
          stroke={TONE_HEX.amber}
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.75}
        />
        <text
          x={x(0)}
          y={TOP_PAD - 16}
          textAnchor="middle"
          className="numeric"
          fontSize="9"
          fill={TONE_HEX.amber}
        >
          NPV 0
        </text>

        {/* Base case */}
        <line
          x1={x(baseNpv)}
          x2={x(baseNpv)}
          y1={TOP_PAD - 4}
          y2={height - BOTTOM_PAD}
          stroke="rgb(255 255 255 / 0.4)"
          strokeWidth={1}
        />

        {bars.map((bar, i) => {
          const y = TOP_PAD + i * ROW_HEIGHT;
          const tone = driverTone(bar.driver.tone);
          const isActive = active === bar.driver.id;

          const adverseFrom = Math.min(x(bar.npvAtMin), x(baseNpv));
          const adverseTo = Math.max(x(bar.npvAtMin), x(baseNpv));
          const favourFrom = Math.min(x(baseNpv), x(bar.npvAtMax));
          const favourTo = Math.max(x(baseNpv), x(bar.npvAtMax));

          return (
            <g
              key={bar.driver.id}
              onMouseEnter={() => setActive(bar.driver.id)}
              onMouseLeave={() => setActive(null)}
              style={{ cursor: 'default' }}
            >
              <rect
                x={0}
                y={y}
                width={width}
                height={ROW_HEIGHT}
                fill={isActive ? 'rgb(255 255 255 / 0.035)' : 'transparent'}
              />

              <text
                x={LABEL_WIDTH - 14}
                y={y + ROW_HEIGHT / 2 + 3.5}
                textAnchor="end"
                fontSize="11.5"
                fill={isActive ? '#e8ecf5' : '#b6bfd2'}
              >
                {bar.driver.label}
              </text>

              {/* Adverse half.
                  Plain rects, not motion.rect: animating the SVG `width` and `x`
                  ATTRIBUTES left every bar stuck at width 0 when the enter
                  animation did not fire, which is exactly what happened on a
                  tall section captured outside the viewport. The row group
                  fades in instead, so the geometry is always correct even if
                  the animation never runs. */}
              <rect
                x={adverseFrom}
                width={adverseTo - adverseFrom}
                y={y + (ROW_HEIGHT - BAR_HEIGHT) / 2}
                height={BAR_HEIGHT}
                rx={3}
                fill={`rgb(${TONE_RGB.plasma} / ${isActive ? 0.55 : 0.34})`}
                stroke={`rgb(${TONE_RGB.plasma} / 0.55)`}
                strokeWidth={0.75}
              />

              {/* Favourable half */}
              <rect
                x={favourFrom}
                width={favourTo - favourFrom}
                y={y + (ROW_HEIGHT - BAR_HEIGHT) / 2}
                height={BAR_HEIGHT}
                rx={3}
                fill={`rgb(${TONE_RGB.verdant} / ${isActive ? 0.5 : 0.3})`}
                stroke={`rgb(${TONE_RGB.verdant} / 0.5)`}
                strokeWidth={0.75}
              />

              {/* Switching value — where this driver alone takes NPV to zero */}
              {bar.switchingValue !== null && (
                <g>
                  <circle
                    cx={x(0)}
                    cy={y + ROW_HEIGHT / 2}
                    r={2.6}
                    fill={TONE_HEX.amber}
                    opacity={0.9}
                  />
                  <text
                    x={plotRight + 10}
                    y={y + ROW_HEIGHT / 2 + 3.5}
                    fontSize="10"
                    className="numeric"
                    fill={isActive ? TONE_HEX.amber : '#5d6577'}
                  >
                    {driverValue(bar.switchingValue, bar.driver.format)}
                  </text>
                </g>
              )}

              <circle
                cx={LABEL_WIDTH - 6}
                cy={y + ROW_HEIGHT / 2}
                r={2}
                fill={TONE_HEX[tone]}
                opacity={0.85}
              />
            </g>
          );
        })}

        <text
          x={plotRight + 10}
          y={TOP_PAD - 16}
          fontSize="9"
          fill="#5d6577"
          className="numeric"
        >
          flips at
        </text>
      </svg>

      {/* Detail for whichever bar is hovered */}
      <div className="mt-3 min-h-[3.4rem] rounded-lg bg-black/25 px-4 py-3">
        {(() => {
          const bar = bars.find((b) => b.driver.id === active) ?? bars[0];
          return (
            <>
              <p className="text-[0.76rem] text-slate-200">
                {bar.driver.label}
                <span className="ml-2 text-[0.7rem] text-slate-500">
                  swings NPV by AED {money(bar.swing)}
                </span>
              </p>
              <p className="mt-1 text-[0.7rem] leading-relaxed text-slate-500">
                {bar.driver.description}
                {bar.switchingValue !== null && (
                  <>
                    {' '}
                    NPV reaches zero at{' '}
                    <span className="numeric" style={{ color: TONE_HEX.amber }}>
                      {driverValue(bar.switchingValue, bar.driver.format)}
                    </span>
                    , against a base case of{' '}
                    <span className="numeric">
                      {driverValue(bar.driver.base, bar.driver.format)}
                    </span>
                    .
                  </>
                )}
              </p>
            </>
          );
        })()}
      </div>
    </motion.div>
  );
}

/**
 * Two-way sensitivity grid.
 *
 * A tornado moves one driver at a time, which hides interaction: two drivers
 * that are each survivable alone can be fatal together. This grid crosses the
 * two that matter most and colours every cell by the NPV it produces, so the
 * boundary between accept and reject is visible as a shape rather than inferred
 * from a list.
 *
 * The colour scale is diverging and anchored at zero — not at the midpoint of
 * the data — because zero is the only value in this chart that carries a
 * decision. A sequential scale would put its brightest colour at the best cell
 * and say nothing about which cells are acceptable.
 */

import { useState } from 'react';
import type { Driver, TwoWayCell } from '../engine/sensitivity';
import { money, driverValue } from '../lib/format';
import { TONE_HEX } from '../ui/primitives';

export function Heatmap2D({
  cells,
  driverX,
  driverY,
  steps,
  baseX,
  baseY,
}: {
  cells: TwoWayCell[];
  driverX: Driver;
  driverY: Driver;
  steps: number;
  baseX: number;
  baseY: number;
}) {
  const [hover, setHover] = useState<TwoWayCell | null>(null);

  const npvs = cells.map((c) => c.npv);
  const maxAbs = Math.max(Math.abs(Math.min(...npvs)), Math.abs(Math.max(...npvs))) || 1;

  const xValues = [...new Set(cells.map((c) => c.x))].sort((a, b) => a - b);
  const yValues = [...new Set(cells.map((c) => c.y))].sort((a, b) => a - b);

  // Which column/row is closest to the published base case, so it can be marked.
  const nearest = (values: number[], target: number) =>
    values.reduce(
      (best, v, i) => (Math.abs(v - target) < Math.abs(values[best] - target) ? i : best),
      0,
    );
  const baseCol = nearest(xValues, baseX);
  const baseRow = nearest(yValues, baseY);

  return (
    <div>
      <div className="flex gap-3">
        {/* Y axis */}
        <div className="flex shrink-0 flex-col justify-between py-0.5 text-right">
          {[...yValues].reverse().map((v, i) => (
            <span
              key={i}
              className="numeric text-[0.62rem] leading-none text-slate-500"
              style={{ height: `${100 / steps}%` }}
            >
              {driverValue(v, driverY.format)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="grid gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))` }}
          >
            {[...yValues].reverse().map((yv, rowFromTop) =>
              xValues.map((xv, col) => {
                const cell = cells.find((c) => c.x === xv && c.y === yv)!;
                const isBase =
                  col === baseCol && rowFromTop === yValues.length - 1 - baseRow;
                const positive = cell.npv >= 0;
                const intensity = Math.min(1, Math.abs(cell.npv) / maxAbs);

                return (
                  <div
                    key={`${rowFromTop}-${col}`}
                    onMouseEnter={() => setHover(cell)}
                    onMouseLeave={() => setHover(null)}
                    className="relative aspect-square rounded-[2px] transition-transform duration-150 hover:scale-[1.12] hover:z-10"
                    style={{
                      background: positive
                        ? `rgb(75 227 155 / ${0.1 + intensity * 0.72})`
                        : `rgb(255 79 216 / ${0.1 + intensity * 0.72})`,
                      outline: isBase ? `1.5px solid ${TONE_HEX.amber}` : undefined,
                      outlineOffset: isBase ? '1px' : undefined,
                    }}
                    title={`${driverX.label} ${driverValue(xv, driverX.format)}, ${driverY.label} ${driverValue(yv, driverY.format)} → NPV ${money(cell.npv)}`}
                  />
                );
              }),
            )}
          </div>

          {/* X axis */}
          <div
            className="mt-1.5 grid gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))` }}
          >
            {xValues.map((v, i) => (
              <span
                key={i}
                className="numeric truncate text-center text-[0.58rem] text-slate-500"
              >
                {i % 2 === 0 ? driverValue(v, driverX.format) : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[0.66rem] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'rgb(255 79 216 / 0.75)' }} />
            NPV negative
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'rgb(75 227 155 / 0.75)' }} />
            NPV positive
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ outline: `1.5px solid ${TONE_HEX.amber}` }}
            />
            base case
          </span>
        </div>

        <p className="numeric text-[0.7rem] text-slate-300">
          {hover ? (
            <>
              {driverValue(hover.x, driverX.format)} · {driverValue(hover.y, driverY.format)} →{' '}
              <span style={{ color: hover.npv >= 0 ? TONE_HEX.verdant : TONE_HEX.plasma }}>
                AED {money(hover.npv)}
              </span>
            </>
          ) : (
            <span className="text-slate-600">Hover a cell for its NPV</span>
          )}
        </p>
      </div>
    </div>
  );
}

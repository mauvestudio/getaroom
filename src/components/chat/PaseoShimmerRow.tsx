import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

interface PaseoShimmerRowProps {
  label: string;
  secondaryLabel?: string;
  labelClassName?: string;
  secondaryClassName?: string;
  className?: string;
}

type ShimmerStyle = CSSProperties & {
  "--paseo-shimmer-start": string;
  "--paseo-shimmer-end": string;
  "--paseo-shimmer-width": string;
  "--paseo-shimmer-duration": string;
};

/** Paseo ToolCallBadge's measured web text overlay, ported from installed bundle module 5403. */
export function PaseoShimmerRow({
  label,
  secondaryLabel,
  labelClassName = "",
  secondaryClassName = "",
  className = "",
}: PaseoShimmerRowProps) {
  const rowRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const secondaryRef = useRef<HTMLSpanElement>(null);
  const [layout, setLayout] = useState({ labelX: 0, labelWidth: 0, secondaryX: 0, secondaryWidth: 0 });

  useEffect(() => {
    const row = rowRef.current;
    const labelNode = labelRef.current;
    if (!row || !labelNode) return;

    const measure = () => {
      const rowRect = row.getBoundingClientRect();
      const labelRect = labelNode.getBoundingClientRect();
      const secondaryRect = secondaryRef.current?.getBoundingClientRect();
      const next = {
        labelX: labelRect.left - rowRect.left,
        labelWidth: labelRect.width,
        secondaryX: secondaryRect ? secondaryRect.left - rowRect.left : 0,
        secondaryWidth: secondaryRect?.width ?? 0,
      };
      setLayout((current) => (
        Math.abs(current.labelX - next.labelX) > 0.5 ||
        Math.abs(current.labelWidth - next.labelWidth) > 0.5 ||
        Math.abs(current.secondaryX - next.secondaryX) > 0.5 ||
        Math.abs(current.secondaryWidth - next.secondaryWidth) > 0.5
          ? next
          : current
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(labelNode);
    if (secondaryRef.current) observer.observe(secondaryRef.current);
    return () => observer.disconnect();
  }, [label, secondaryLabel]);

  const textLength = label.trim().length + (secondaryLabel?.trim().length ?? 0);
  const duration = Math.max(1, Math.min(2.3, 1.25 + 0.008 * textLength - (textLength <= 12 ? 0.25 : 0)));
  const trackStart = layout.labelX;
  const trackEnd = layout.secondaryWidth > 0
    ? layout.secondaryX + layout.secondaryWidth
    : layout.labelX + layout.labelWidth;
  const peakWidth = Math.max(42, Math.min(120, 0.22 * Math.max(1, trackEnd - trackStart)));
  const makeStyle = (offsetX: number): ShimmerStyle => ({
    "--paseo-shimmer-start": `${trackStart - peakWidth - offsetX}px`,
    "--paseo-shimmer-end": `${trackEnd - offsetX}px`,
    "--paseo-shimmer-width": `${peakWidth}px`,
    "--paseo-shimmer-duration": `${duration}s`,
  });

  return (
    <span ref={rowRef} className={`paseo-shimmer-row ${className}`}>
      <span ref={labelRef} className={labelClassName}>{label}</span>
      {secondaryLabel && <span ref={secondaryRef} className={secondaryClassName}>{secondaryLabel}</span>}
      <span aria-hidden="true" className="paseo-shimmer-row__overlay">
        <span style={makeStyle(layout.labelX)} className={`paseo-shimmer-row__text ${labelClassName}`}>{label}</span>
        {secondaryLabel && (
          <span style={makeStyle(layout.secondaryX)} className={`paseo-shimmer-row__text ${secondaryClassName}`}>
            {secondaryLabel}
          </span>
        )}
      </span>
    </span>
  );
}

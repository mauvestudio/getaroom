import blackMark from "../../../public/getaroom-black.webp" with { type: "file" };
import whiteMark from "../../../public/getaroom-white.webp" with { type: "file" };
import { cn } from "../../lib/utils";

/** Les fonds des sources se fondent avec la surface, sans carré visible. */
export function GetaroomMark({ className, label }: { className?: string; label?: string }) {
  return <span className={cn("inline-flex shrink-0 overflow-hidden", className)} role={label ? "img" : undefined} aria-label={label}>
    <img src={blackMark} alt="" className="h-full w-full scale-[1.5] object-contain mix-blend-multiply dark:hidden" />
    <img src={whiteMark} alt="" className="hidden h-full w-full scale-[1.5] object-contain mix-blend-screen dark:block" />
  </span>;
}

import type { ReactNode } from "react";

const paths = {
  search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></>,
  chevron: <path d="m6 3.5 4.5 4.5L6 12.5" />,
  close: <path d="m4 4 8 8m0-8-8 8" />,
  refresh: <><path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.75" /><path d="M13.2 2.6v3.2H10" /></>,
  copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></>,
  check: <path d="m3 8.5 3 3 7-7" />,
  lock: <><rect x="3" y="7" width="10" height="7" rx="1.2" fill="currentColor" stroke="none" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></>,
  globe: <><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></>,
  help: <><circle cx="8" cy="8" r="6" strokeDasharray="2.2 1.6" /><path d="M6.2 6.4a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.8.6-.8 1.2" /><circle cx="8" cy="11.3" r=".8" fill="currentColor" stroke="none" /></>,
} satisfies Record<string, ReactNode>;

/** Small, static interface glyphs keep the reference's exact control geometry. */
export const ImageIcon = ({ name }: { name: keyof typeof paths }) => (
  <svg viewBox="0 0 16 16" width={name === "lock" || name === "globe" || name === "help" ? 10 : name === "search" || name === "refresh" ? 14 : 12}
    height={name === "lock" || name === "globe" || name === "help" ? 10 : name === "search" || name === "refresh" ? 14 : 12}
    fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths[name]}
  </svg>
);

export const ImageSortIcon = ({ direction }: { direction?: "ascending" | "descending" }) => (
  <svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={direction === "ascending" ? "M5 8.5v-7M2.5 4 5 1.5 7.5 4" : direction === "descending" ? "M5 1.5v7M2.5 6 5 8.5 7.5 6" : "M3 4l2-2.2L7 4M3 6l2 2.2L7 6"} />
  </svg>
);

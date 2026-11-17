/** Highest page number a listing accepts; any more is treated as page 1. */
const MAX_PAGE = 10_000;

/** A listing's ?page= value as a page number from 1, or 1 if it's missing or not a sensible number. */
export function pageParam(value: string | string[] | undefined): number {
  const n = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_PAGE ? n : 1;
}

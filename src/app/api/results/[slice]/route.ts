import { NextResponse } from "next/server";
import { getFeed } from "@/lib/raceFeed";
import { RESULTS_YEAR } from "@/lib/race";
import { YEARS } from "@/lib/years";
import type { Slice } from "@/lib/types";

const VALID = new Set<Slice>(["overall", "men", "women", "teams"]);
const VALID_YEARS = new Set<number>(YEARS.map((y) => y.year));

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slice: string }> },
) {
  const { slice } = await ctx.params;
  if (!VALID.has(slice as Slice)) {
    return NextResponse.json({ error: "unknown slice" }, { status: 404 });
  }
  // ?year=YYYY; default to the currently-loaded results year. Invalid /
  // unknown years also fall back so we never 500 on a stale client poll.
  const yearParam = new URL(req.url).searchParams.get("year");
  const yearInt = yearParam ? parseInt(yearParam, 10) : NaN;
  const year =
    Number.isFinite(yearInt) && VALID_YEARS.has(yearInt) ? yearInt : RESULTS_YEAR;
  try {
    const feed = await getFeed(slice as Slice, year);
    return NextResponse.json(feed, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

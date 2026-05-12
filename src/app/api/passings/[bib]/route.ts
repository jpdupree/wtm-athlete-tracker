import { NextResponse } from "next/server";
import { getPassingsForBib } from "@/lib/passings";
import { RESULTS_YEAR } from "@/lib/race";
import { YEARS } from "@/lib/years";

const VALID_YEARS = new Set<number>(YEARS.map((y) => y.year));

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ bib: string }> },
) {
  const { bib: bibParam } = await ctx.params;
  const bib = parseInt(bibParam, 10);
  if (!Number.isFinite(bib)) {
    return NextResponse.json({ error: "invalid bib" }, { status: 400 });
  }
  const yearParam = new URL(req.url).searchParams.get("year");
  const yearInt = yearParam ? parseInt(yearParam, 10) : NaN;
  const year =
    Number.isFinite(yearInt) && VALID_YEARS.has(yearInt) ? yearInt : RESULTS_YEAR;
  try {
    const data = await getPassingsForBib(bib, year);
    return NextResponse.json(
      { bib, year, ...data },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

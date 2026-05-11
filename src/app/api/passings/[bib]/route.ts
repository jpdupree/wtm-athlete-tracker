import { NextResponse } from "next/server";
import { getPassingsForBib } from "@/lib/passings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ bib: string }> },
) {
  const { bib: bibParam } = await ctx.params;
  const bib = parseInt(bibParam, 10);
  if (!Number.isFinite(bib)) {
    return NextResponse.json({ error: "invalid bib" }, { status: 400 });
  }
  try {
    const data = await getPassingsForBib(bib);
    return NextResponse.json(
      { bib, ...data },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

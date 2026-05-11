import { NextResponse } from "next/server";
import { getFeed } from "@/lib/raceFeed";
import type { Slice } from "@/lib/types";

const VALID = new Set<Slice>(["overall", "men", "women", "teams"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slice: string }> },
) {
  const { slice } = await ctx.params;
  if (!VALID.has(slice as Slice)) {
    return NextResponse.json({ error: "unknown slice" }, { status: 404 });
  }
  try {
    const feed = await getFeed(slice as Slice);
    return NextResponse.json(feed, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

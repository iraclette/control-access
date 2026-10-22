import { NextRequest, NextResponse } from "next/server";

// Server-side relay from the developer console to the access backend's read-only /v2/dev
// API. The browser never talks to the backend directly, so the backend needs no CORS and its
// address stays private. Authorization is the staff member's own Supabase token: the
// backend verifies it and checks the `dev` role itself; this route just passes it through.
const ALLOWED = new Set(["overview", "devices", "firmware", "buildings", "scans"]);

export async function GET(request: NextRequest, { params }: RouteContext<"/api/dev/[...path]">) {
  const { path } = await params;
  const endpoint = path.join("/");
  if (!ALLOWED.has(endpoint)) return NextResponse.json({ detail: "not found" }, { status: 404 });

  const base = process.env.ACCESS_API_URL;
  if (!base) return NextResponse.json({ detail: "ACCESS_API_URL is not set" }, { status: 503 });

  const authorization = request.headers.get("authorization");
  if (!authorization) return NextResponse.json({ detail: "missing token" }, { status: 401 });

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/v2/dev/${endpoint}`, {
      headers: { Authorization: authorization },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return new NextResponse(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ detail: "access backend unreachable" }, { status: 502 });
  }
}

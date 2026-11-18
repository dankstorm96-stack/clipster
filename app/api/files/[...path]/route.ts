import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { DATA_DIR } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves only rendered clips: data/<uuid>/clips/*.mp4, with Range support for <video>.
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const rel = parts.join("/");
  if (!/^[0-9a-f-]{36}\/clips\/clip\d+\.mp4$/.test(rel)) return new Response("Not found", { status: 404 });
  const file = path.join(DATA_DIR, rel);
  let size: number;
  try { size = fs.statSync(file).size; } catch { return new Response("Not found", { status: 404 }); }
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  const headers: Record<string, string> = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes" };
  if (range) {
    const start = range[1] ? parseInt(range[1]) : 0;
    const end = range[2] ? parseInt(range[2]) : size - 1;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = String(end - start + 1);
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers["Content-Length"] = String(size);
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers });
}

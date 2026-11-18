import { NextResponse } from "next/server";
import { pool, ready } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = await pool.query("select id,title,status,stage,error,duration,created_at from projects where id=$1", [id]);
  if (!p.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const c = await pool.query("select id,title,reason,score,start_s,end_s,file_path from clips where project_id=$1 order by score desc", [id]);
  return NextResponse.json({ ...p.rows[0], clips: c.rows });
}

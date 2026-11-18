import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = await pool.query(
    "select id,title,status,stage,error,duration,created_at from projects where id=$1 and user_id=$2",
    [id, user.id],
  );
  if (!p.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const c = await pool.query("select id,title,reason,score,start_s,end_s,file_path from clips where project_id=$1 order by score desc", [id]);
  return NextResponse.json({ ...p.rows[0], clips: c.rows });
}

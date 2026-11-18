import { NextResponse } from "next/server";
import { startSession, verifyPassword } from "@/lib/auth";
import { pool, ready } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await ready();
  const { email, password } = await req.json().catch(() => ({}));
  const { rows } = await pool.query("select id,password_hash from users where email=$1", [String(email ?? "").toLowerCase()]);
  if (!rows[0] || typeof password !== "string" || !verifyPassword(password, rows[0].password_hash))
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  await startSession(rows[0].id);
  return NextResponse.json({ ok: true });
}

"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
    if (r.ok) router.push("/dashboard");
    else setErr((await r.json()).error ?? "Something went wrong");
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-2xl font-bold">{mode === "login" ? "Sign in" : "Create account"}</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input name="email" type="email" required placeholder="Email" className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" />
        <input name="password" type="password" required minLength={8} placeholder="Password (8+ characters)" className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="w-full rounded-lg bg-black px-4 py-2 font-medium text-white dark:bg-white dark:text-black">
          {mode === "login" ? "Sign in" : "Sign up"}
        </button>
      </form>
      <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); }} className="mt-4 text-sm text-neutral-500 underline">
        {mode === "login" ? "No account? Sign up" : "Have an account? Sign in"}
      </button>
    </main>
  );
}

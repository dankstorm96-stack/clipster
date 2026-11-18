import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { pool, ready } from "./db";

export const DATA_DIR = path.join(process.cwd(), "data");

type Seg = { start: number; end: number; text: string };
type Pick = { title: string; reason: string; score: number; start: number; end: number };

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${c}: ${err.slice(-400)}`))));
  });
}

async function setStage(id: string, stage: string, status = "processing") {
  await pool.query("update projects set stage=$2, status=$3 where id=$1", [id, stage, status]);
}

async function duration(file: string): Promise<number> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(out) || 0;
}

/** Whisper if OPENAI_API_KEY is set; otherwise evenly spaced placeholder segments. */
async function transcribe(audio: string, dur: number): Promise<Seg[]> {
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    const form = new FormData();
    form.append("file", new Blob([await fs.readFile(audio)]), "audio.mp3");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!r.ok) throw new Error(`Transcription failed: ${r.status}`);
    const j = (await r.json()) as { segments: { start: number; end: number; text: string }[] };
    return j.segments.map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
  }
  const n = Math.max(1, Math.floor(dur / 4));
  return Array.from({ length: n }, (_, i) => ({
    start: i * 4, end: Math.min(dur, (i + 1) * 4), text: `Segment ${i + 1} (no transcription key configured)`,
  }));
}

/** Claude picks clips if ANTHROPIC_API_KEY is set; otherwise fixed windows. */
async function pickClips(segs: Seg[], dur: number): Promise<Pick[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && segs.length) {
    const client = new Anthropic({ apiKey: key });
    const transcript = segs.map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`).join("\n");
    const res = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `From this timestamped transcript pick up to 5 self-contained moments (15-60s each) most likely to perform as short-form video. Return ONLY a JSON array of {"title","reason","score"(0-100),"start","end"} in seconds.\n\n${transcript}`,
      }],
    });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const m = text.match(/\[[\s\S]*\]/);
    if (m) {
      const arr = JSON.parse(m[0]) as Pick[];
      return arr
        .filter((p) => p.end > p.start && p.start >= 0 && p.start < dur)
        .map((p) => ({ ...p, end: Math.min(p.end, dur) }));
    }
  }
  const len = Math.min(30, dur);
  const count = Math.max(1, Math.min(3, Math.floor(dur / len)));
  return Array.from({ length: count }, (_, i) => {
    const start = (i * dur) / count;
    return { title: `Clip ${i + 1}`, reason: "Fallback window (no LLM key configured)", score: 60 - i * 5, start, end: Math.min(dur, start + len) };
  });
}

function srtTime(t: number) {
  const ms = Math.round(t * 1000);
  const f = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${f(Math.floor(ms / 3600000))}:${f(Math.floor(ms / 60000) % 60)}:${f(Math.floor(ms / 1000) % 60)},${f(ms % 1000, 3)}`;
}

async function render(src: string, p: Pick, segs: Seg[], out: string, work: string) {
  const inside = segs.filter((s) => s.end > p.start && s.start < p.end);
  const srt = inside
    .map((s, i) => `${i + 1}\n${srtTime(Math.max(0, s.start - p.start))} --> ${srtTime(Math.min(p.end, s.end) - p.start)}\n${s.text}\n`)
    .join("\n");
  const srtPath = path.join(work, `${path.basename(out, ".mp4")}.srt`);
  await fs.writeFile(srtPath, srt);
  // Center-crop to 9:16, scale to 1080x1920, burn captions.
  const style = "Alignment=2,MarginV=180,FontSize=18,Bold=1,Outline=2,PrimaryColour=&H00FFFFFF&";
  const esc = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  const vf = `crop=ih*9/16:ih,scale=1080:1920,subtitles='${esc}':force_style='${style}'`;
  await run("ffmpeg", ["-y", "-ss", String(p.start), "-to", String(p.end), "-i", src, "-vf", vf,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", out]);
}

export async function processProject(id: string) {
  await ready();
  try {
    const { rows } = await pool.query("select * from projects where id=$1", [id]);
    const proj = rows[0];
    const work = path.join(DATA_DIR, id);
    await fs.mkdir(path.join(work, "clips"), { recursive: true });

    await setStage(id, "Analyzing video");
    const dur = await duration(proj.source_path);
    await pool.query("update projects set duration=$2 where id=$1", [id, dur]);

    await setStage(id, "Transcribing");
    const audio = path.join(work, "audio.mp3");
    await run("ffmpeg", ["-y", "-i", proj.source_path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audio]);
    const segs = await transcribe(audio, dur);

    await setStage(id, "Finding viral moments");
    const picks = await pickClips(segs, dur);

    for (let i = 0; i < picks.length; i++) {
      await setStage(id, `Rendering clip ${i + 1}/${picks.length}`);
      const rel = path.join(id, "clips", `clip${i + 1}.mp4`);
      await render(proj.source_path, picks[i], segs, path.join(DATA_DIR, rel), work);
      await pool.query(
        "insert into clips (project_id,title,reason,score,start_s,end_s,file_path) values ($1,$2,$3,$4,$5,$6,$7)",
        [id, picks[i].title, picks[i].reason, Math.round(picks[i].score), picks[i].start, picks[i].end, rel],
      );
    }
    await setStage(id, "Done", "done");
  } catch (e) {
    await pool.query("update projects set status='failed', error=$2 where id=$1", [id, String((e as Error).message)]);
  }
}

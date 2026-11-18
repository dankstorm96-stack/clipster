import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { pool, ready } from "./db";

export const DATA_DIR = path.join(process.cwd(), "data");

type Word = { start: number; end: number; word: string };
type Seg = { start: number; end: number; text: string; words: Word[] };
type Pick = { title: string; reason: string; score: number; start: number; end: number };

function run(cmd: string, args: string[], timeoutMs = 30 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { timeout: timeoutMs, killSignal: "SIGKILL" });
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

async function hasAudio(file: string): Promise<boolean> {
  const out = await run("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file]);
  return out.trim().length > 0;
}

async function duration(file: string): Promise<number> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(out) || 0;
}

/** Evenly time words across a span when no word-level timestamps exist. */
function spreadWords(text: string, start: number, end: number): Word[] {
  const parts = text.split(/\s+/).filter(Boolean);
  const step = (end - start) / Math.max(1, parts.length);
  return parts.map((w, i) => ({ word: w, start: start + i * step, end: start + (i + 1) * step }));
}

/** Download a public video with yt-dlp. Returns false and marks the project failed on error. */
export async function importFromUrl(id: string, url: string): Promise<boolean> {
  await ready();
  const dir = path.join(DATA_DIR, id);
  try {
    const out = await run("yt-dlp", [
      "--no-playlist", "--no-simulate", "--restrict-filenames",
      "--js-runtimes", `node:${process.execPath}`,
      "-f", "bv*[height<=1080]+ba/b[height<=1080]/b", "--merge-output-format", "mp4",
      "--max-filesize", "2G",
      "-o", path.join(dir, "source.%(ext)s"),
      "-O", "after_move:title", "-O", "after_move:filepath",
      "--", url,
    ], 15 * 60_000);
    const [title, file] = out.trim().split("\n").slice(-2);
    if (!file || !file.startsWith(dir)) throw new Error("Download produced no file");
    await pool.query("update projects set source_path=$2, title=$3 where id=$1", [id, file, title?.slice(0, 200) || url]);
    return true;
  } catch (e) {
    await pool.query("update projects set status='failed', error=$2 where id=$1", [id, "Download failed: " + String((e as Error).message).slice(0, 500)]);
    return false;
  }
}

/** Whisper if OPENAI_API_KEY is set; otherwise evenly spaced placeholder segments. */
async function transcribe(audio: string, dur: number): Promise<Seg[]> {
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    const form = new FormData();
    form.append("file", new Blob([await fs.readFile(audio)]), "audio.mp3");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!r.ok) throw new Error(`Transcription failed: ${r.status}`);
    const j = (await r.json()) as {
      segments: { start: number; end: number; text: string }[];
      words?: { start: number; end: number; word: string }[];
    };
    const words = j.words ?? [];
    return j.segments.map((s) => {
      const text = s.text.trim();
      const w = words.filter((x) => x.start >= s.start - 0.01 && x.start < s.end);
      return { start: s.start, end: s.end, text, words: w.length ? w : spreadWords(text, s.start, s.end) };
    });
  }
  const n = Math.max(1, Math.floor(dur / 4));
  return Array.from({ length: n }, (_, i) => {
    const start = i * 4, end = Math.min(dur, (i + 1) * 4);
    const text = `Segment ${i + 1} with no transcription key configured`;
    return { start, end, text, words: spreadWords(text, start, end) };
  });
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

function assTime(t: number) {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, sec = Math.floor(cs / 100) % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

const assEscape = (w: string) => w.replace(/[{}\\]/g, "").replace(/\n/g, " ");

/**
 * Word-by-word animated captions: words shown in groups of three, the word being
 * spoken pops (scale + yellow) while the rest of the group stays white.
 */
function buildAss(words: Word[], clipStart: number, clipEnd: number): string {
  const ws = words
    .filter((w) => w.end > clipStart && w.start < clipEnd)
    .map((w) => ({ word: assEscape(w.word.trim()).toUpperCase(), start: Math.max(0, w.start - clipStart), end: Math.min(clipEnd, w.end) - clipStart }))
    .filter((w) => w.word);
  const events: string[] = [];
  for (let g = 0; g < ws.length; g += 3) {
    const group = ws.slice(g, g + 3);
    group.forEach((cur, i) => {
      const next = group[i + 1]?.start ?? cur.end;
      const end = Math.max(next, cur.start + 0.05);
      const line = group
        .map((w, j) => (j === i
          ? `{\\c&H00E6FF&\\fscx85\\fscy85\\t(0,90,\\fscx115\\fscy115)\\t(90,160,\\fscx105\\fscy105)}${w.word}{\\r}`
          : w.word))
        .join(" ");
      events.push(`Dialogue: 0,${assTime(cur.start)},${assTime(end)},Pop,,0,0,0,,${line}`);
    });
  }
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Pop,DejaVu Sans,78,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,3,2,60,60,420,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
}

async function render(src: string, p: Pick, segs: Seg[], out: string, work: string) {
  const assPath = path.join(work, `${path.basename(out, ".mp4")}.ass`);
  await fs.writeFile(assPath, buildAss(segs.flatMap((s) => s.words), p.start, p.end));
  const esc = assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  // Center-crop to 9:16, scale to 1080x1920, burn animated captions.
  const vf = `crop=ih*9/16:ih,scale=1080:1920,ass='${esc}'`;
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
    let segs: Seg[] = [];
    if (await hasAudio(proj.source_path)) {
      const audio = path.join(work, "audio.mp3");
      await run("ffmpeg", ["-y", "-i", proj.source_path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audio]);
      segs = await transcribe(audio, dur);
    }

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

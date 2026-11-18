import Link from "next/link";

const features = [
  ["AI clip finder", "Transcribes your video and picks the moments most likely to hold attention."],
  ["Vertical reframe", "Auto-crops to 9:16 for Shorts, Reels and TikTok."],
  ["Burned-in captions", "Captions rendered onto every clip, ready to post."],
  ["One-click export", "Download finished MP4s straight from your dashboard."],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-24">
      <h1 className="text-5xl font-bold tracking-tight">Turn any long video into short clips.</h1>
      <p className="mt-4 max-w-2xl text-lg text-neutral-500">
        Upload a video. ClipForge finds the best moments, reframes them vertically, adds captions and hands you
        finished clips.
      </p>
      <Link href="/dashboard" className="mt-8 inline-block rounded-lg bg-black px-6 py-3 font-medium text-white dark:bg-white dark:text-black">
        Get started
      </Link>
      <div className="mt-20 grid gap-6 sm:grid-cols-2">
        {features.map(([t, d]) => (
          <div key={t} className="rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
            <h2 className="font-semibold">{t}</h2>
            <p className="mt-2 text-sm text-neutral-500">{d}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

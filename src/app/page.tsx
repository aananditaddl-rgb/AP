import Image from "next/image";
import { ButtonLink } from "@/components/ui";

const FEATURES = [
  { emoji: "👆", title: "Log in seconds", text: "One yes-or-no question a day. Say yes and add what you had — that's it." },
  { emoji: "🎯", title: "Goals that fit your life", text: "Weekly, monthly or custom allowances, with breaks for vacations and birthdays." },
  { emoji: "🤝", title: "Friends keep you going", text: "See how friends are doing and cheer them on. You choose what they can see." },
];

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-10">
      <div className="flex items-center gap-2 text-lg font-extrabold">
        <Image src="/icon.svg" alt="" width={32} height={32} className="rounded-lg" /> Treatly
      </div>

      <section className="mt-12">
        <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight">
          Know your treats.<br />
          <span className="text-brand">Keep your goals.</span>
        </h1>
        <p className="mt-4 text-lg text-ink-2">
          A friendly daily check-in for junk food and cheat meals — with goals you set and friends who keep you honest.
        </p>
      </section>

      <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <p className="text-center font-bold">Did you eat any junk food or have a cheat meal today?</p>
        <div className="mt-4 grid grid-cols-2 gap-3" aria-hidden>
          <span className="flex h-14 items-center justify-center rounded-2xl bg-brand-soft text-lg font-extrabold text-brand-strong">YES</span>
          <span className="flex h-14 items-center justify-center rounded-2xl bg-good-soft text-lg font-extrabold text-good">NO</span>
        </div>
      </div>

      <ul className="mt-8 space-y-4">
        {FEATURES.map((f) => (
          <li key={f.title} className="flex gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-xl" aria-hidden>{f.emoji}</span>
            <div>
              <p className="font-bold">{f.title}</p>
              <p className="text-sm text-ink-2">{f.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-3 pt-10">
        <ButtonLink href="/signup" className="w-full">Get started — it&apos;s free</ButtonLink>
        <ButtonLink href="/login" variant="secondary" className="w-full">I already have an account</ButtonLink>
      </div>
    </main>
  );
}

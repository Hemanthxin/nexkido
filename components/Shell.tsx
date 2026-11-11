"use client";
import dynamic from "next/dynamic";
import { Logo } from "./Logo";
import { go } from "@/lib/transition";

export const LiveMap = dynamic(() => import("./LiveMap"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-ink/5" /> });
export const Map = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="panel h-[320px] animate-pulse" /> });

export function Wordmark() {
  return (
    <a href="/" aria-label="NexKido home" className="inline-flex">
      <Logo animate />
    </a>
  );
}

/** Photo banner that opens each portal page: title and subtitle on the left, optional figures on the right. */
export function Banner({ img, pos = "50% 50%", title, sub, children }: { img: string; pos?: string; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-ink text-paper">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: pos }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(10,16,24,.9), rgba(10,16,24,.62) 55%, rgba(10,16,24,.35))" }} />
      <div className="relative flex flex-wrap items-end justify-between gap-6 p-6 md:p-9">
        <div className="max-w-xl">
          <h1 className="display text-4xl font-extrabold leading-[1.02] md:text-6xl">{title}</h1>
          {sub && <p className="mt-2 text-paper/80 md:text-lg">{sub}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function Shell({ title, name, children, bare = false }: { title: string; name: string; children: React.ReactNode; bare?: boolean }) {
  const out = async () => { await fetch("/api/auth/logout", { method: "POST" }); go("/login"); };
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink/10 bg-paper/90 px-4 py-3 backdrop-blur md:px-10">
        <Wordmark />
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden text-ink/60 sm:block">{title} · {name}</span>
          <button onClick={out} className="btn btn-line !px-4 !py-2">Log out</button>
        </div>
      </header>
      {bare ? <main>{children}</main> : <main className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8">{children}</main>}
    </div>
  );
}

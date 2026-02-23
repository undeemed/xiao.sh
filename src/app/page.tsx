import ProjectSearch from "@/components/project-search";
import SpotifyNowPlaying from "@/components/spotify-now-playing";
import { profile } from "@/lib/profile";
import { projects } from "@/lib/projects";
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-10 md:px-8 md:py-12">
      <header className="mb-6 border border-[var(--line)] bg-[var(--panel-2)] p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 leading-none">
            <p className="text-sm font-medium tracking-tight">xiao.sh</p>
            <span aria-hidden="true" className="h-3 w-px bg-[var(--line)]" />
            <p className="relative top-px text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Synced with GitHub
            </p>
          </div>
          <nav className="flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <a href="#search" className="border border-[var(--line)] px-2 py-1 hover:text-[var(--text)]">
              Search
            </a>
            <Link href="/about" className="border border-[var(--line)] px-2 py-1 hover:text-[var(--text)]">
              About
            </Link>
            <a
              href={profile.links.github}
              target="_blank"
              rel="noreferrer"
              className="border border-[var(--line)] px-2 py-1 hover:text-[var(--text)]"
            >
              GitHub ↗
            </a>
          </nav>
        </div>
      </header>

      <section id="about" className="border border-[var(--line)] bg-[var(--panel)] p-6 md:p-8">
        <div className="flex flex-col gap-5 md:grid md:grid-cols-[minmax(0,1fr)_18rem] md:items-start md:gap-6">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Hello I&apos;m</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{profile.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
              CS @ {profile.education} class of 2029. {profile.bio} This site keeps things minimal: quick context,
              searchable projects, and direct links. Take a look at the stuff I've worked on below :)
            </p>
            <ProjectSearch projects={projects} mode="search" className="mt-4 max-w-3xl" />
          </div>

          <SpotifyNowPlaying className="w-full max-w-[18rem] md:justify-self-end md:mt-2 md:w-[18rem] md:max-w-none" />
        </div>
      </section>

      <ProjectSearch projects={projects} mode="cards" className="mt-6" />
    </main>
  );
}

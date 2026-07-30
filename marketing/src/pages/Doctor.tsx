import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Pricing } from "@/components/Pricing";
import { TrustLegs } from "@/components/TrustLegs";
import { Cta } from "@/components/Cta";
import { VideoSlot } from "@/components/VideoSlot";
import { DemoSandbox } from "@/demo/DemoSandbox";
import { Fact, FieldLabel, Perforation, Section, cx } from "@/components/Primitives";
import { doctor, videos } from "@/content/site";

export function DoctorPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero
          eyebrow={doctor.eyebrow}
          h1={doctor.hero.h1}
          sub={doctor.hero.sub}
          kill={doctor.hero.kill}
          demoNote={doctor.hero.demoNote}
          crossLink={{ to: "/office-manager", label: doctor.omCrossLink }}
        />

        {/* Kill the wrong category before anything else is argued. */}
        <Section id="what" tone="carbon" label="What this is not">
          <FieldLabel>{doctor.notThis.label}</FieldLabel>
          <p className="mt-5 max-w-prose text-[1.15rem] leading-relaxed">{doctor.notThis.intro}</p>
          <dl className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {doctor.notThis.items.map((i) => (
              <Fact key={i.k} k={i.k} v={i.v} />
            ))}
          </dl>
        </Section>

        {/* The pains. The strongest trust material on the site. */}
        <Section tone="paper" label="The specific problems">
          <FieldLabel>{doctor.pains.label}</FieldLabel>
          <p className="mt-5 max-w-prose text-[1.15rem] leading-relaxed">{doctor.pains.intro}</p>

          <ol className="mt-12 grid gap-px bg-carbon lg:grid-cols-2">
            {doctor.pains.items.map((p, i) => {
              const slot = videos.slots.find((s) => s.id === p.id);
              return (
                <li key={p.id} className="bg-paper p-6 sm:p-7">
                  <div className="flex items-baseline gap-3">
                    <span className="pe-label tnum text-purple-600">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="font-display text-[1.35rem] leading-tight">{p.title}</h3>
                  </div>
                  <p className="mt-3 text-[1rem] leading-relaxed text-ink/75">{p.body}</p>
                  {slot && <VideoSlot className="mt-5" title={slot.title} length={slot.length} src={slot.src} />}
                </li>
              );
            })}
          </ol>
        </Section>

        {/* The mechanism, named. */}
        <Section tone="deep" label="How it works">
          <FieldLabel className="text-purple-200">{doctor.mechanism.label}</FieldLabel>
          <h2 className="mt-5 max-w-[24ch] text-[clamp(2rem,7vw,3.4rem)]">{doctor.mechanism.h2}</h2>
          <p className="mt-6 max-w-prose text-[1.1rem] leading-relaxed text-white/80">{doctor.mechanism.body}</p>

          <dl className="mt-12 grid gap-x-10 gap-y-6 sm:grid-cols-3">
            {doctor.mechanism.rules.map((r) => (
              <Fact key={r.k} k={r.k} v={r.v} tone="dark" />
            ))}
          </dl>

          {/* The credibility hinge: it points up too. */}
          <div className="mt-12 border border-purple-200/40">
            <div className="p-6 sm:p-8">
              <h3 className="font-display text-[clamp(1.4rem,4vw,2rem)] text-purple-200">
                {doctor.mechanism.upward.k}
              </h3>
              <p className="mt-4 max-w-prose text-[1.05rem] leading-relaxed text-white/85">
                {doctor.mechanism.upward.v}
              </p>
            </div>
            <Perforation />
            <p className="p-6 text-[1rem] leading-relaxed text-white/70 sm:p-8">
              {doctor.mechanism.upward.why}
            </p>
          </div>
        </Section>

        <DemoSandbox />

        {/* The office-trained AI. */}
        <Section tone="paper" label="The office-trained AI">
          <FieldLabel>{doctor.ai.label}</FieldLabel>
          <h2 className="mt-5 max-w-[28ch] text-[clamp(1.9rem,6vw,3rem)]">{doctor.ai.h2}</h2>
          <p className="mt-6 max-w-prose text-[1.1rem] leading-relaxed text-ink/80">{doctor.ai.body}</p>
          <dl className="mt-12 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {doctor.ai.items.map((i) => (
              <Fact key={i.k} k={i.k} v={i.v} />
            ))}
          </dl>
          <p className="mt-10 max-w-prose border-l-2 border-purple-600 pl-4 text-[1rem] leading-relaxed text-ink/75">
            {doctor.ai.boundary}
          </p>
        </Section>

        {/* Resource asymmetry. Flat facts; the reader supplies the indignation. */}
        <Section tone="purple" label="Resource asymmetry">
          <FieldLabel className="text-purple-200">{doctor.asymmetry.label}</FieldLabel>
          <h2 className="mt-5 max-w-[24ch] text-[clamp(2rem,7vw,3.4rem)]">{doctor.asymmetry.h2}</h2>
          <p className="mt-6 max-w-prose text-[1.1rem] leading-relaxed text-white/85">{doctor.asymmetry.intro}</p>

          <dl className="mt-12 grid gap-px bg-white/20 sm:grid-cols-3">
            {doctor.asymmetry.items.map((a) => (
              <div key={a.n} className="bg-purple-600 p-6 sm:p-7">
                <div className="pe-label tnum text-purple-200">{a.n}</div>
                <dt className="pe-h3 mt-4 text-[1.32rem]">{a.k}</dt>
                <dd className="mt-3 text-[0.98rem] leading-relaxed text-white/80">{a.v}</dd>
              </div>
            ))}
          </dl>

          {/* Never a shot at colleagues. The structure is the target. */}
          <div className="mt-12 max-w-prose border border-white/30 p-6 sm:p-8">
            <h3 className="font-display text-[1.3rem] leading-tight text-purple-200">
              {doctor.asymmetry.guard.k}
            </h3>
            <p className="mt-3 text-[1.05rem] leading-relaxed text-white/85">{doctor.asymmetry.guard.v}</p>
          </div>
        </Section>

        <Pricing />
        <TrustLegs tone="paper" />

        {/* Who built this. Demonstration over credential. */}
        <Section tone="carbon" label="Who built this">
          <FieldLabel>{doctor.founder.label}</FieldLabel>
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,300px)_1fr] lg:gap-14">
            {/* An empty frame, not a stock photo. */}
            <figure>
              <div
                className={cx(
                  "flex aspect-[4/5] flex-col items-center justify-center border border-dashed border-ink/30 bg-white p-6 text-center",
                )}
              >
                <p className="pe-label text-purple-600">{doctor.founder.portraitLabel}</p>
                <p className="mt-3 text-[0.85rem] leading-relaxed text-ink/50">
                  {doctor.founder.portraitTodo}
                </p>
              </div>
            </figure>

            <div>
              <h2 className="text-[clamp(2rem,7vw,3.2rem)]">{doctor.founder.h2}</h2>
              <div className="mt-6 max-w-prose space-y-5 text-[1.05rem] leading-relaxed text-ink/80">
                {doctor.founder.body.map((b) => (
                  <p key={b.slice(0, 24)}>{b}</p>
                ))}
              </div>

              <div className="mt-8 border-t border-carbon pt-6">
                <p className="max-w-prose text-[1.05rem] font-medium leading-relaxed">
                  {doctor.founder.solo}
                </p>
              </div>

              <div className="mt-8 border border-carbon bg-white p-5 sm:p-6">
                <h3 className="font-display text-[1.1rem]">{doctor.founder.name.k}</h3>
                <p className="mt-2 max-w-prose text-[1rem] leading-relaxed text-ink/75">
                  {doctor.founder.name.v}
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* The long walkthrough, low on the page, for people already convinced. */}
        <Section tone="paper" label="Walkthrough">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-14">
            <div>
              <FieldLabel>{videos.label}</FieldLabel>
              <h2 className="mt-5 text-[clamp(1.7rem,5vw,2.4rem)]">{videos.long.title}</h2>
              <p className="mt-4 max-w-prose text-[1rem] leading-relaxed text-ink/70">{videos.long.note}</p>
              <p className="mt-4 max-w-prose text-[1rem] leading-relaxed text-ink/70">{videos.intro}</p>
            </div>
            <VideoSlot title={videos.long.title} length={videos.long.length} src={videos.long.src} />
          </div>
        </Section>

        <Cta />
      </main>
      <Footer crossLink={{ to: "/office-manager", label: doctor.omCrossLink }} />
    </>
  );
}

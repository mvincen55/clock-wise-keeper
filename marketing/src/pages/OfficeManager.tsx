import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Pricing } from "@/components/Pricing";
import { TrustLegs } from "@/components/TrustLegs";
import { Cta } from "@/components/Cta";
import { SendToDoctor } from "@/components/SendToDoctor";
import { VideoSlot } from "@/components/VideoSlot";
import { DemoSandbox } from "@/demo/DemoSandbox";
import { Fact, FieldLabel, Perforation, Section } from "@/components/Primitives";
import { officeManager, doctor, videos } from "@/content/site";

export function OfficeManagerPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero
          eyebrow={officeManager.eyebrow}
          h1={officeManager.hero.h1}
          sub={officeManager.hero.sub}
          kill={officeManager.hero.kill}
          demoNote={officeManager.hero.demoNote}
          crossLink={{ to: "/", label: officeManager.doctorCrossLink }}
          extraAction={{ href: "#send", label: "Send this to your doctor" }}
        />

        {/* Her problems, not his. Carries #what so the nav anchor resolves here too. */}
        <Section id="what" tone="carbon" label="The problems">
          <FieldLabel>{officeManager.pains.label}</FieldLabel>
          <p className="mt-5 max-w-prose text-[1.15rem] leading-relaxed">{officeManager.pains.intro}</p>

          <ol className="mt-12 grid gap-px bg-carbon lg:grid-cols-2">
            {officeManager.pains.items.map((p, i) => (
              <li key={p.id} className="bg-purple-50 p-6 sm:p-7">
                <div className="flex items-baseline gap-3">
                  <span className="pe-label tnum text-purple-600">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-display text-[1.35rem] leading-tight">{p.title}</h3>
                </div>
                <p className="mt-3 text-[1rem] leading-relaxed text-ink/75">{p.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* The thing she'll actually care about. */}
        <Section tone="deep" label="Escalation upward">
          <FieldLabel className="text-purple-200">{officeManager.upward.label}</FieldLabel>
          <h2 className="mt-5 max-w-[20ch] text-[clamp(2.1rem,8vw,3.8rem)]">{officeManager.upward.h2}</h2>
          <p className="mt-7 max-w-prose text-[1.1rem] leading-relaxed text-white/85">
            {officeManager.upward.body}
          </p>
          <p className="mt-6 max-w-prose border-l-2 border-purple-200 pl-4 text-[1.15rem] font-medium leading-relaxed">
            {officeManager.upward.note}
          </p>

          {/* The guard. This must never read as "you're replaceable." */}
          <div className="mt-12 border border-purple-200/40">
            <div className="p-6 sm:p-8">
              <h3 className="font-display text-[clamp(1.4rem,4vw,1.9rem)] text-purple-200">
                {officeManager.notReplacing.k}
              </h3>
              <p className="mt-4 max-w-prose text-[1.05rem] leading-relaxed text-white/85">
                {officeManager.notReplacing.v}
              </p>
            </div>
            <Perforation />
            <p className="p-6 text-[1rem] leading-relaxed text-white/70 sm:p-8">
              Nothing in here reports on you to anyone. It reports on whether the office's own rules
              got followed — and you're the one who writes them.
            </p>
          </div>
        </Section>

        <SendToDoctor />

        <DemoSandbox />

        {/* Arming the champion. */}
        <Section tone="paper" label="Making the internal case">
          <FieldLabel>{officeManager.internalCase.label}</FieldLabel>
          <h2 className="mt-5 max-w-[26ch] text-[clamp(1.9rem,6vw,3rem)]">{officeManager.internalCase.h2}</h2>
          <dl className="mt-12 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {officeManager.internalCase.points.map((p) => (
              <Fact key={p.k} k={p.k} v={p.v} />
            ))}
          </dl>
        </Section>

        <Pricing />
        <TrustLegs />

        {/* Same founder facts, peer-to-peer framing. */}
        <Section tone="carbon" label="Who built this">
          <FieldLabel>{doctor.founder.label}</FieldLabel>
          <h2 className="mt-5 text-[clamp(2rem,7vw,3.2rem)]">{doctor.founder.h2}</h2>
          <p className="mt-6 max-w-prose text-[1.1rem] font-medium leading-relaxed">
            I have your job. I still have it — this is not something I left the front desk to go and
            build.
          </p>
          <div className="mt-6 max-w-prose space-y-5 text-[1.05rem] leading-relaxed text-ink/80">
            {doctor.founder.body.map((b) => (
              <p key={b.slice(0, 24)}>{b}</p>
            ))}
          </div>
          <div className="mt-8 max-w-prose border border-carbon bg-white p-5 sm:p-6">
            <h3 className="font-display text-[1.1rem]">{doctor.founder.name.k}</h3>
            <p className="mt-2 text-[1rem] leading-relaxed text-ink/75">{doctor.founder.name.v}</p>
          </div>
        </Section>

        <Section tone="paper" label="Walkthrough">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-14">
            <div>
              <FieldLabel>{videos.label}</FieldLabel>
              <h2 className="mt-5 text-[clamp(1.7rem,5vw,2.4rem)]">{videos.long.title}</h2>
              <p className="mt-4 max-w-prose text-[1rem] leading-relaxed text-ink/70">{videos.long.note}</p>
            </div>
            <VideoSlot title={videos.long.title} length={videos.long.length} src={videos.long.src} />
          </div>
        </Section>

        <Cta />
      </main>
      <Footer crossLink={{ to: "/", label: officeManager.doctorCrossLink }} />
    </>
  );
}

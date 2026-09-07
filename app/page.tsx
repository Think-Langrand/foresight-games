import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Langrand",
  description:
    "We help leaders see what's coming, design what's next and move their whole organization there — without breaking what works.",
};

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[100svh] max-w-[680px] flex-col justify-center px-6 py-16">
      {/* Wordmark doubles as the way back to the main site. */}
      <a
        href="https://thinklangrand.com"
        className="eyebrow ink self-start hover:opacity-70"
        style={{ fontSize: "13px", letterSpacing: "0.34em" }}
      >
        Langrand
      </a>

      <h1
        className="serif mt-10 text-ink"
        style={{ fontSize: "clamp(38px, 7vw, 66px)", lineHeight: 1.06, fontWeight: 500, letterSpacing: "-0.01em" }}
      >
        Most organizations chase change.
        <br />
        <span style={{ fontStyle: "italic" }}>The best ones see it coming.</span>
      </h1>

      <div className="mt-8 max-w-[560px] space-y-4 text-[15.5px] leading-[1.65] text-ink">
        <p>
          AI is changing how value is created, how work gets done and what customers and employees
          expect next. Most organizations cannot meet that future by automating the business they
          already have.
        </p>
        <p>
          We help leaders see what&rsquo;s coming, design what&rsquo;s next and move their whole
          organization there &mdash; without breaking what works.
        </p>
      </div>

      <nav className="mt-12 flex flex-col gap-6 border-t border-[var(--hairline)] pt-8">
        <a href="https://transformation.thinklangrand.com" className="group inline-flex flex-col gap-1 self-start">
          <span className="inline-flex items-center gap-2 text-[17px] font-semibold text-blue">
            <span className="underline-offset-4 group-hover:underline">
              Transformation, foresight &amp; innovation
            </span>
            <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
          </span>
          <span className="eyebrow">transformation.thinklangrand.com</span>
        </a>

        <a href="https://thinklangrand.com" className="group inline-flex flex-col gap-1 self-start">
          <span className="inline-flex items-center gap-2 text-[17px] font-semibold text-blue">
            <span className="underline-offset-4 group-hover:underline">The Langrand site</span>
            <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
          </span>
          <span className="eyebrow">thinklangrand.com</span>
        </a>
      </nav>
    </main>
  );
}

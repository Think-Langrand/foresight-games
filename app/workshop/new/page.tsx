import Link from "next/link";
import { getModel, findUncertainty } from "@/lib/model";
import { airtableConfigured } from "@/lib/airtable";
import { NewSessionForm } from "@/components/workshop/NewSessionForm";

export const dynamic = "force-dynamic";

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const { u } = await searchParams;
  const { model } = await getModel();
  const found = u ? findUncertainty(model, u) : null;

  if (!airtableConfigured()) {
    return (
      <Shell>
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">
          Airtable not connected
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-muted">
          Running a live workshop needs the server's Airtable Personal Access Token. Add
          <code className="mx-1 rounded bg-card px-1.5 py-0.5">AIRTABLE_API_KEY</code> and
          <code className="mx-1 rounded bg-card px-1.5 py-0.5">AIRTABLE_BASE_ID</code> to your
          environment, then reload.
        </p>
      </Shell>
    );
  }

  if (!found) {
    return (
      <Shell>
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">
          Pick an uncertainty
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-muted">
          Open{" "}
          <Link href="/explore" className="font-semibold text-blue underline">
            Explore
          </Link>{" "}
          and hit <span className="font-semibold">Run workshop →</span> on an uncertainty.
        </p>
      </Shell>
    );
  }

  const { driver, uncertainty } = found;
  return (
    <Shell>
      <Link href="/explore" className="eyebrow blue">
        ← Back to Explore
      </Link>
      <span className="eyebrow mt-4 block">{driver.name}</span>
      <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
        {uncertainty.label}
      </h1>
      <p className="serif mt-3 text-[19px] italic leading-[1.35] text-muted">
        {uncertainty.question}
      </p>
      <NewSessionForm
        uncertaintyId={uncertainty.id}
        defaultPrompt={uncertainty.question}
        poleA={uncertainty.poleA}
        poleB={uncertainty.poleB}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-[720px] px-6 py-12 md:py-16">{children}</main>;
}

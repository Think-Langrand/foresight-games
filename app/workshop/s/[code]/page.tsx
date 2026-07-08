import { ParticipantView } from "@/components/workshop/ParticipantView";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <ParticipantView code={code.toUpperCase()} />;
}

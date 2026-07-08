import { PresentView } from "@/components/workshop/PresentView";

export const dynamic = "force-dynamic";

export default async function PresentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PresentView code={code.toUpperCase()} />;
}

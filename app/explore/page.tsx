import { getModel } from "@/lib/model";
import { ExploreClient } from "@/components/explore/ExploreClient";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const { model } = await getModel();
  return <ExploreClient model={model} />;
}

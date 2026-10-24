import { fetchApplications, fetchPlacements } from "@/lib/data-source";
import { ReviewScreen } from "@/features/ad-review/review-screen";

export default async function Page() {
  const [applications, placements] = await Promise.all([
    fetchApplications(),
    fetchPlacements(),
  ]);

  return <ReviewScreen applications={applications} placements={placements} />;
}

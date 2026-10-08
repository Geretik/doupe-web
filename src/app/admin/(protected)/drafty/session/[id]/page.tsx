import { notFound, permanentRedirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { draftIdOfSession } from "@/modules/botc/lib/draft/queries";
import { parseId } from "@/lib/validation";

/** Address of a draft's run from before October 2026 (it is in e-mails already sent): now the draft's page. */
export default async function OldDraftSessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = parseId((await params).id);
  const draftId = id ? await draftIdOfSession(id) : null;
  if (!draftId) notFound();
  permanentRedirect(`/admin/drafty/${draftId}`);
}

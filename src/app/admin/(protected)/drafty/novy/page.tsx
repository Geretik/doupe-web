import Link from "next/link";
import { createDraftAction } from "@/app/actions/draft";
import { DraftForm } from "@/components/draft/draft-form";
import { draftFormInitial, draftFormProps } from "@/components/draft/view";
import { Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin-auth";

export default async function NewDraftPage() {
  await requireAdmin();
  const { locale, t } = await getDict();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/drafty" className="text-sm text-muted hover:underline">{t.draft.back}</Link>
      <h1 className="text-2xl font-bold">{t.draft.newDraft.replace(/^\+\s*/, "")}</h1>
      <p className="text-sm text-muted">{t.draft.intro}</p>
      <Card>
        <DraftForm action={createDraftAction} initial={draftFormInitial()} {...draftFormProps(t, locale, t.draft.form.create)} />
      </Card>
    </div>
  );
}

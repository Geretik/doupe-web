import Link from "next/link";
import { loginWithLinkAction } from "@/app/actions/admin";
import { Alert, Button, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { getOpenLoginLink } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

/**
 * Behind an e-mailed login link: one button logs this device in. Opening the page alone does nothing,
 * so a mail scanner that opens every link cannot use it up.
 */
export default async function LoginLinkUsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [{ t }, open] = await Promise.all([getDict(), getOpenLoginLink(token)]);
  const l = t.admin.loginLink;
  if (!open) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 text-2xl font-bold">{l.invalidTitle}</h1>
        <Alert kind="error">{l.invalidBody}</Alert>
        <p className="mt-3 text-sm">
          <Link href="/admin/odkaz" className="underline hover:text-accent">{l.requestNew}</Link>
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">{l.confirmTitle}</h1>
      <Card>
        <form action={loginWithLinkAction.bind(null, token)} className="flex flex-col gap-4">
          <p className="text-sm">
            {l.confirmIntro}{" "}
            <strong>{open.user.nickname}</strong> <span className="text-muted">({open.user.email})</span>
          </p>
          <Button type="submit">{l.confirm}</Button>
        </form>
      </Card>
    </div>
  );
}

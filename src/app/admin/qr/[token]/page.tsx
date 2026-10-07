import Link from "next/link";
import { QrApprove } from "@/components/admin/qr-login";
import { Alert, Card } from "@/components/ui";
import { getDict } from "@/i18n/server";
import { getAdmin } from "@/lib/admin-auth";
import { openQrLogin } from "@/lib/qr-login";

export const dynamic = "force-dynamic";

/**
 * What another device's login QR code opens on the organiser's phone: approve, and that device is logged in as them.
 * Outside the admin's layout, so a phone that is not logged in is told why instead of only landing on the login.
 */
export default async function QrApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [{ t }, me] = await Promise.all([getDict(), getAdmin()]);
  const q = t.admin.qrApprove;
  const login = me && token.length <= 100 ? await openQrLogin(token) : null;
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">{q.title}</h1>
      {!me ? (
        <>
          <Alert kind="error">{q.notLoggedIn}</Alert>
          <p className="mt-3 text-sm">
            <Link href="/admin/login" className="underline hover:text-accent">{q.login}</Link>
          </p>
        </>
      ) : !login ? (
        <>
          <Alert kind="error">{q.invalid}</Alert>
          <p className="mt-3 text-sm">
            <Link href="/admin/profil" className="underline hover:text-accent">{q.back}</Link>
          </p>
        </>
      ) : (
        <Card className="flex flex-col gap-4">
          <p className="text-sm">{q.intro}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{q.device}</dt>
            <dd className="font-medium" data-testid="qr-device">{login.device}</dd>
            <dt className="text-muted">{q.account}</dt>
            <dd className="font-medium">
              {me.nickname} <span className="font-normal text-muted">({me.email})</span>
            </dd>
          </dl>
          <p className="text-sm text-muted">{q.warning}</p>
          <QrApprove token={token} t={q} />
        </Card>
      )}
    </div>
  );
}

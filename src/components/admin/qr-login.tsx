"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { approveQrLoginAction, pollQrLoginAction, startQrLoginAction, type QrLoginCode } from "@/app/actions/qr-login";
import type { Dict } from "@/i18n/dictionaries";
import { Alert, Button } from "../ui";

const POLL_MS = 2000;

type Shown = Exclude<QrLoginCode, { error: string }>;
type Status = "idle" | "loading" | "shown" | "expired" | "tooMany" | "done";

/**
 * On the login page: a QR code that a phone where the organiser is logged in scans and approves. The page asks
 * every few seconds whether that happened (not while it is in the background) and then opens the admin.
 */
export function QrLoginPanel({ t }: { t: Dict["admin"]["login"] }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState<Shown | null>(null);

  const start = async () => {
    setStatus("loading");
    const next = await startQrLoginAction();
    if ("error" in next) {
      setStatus("tooMany");
      return;
    }
    setCode(next);
    setStatus("shown");
  };

  useEffect(() => {
    if (status !== "shown") return;
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      if (stopped) return;
      if (!document.hidden) {
        const result = await pollQrLoginAction();
        if (stopped) return;
        if (result === "done") {
          setStatus("done");
          router.replace("/admin");
          return;
        }
        if (result === "expired") {
          setStatus("expired");
          return;
        }
      }
      timer = window.setTimeout(poll, POLL_MS);
    };
    timer = window.setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [status, router]);

  if (status === "idle" || status === "loading") {
    return (
      <Button type="button" variant="secondary" onClick={start} disabled={status === "loading"}>
        {t.qrOpen}
      </Button>
    );
  }
  if (status === "tooMany") return <Alert kind="error">{t.qrTooMany}</Alert>;
  if (status === "done") return <Alert kind="success">{t.qrDone}</Alert>;
  return (
    <div className="flex flex-col items-center gap-3 text-center" data-testid="qr-login" data-url={code?.url}>
      {status === "shown" && code ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URL, nothing to optimise */}
          <img src={code.image} alt={t.qrAlt} width={224} height={224} className="size-56 rounded-lg bg-white p-1" />
          <p className="text-sm text-muted">{t.qrHint}</p>
        </>
      ) : (
        <>
          <p className="text-sm">{t.qrExpired}</p>
          <Button type="button" variant="secondary" onClick={start}>
            {t.qrNew}
          </Button>
        </>
      )}
    </div>
  );
}

/** On the phone: approves the device that shows the QR code. */
export function QrApprove({ token, t }: { token: string; t: Dict["admin"]["qrApprove"] }) {
  const [result, setResult] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  if (result !== null) {
    return (
      <div className="flex flex-col gap-3">
        <Alert kind={result ? "success" : "error"}>{result ? t.done : t.invalid}</Alert>
        <Link href="/admin/profil" className="text-sm underline hover:text-accent">{t.back}</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={pending} onClick={() => startTransition(async () => setResult((await approveQrLoginAction(token)).ok))}>
        {pending ? t.approving : t.approve}
      </Button>
      <Link href="/admin/profil" className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-border/40">
        {t.cancel}
      </Link>
    </div>
  );
}

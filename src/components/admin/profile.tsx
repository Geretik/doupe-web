"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { logoutOtherDevicesAction } from "@/app/actions/qr-login";
import type { Dict } from "@/i18n/dictionaries";
import { Alert, Button } from "../ui";

// window.BarcodeDetector (declared in ./barcode-scanner): the browser's own QR reader where there is one (Chrome on Android); jsQR elsewhere (Safari)

/** Frames are read at most this wide: enough for a code on a screen, light on a phone. */
const MAX_WIDTH = 640;
const SCAN_MS = 250;

/** The approval page a scanned text leads to, on this site whatever host the code was made on; null for anything else. */
function approvalPath(text: string) {
  try {
    const { pathname } = new URL(text, window.location.origin);
    return /^\/admin\/qr\/[\w-]{10,100}$/.test(pathname) ? pathname : null;
  } catch {
    return null;
  }
}

/** Scans another device's login QR code with this phone's camera and opens its approval page. */
export function QrScanner({ t }: { t: Dict["admin"]["profile"] }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let timer = 0;
    let stream: MediaStream | null = null;
    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        if (!stopped) {
          setError(t.scanNoCamera);
          setOpen(false);
        }
        return;
      }
      const el = video.current;
      if (stopped || !el) return stop();
      el.srcObject = stream;
      await el.play().catch(() => {});
      const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const scan = async () => {
        if (stopped) return;
        let text: string | null = null;
        if (el.readyState >= 2 && el.videoWidth) {
          if (detector) {
            text = (await detector.detect(el).catch(() => []))[0]?.rawValue ?? null;
          } else if (jsQR && ctx) {
            const scale = Math.min(1, MAX_WIDTH / el.videoWidth);
            canvas.width = Math.round(el.videoWidth * scale);
            canvas.height = Math.round(el.videoHeight * scale);
            ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            text = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" })?.data ?? null;
          }
        }
        if (stopped) return;
        if (text) {
          const path = approvalPath(text);
          if (path) {
            stop();
            router.push(path);
            return;
          }
          setError(t.scanWrong);
        }
        timer = window.setTimeout(scan, SCAN_MS);
      };
      scan();
    })();
    return stop;
  }, [open, router, t]);

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert kind="error">{error}</Alert>}
      {open ? (
        <>
          <p className="text-sm text-muted">{t.scanHint}</p>
          <video ref={video} muted playsInline className="aspect-square w-full max-w-sm rounded-xl bg-black object-cover" data-testid="qr-video" />
          <div>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t.scanClose}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button
            type="button"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            📷 {t.scan}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Logs the account out on every other device; this one stays logged in. */
export function LogoutOthersButton({ t }: { t: Dict["admin"]["profile"] }) {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  if (done) return <Alert kind="success">{t.logoutOthersDone}</Alert>;
  return (
    <Button
      type="button"
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (confirm(t.logoutOthersConfirm)) startTransition(async () => setDone((await logoutOtherDevicesAction()).ok));
      }}
    >
      {pending ? t.working : t.logoutOthers}
    </Button>
  );
}

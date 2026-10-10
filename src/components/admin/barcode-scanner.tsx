"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Alert, Button } from "../ui";

/** The browser's own reader of bar and QR codes, where there is one (Chrome on Android, Safari on a Mac). */
export type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: { new (options: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
  }
}

/** What game boxes carry: EAN-13, EAN-8 on small boxes, UPC-A on American games. */
const FORMATS = ["ean_13", "ean_8", "upc_a"] as const;
const SCAN_MS = 200;
/** Reading several boxes: the same code counts again only after it was out of sight this long. */
const REPEAT_MS = 2500;
/** ZXing built for WebAssembly, served from this site by its route next to the lending page. */
const WASM_PATH = "/admin/pujcovna/zxing_reader.wasm";

let detector: Promise<Detector> | null = null;

/**
 * A reader of the codes on game boxes: the browser's own when it reads them all, ZXing elsewhere (Safari on an
 * iPhone, Firefox, Chrome on a computer), loaded only then. Made once per page; a failed load is tried again next time.
 */
function eanDetector() {
  if (detector) return detector;
  detector = (async (): Promise<Detector> => {
    const Native = window.BarcodeDetector;
    const supported = (await Native?.getSupportedFormats?.().catch(() => [])) ?? [];
    if (Native && FORMATS.every((f) => supported.includes(f))) return new Native({ formats: [...FORMATS] });
    const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");
    // the version in the address: a new one is never taken from the cache of the old
    const wasm = `${WASM_PATH}?v=${ZXING_WASM_VERSION}`;
    await prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasm : prefix + path) }, fireImmediately: true });
    return new BarcodeDetector({ formats: [...FORMATS] });
  })();
  detector.catch(() => {
    detector = null;
  });
  return detector;
}

/**
 * The phone's camera reading the bar code on a game box; `onCode` gets the digits read, after which the camera stops
 * (the parent closes the reader), or with `continuous` reads the next box. Shown = on.
 */
export function BarcodeScanner({
  onCode,
  onClose,
  continuous = false,
  t,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
  continuous?: boolean;
  t: { scanHint: string; scanClose: string; scanNoCamera: string; scanFailed: string };
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const found = useEffectEvent((code: string) => onCode(code));

  useEffect(() => {
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
        // a wider frame than for a QR code: a bar code is read along its length
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        if (!stopped) setError(t.scanNoCamera);
        return;
      }
      const el = video.current;
      if (stopped || !el) return stop();
      el.srcObject = stream;
      await el.play().catch(() => {});
      let reader: Detector;
      try {
        reader = await eanDetector();
      } catch {
        if (!stopped) setError(t.scanFailed);
        return stop();
      }
      let failures = 0;
      // the code last seen and when: a box held in front of the camera counts once
      let last = { code: "", at: 0 };
      const scan = async () => {
        if (stopped) return;
        if (el.readyState >= 2 && el.videoWidth) {
          try {
            const code = (await reader.detect(el))[0]?.rawValue;
            failures = 0;
            if (code && !stopped && !continuous) {
              stop();
              navigator.vibrate?.(60);
              found(code);
              return;
            }
            if (code && !stopped) {
              const now = Date.now();
              if (code !== last.code || now - last.at > REPEAT_MS) {
                navigator.vibrate?.(60);
                found(code);
              }
              last = { code, at: now };
            }
          } catch {
            if (++failures >= 5) {
              if (!stopped) setError(t.scanFailed);
              return stop();
            }
          }
        }
        timer = window.setTimeout(scan, SCAN_MS);
      };
      scan();
    })();
    return stop;
  }, [t, continuous]);

  return (
    <div className="flex flex-col gap-3" data-testid="barcode-scanner">
      {error ? <Alert kind="error">{error}</Alert> : <p className="text-sm text-muted">{t.scanHint}</p>}
      {!error && (
        <div className="relative w-full max-w-md overflow-hidden rounded-xl bg-black">
          <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" />
          {/* where to hold the code */}
          <div className="pointer-events-none absolute inset-x-[10%] top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
        </div>
      )}
      <div>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t.scanClose}
        </Button>
      </div>
    </div>
  );
}

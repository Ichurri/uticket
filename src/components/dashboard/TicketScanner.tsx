"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { FlashlightIcon } from "@/components/ui/icons";
import { ScannerVerdict } from "@/components/dashboard/ScannerVerdict";
import { cn } from "@/lib/utils";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCAN_INTERVAL_MS = 300;
/** Ignore re-reads of the same QR for this long so a ticket held in front of
 * the camera doesn't flip from "válida" to "ya utilizado" instantly. */
const SAME_CODE_COOLDOWN_MS = 5000;

/* Non-standard MediaTrack torch extension — not in lib.dom.d.ts. */
interface TorchCapabilities {
  torch?: boolean;
}
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };

interface TicketSummary {
  code: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  label: string;
  buyerName: string;
}

interface VerifyOutcome {
  result:
    | "ACCEPTED"
    | "ALREADY_USED"
    | "CANCELLED"
    | "NOT_FOUND"
    | "FORBIDDEN"
    | "INVALID_CODE"
    | "ERROR";
  error?: string;
  usedAt?: string | null;
  ticket?: TicketSummary;
}

const usedAtFormatter = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/La_Paz",
});

const REJECTION_REASONS: Record<
  Exclude<VerifyOutcome["result"], "ACCEPTED" | "ALREADY_USED">,
  string
> = {
  CANCELLED: "Boleto cancelado",
  NOT_FOUND: "Boleto inexistente",
  FORBIDDEN: "Boleto de otro evento",
  INVALID_CODE: "Código inválido",
  ERROR: "Error de verificación",
};

function reasonFor(outcome: VerifyOutcome) {
  if (outcome.result === "ACCEPTED") {
    return outcome.ticket?.label ?? "Entrada válida";
  }
  if (outcome.result === "ALREADY_USED") {
    const usedAt = outcome.usedAt
      ? ` · ${usedAtFormatter.format(new Date(outcome.usedAt))}`
      : "";
    return `Ya utilizado${usedAt}`;
  }
  return outcome.error ?? REJECTION_REASONS[outcome.result];
}

interface DoorCounts {
  inside: number;
  upcoming: number;
}

export function TicketScanner({
  scanCode,
  initialCounts,
}: {
  scanCode?: string;
  /** Only meaningful when the scanner is scoped to one event (the public
   * /scan/[code] door station) — omitted on the multi-event dashboard
   * scanner, where there's no single event to count against. */
  initialCounts?: DoorCounts;
} = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyingRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const outcomeRef = useRef<VerifyOutcome | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [detectFlash, setDetectFlash] = useState(false);
  const [counts, setCounts] = useState(initialCounts);

  const dismissOutcome = useCallback(() => {
    outcomeRef.current = null;
    setOutcome(null);
  }, []);

  function playTone(ok: boolean) {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = ok ? 880 : 220;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.24);
  }

  function vibrate(ok: boolean) {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(ok ? 70 : [90, 70, 90]);
    }
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      // Not fatal — the scanner still works, the screen may just dim.
    }
  }

  const verify = useCallback(async (code: string) => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    lastScanRef.current = { code, at: Date.now() };
    setVerifying(true);

    try {
      const response = await fetch("/api/tickets/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanCode ? { code, scanCode } : { code }),
      });
      const data = await response.json().catch(() => null);
      const result: VerifyOutcome = data?.result
        ? (data as VerifyOutcome)
        : { result: "ERROR", error: "No se pudo verificar el boleto" };
      const ok = result.result === "ACCEPTED";
      vibrate(ok);
      playTone(ok);
      if (ok) {
        setCounts((c) =>
          c ? { inside: c.inside + 1, upcoming: Math.max(0, c.upcoming - 1) } : c,
        );
      }
      outcomeRef.current = result;
      setOutcome(result);
    } catch {
      const result: VerifyOutcome = {
        result: "ERROR",
        error: "Sin conexión con el servidor",
      };
      vibrate(false);
      playTone(false);
      outcomeRef.current = result;
      setOutcome(result);
    } finally {
      setVerifying(false);
      verifyingRef.current = false;
      setManualCode("");
    }
  }, [scanCode]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackRef.current = null;
    setTorchSupported(false);
    setTorchOn(false);
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    audioCtxRef.current ??= new AudioContext();
    audioCtxRef.current.resume().catch(() => {});
    await requestWakeLock();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const capabilities = track?.getCapabilities?.() as
        | (MediaTrackCapabilities & TorchCapabilities)
        | undefined;
      setTorchSupported(Boolean(capabilities?.torch));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      intervalRef.current = setInterval(() => {
        const video = videoRef.current;
        if (
          !video ||
          verifyingRef.current ||
          outcomeRef.current ||
          video.readyState < 2
        )
          return;

        canvasRef.current ??= document.createElement("canvas");
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context || canvas.width === 0) return;

        context.drawImage(video, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(imageData.data, imageData.width, imageData.height);

        if (qr && UUID_PATTERN.test(qr.data.trim())) {
          const code = qr.data.trim();
          const last = lastScanRef.current;
          if (
            last &&
            last.code === code &&
            Date.now() - last.at < SAME_CODE_COOLDOWN_MS
          ) {
            return;
          }
          setDetectFlash(true);
          setTimeout(() => setDetectFlash(false), 120);
          verify(code);
        }
      }, SCAN_INTERVAL_MS);
    } catch {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      setCameraError(
        "No se pudo acceder a la cámara. Dale permiso en el navegador o usá el código manual.",
      );
    }
  }, [verify]);

  function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    const constraint: TorchConstraintSet = { torch: next };
    track
      .applyConstraints({ advanced: [constraint] })
      .then(() => setTorchOn(next))
      .catch(() => {});
  }

  useEffect(() => stopCamera, [stopCamera]);

  // The Screen Wake Lock auto-releases when the tab loses visibility and
  // doesn't reacquire itself — reclaim it so the screen stays on for as
  // long as the camera is actually running.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible" && cameraActive) {
        requestWakeLock();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [cameraActive]);

  return (
    <div
      className="dark relative flex flex-col gap-6 rounded-2xl p-4 text-foreground sm:p-6"
      style={{ backgroundImage: "var(--ticket-surface)" }}
    >
      {counts && (
        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-center">
            <span className="font-mono text-2xl font-extrabold tabular-nums text-white">
              {counts.inside}
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
              Adentro
            </span>
          </div>
          <div className="h-8 w-px bg-white/15" />
          <div className="flex flex-col items-center">
            <span className="font-mono text-2xl font-extrabold tabular-nums text-white">
              {counts.upcoming}
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
              Por llegar
            </span>
          </div>
        </div>
      )}

      <Card className="border-white/10 bg-transparent shadow-none">
        <CardContent className="flex flex-col gap-4 p-0">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn(
                "aspect-video w-full object-cover",
                !cameraActive && "hidden",
              )}
            />
            {!cameraActive && (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 text-center">
                <p className="px-6 text-sm text-white/70">
                  Activá la cámara y apuntá al QR del boleto
                </p>
                <Button type="button" onClick={startCamera}>
                  Iniciar cámara
                </Button>
              </div>
            )}
            {cameraActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={cn(
                    "relative h-48 w-48 overflow-hidden rounded-xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-colors duration-100",
                    detectFlash ? "border-primary" : "border-white/70",
                  )}
                >
                  <div className="animate-scan-line absolute inset-x-0 h-0.5 bg-primary/80 shadow-[0_0_8px_2px_rgba(109,43,255,0.6)]" />
                </div>
              </div>
            )}
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label={torchOn ? "Apagar linterna" : "Encender linterna"}
                title={torchOn ? "Apagar linterna" : "Encender linterna"}
                className={cn(
                  "absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-colors",
                  torchOn
                    ? "bg-gold text-[#171128]"
                    : "bg-white/15 text-white hover:bg-white/25",
                )}
              >
                <FlashlightIcon className="h-5 w-5" />
              </button>
            )}
          </div>

          {cameraError && <p className="text-sm text-danger">{cameraError}</p>}

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {cameraActive
                ? verifying
                  ? "Verificando..."
                  : "Buscando QR..."
                : "Cámara apagada"}
            </p>
            {cameraActive && (
              <Button type="button" variant="ghost" size="sm" onClick={stopCamera}>
                Apagar cámara
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-white/10 pt-4">
            <Label htmlFor="manual-code">O ingresá el código manualmente</Label>
            <div className="flex gap-2">
              <Input
                id="manual-code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                disabled={verifying || !UUID_PATTERN.test(manualCode.trim())}
                onClick={() => {
                  audioCtxRef.current ??= new AudioContext();
                  audioCtxRef.current.resume().catch(() => {});
                  verify(manualCode.trim());
                }}
              >
                Verificar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {outcome && (
        <ScannerVerdict
          accepted={outcome.result === "ACCEPTED"}
          reason={reasonFor(outcome)}
          onDismiss={dismissOutcome}
        />
      )}
    </div>
  );
}

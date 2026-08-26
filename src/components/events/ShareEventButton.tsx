"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckIcon, ShareIcon, WhatsAppIcon } from "@/components/ui/icons";

/**
 * How an event actually travels here: someone drops the link in a WhatsApp
 * group. Native share sheet where the browser offers one (every phone),
 * WhatsApp + copy-link side by side where it doesn't (desktop).
 */
export function ShareEventButton({
  title,
  summary,
}: {
  title: string;
  summary: string;
}) {
  const [copied, setCopied] = useState(false);
  // The URL is only known in the browser, and reading it during render would
  // desync hydration — so every handler reads it at click time instead.
  const shareText = `${title}\n${summary}`;

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: shareText, url });
        return;
      } catch {
        // Share sheet dismissed — fall through to copying.
      }
    }
    await copyLink();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context): leave the UI untouched rather
      // than claiming a copy that didn't happen.
    }
  }

  function shareOnWhatsApp() {
    const message = encodeURIComponent(`${shareText}\n${window.location.href}`);
    window.open(`https://wa.me/?text=${message}`, "_blank", "noopener");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={share}>
        {copied ? (
          <>
            <CheckIcon className="h-4 w-4" />
            ¡Link copiado!
          </>
        ) : (
          <>
            <ShareIcon className="h-4 w-4" />
            Compartir
          </>
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={shareOnWhatsApp}
        aria-label="Compartir por WhatsApp"
        title="Compartir por WhatsApp"
      >
        <WhatsAppIcon className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only">WhatsApp</span>
      </Button>
    </div>
  );
}

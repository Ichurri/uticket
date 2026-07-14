const RESEND_API_URL = "https://api.resend.com/emails";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/** Splits EMAIL_FROM ("Name <a@b.c>" or plain address) into name + email. */
export function parseSender(raw: string) {
  const match = raw.match(/^(.*?)\s*<(.+)>$/);
  return match
    ? { name: match[1] || "Üticket", email: match[2] }
    : { name: "Üticket", email: raw };
}

/**
 * Sends a transactional email. Provider selection by env:
 * - BREVO_API_KEY set → Brevo (no own domain needed; EMAIL_FROM must be the
 *   sender verified in Brevo). Takes priority while we have no domain.
 * - else RESEND_API_KEY set → Resend (needs a verified domain to reach
 *   recipients other than the account owner).
 * - else (local dev) → logged to the console.
 * Never throws: notification failures must not break the API response.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput) {
  const brevoKey = process.env.BREVO_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Üticket <onboarding@resend.dev>";

  try {
    if (brevoKey) {
      if (!process.env.EMAIL_FROM) {
        console.error(
          "[email] BREVO_API_KEY is set but EMAIL_FROM is missing — set it to the sender verified in Brevo",
        );
        return { ok: false as const };
      }
      const sender = parseSender(from);
      const response = await fetch(BREVO_API_URL, {
        method: "POST",
        headers: {
          "api-key": brevoKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender,
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[email] Brevo ${response.status} for "${subject}": ${body}`);
        return { ok: false as const };
      }
      return { ok: true as const };
    }

    if (resendKey) {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[email] Resend ${response.status} for "${subject}": ${body}`);
        return { ok: false as const };
      }
      return { ok: true as const };
    }

    console.info(
      `[email:dev] to=${to} subject="${subject}"\n${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`,
    );
    return { ok: true as const, dev: true as const };
  } catch (error) {
    console.error(`[email] failed to send "${subject}"`, error);
    return { ok: false as const };
  }
}

const BRAND_PURPLE = "#6d2bff";

/** User-provided values (names, event titles, reasons) go inside HTML. */
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(title: string, body: string) {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f5f5f7;font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;color:#2b2b2b;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
      <p style="margin:0 0 24px;font-size:22px;font-weight:800;letter-spacing:-0.02em;">
        <span style="color:${BRAND_PURPLE};">Ü</span>ticket
      </p>
      <h1 style="margin:0 0 16px;font-size:20px;letter-spacing:-0.02em;">${title}</h1>
      ${body}
      <p style="margin:32px 0 0;font-size:12px;color:#6b6580;">
        Üticket — Tu entrada en un clic.
      </p>
    </div>
  </body>
</html>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;margin:8px 0 16px;padding:12px 24px;background:${BRAND_PURPLE};color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;">${label}</a>`;
}

export function verificationEmail(rawName: string | null, verifyUrl: string) {
  const name = rawName ? escapeHtml(rawName) : null;
  return {
    subject: "Verificá tu correo en Üticket",
    html: layout(
      `¡Hola${name ? ` ${name}` : ""}! Verificá tu correo`,
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        Para poder comprar boletos necesitamos confirmar que este correo es tuyo.
        El enlace vence en 24 horas.
      </p>
      ${button(verifyUrl, "Verificar mi correo")}
      <p style="margin:0;font-size:12px;color:#6b6580;">
        Si el botón no funciona, copiá este enlace en tu navegador:<br/>
        <a href="${verifyUrl}" style="color:${BRAND_PURPLE};word-break:break-all;">${verifyUrl}</a>
      </p>`,
    ),
  };
}

export function passwordResetEmail(rawName: string | null, resetUrl: string) {
  const name = rawName ? escapeHtml(rawName) : null;
  return {
    subject: "Restablecé tu contraseña de Üticket",
    html: layout(
      `Hola${name ? ` ${name}` : ""}, restablecé tu contraseña`,
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        Recibimos un pedido para restablecer la contraseña de tu cuenta.
        El enlace vence en 1 hora. Si no fuiste vos, ignorá este correo —
        tu contraseña actual sigue siendo válida.
      </p>
      ${button(resetUrl, "Crear nueva contraseña")}
      <p style="margin:0;font-size:12px;color:#6b6580;">
        Si el botón no funciona, copiá este enlace en tu navegador:<br/>
        <a href="${resetUrl}" style="color:${BRAND_PURPLE};word-break:break-all;">${resetUrl}</a>
      </p>`,
    ),
  };
}

export function orderConfirmedEmail(
  rawName: string | null,
  rawEventTitle: string,
  ticketCount: number,
  orderUrl: string,
) {
  const name = rawName ? escapeHtml(rawName) : null;
  const eventTitle = escapeHtml(rawEventTitle);
  return {
    subject: `Tu pedido para ${eventTitle} está confirmado 🎉`,
    html: layout(
      `¡Listo${name ? `, ${name}` : ""}! Tu pago fue verificado`,
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        El organizador verificó tu comprobante y tus
        ${ticketCount === 1 ? "boleto ya está listo" : `${ticketCount} boletos ya están listos`}
        para <strong>${eventTitle}</strong>. Mostrá el QR en la entrada del evento.
      </p>
      ${button(orderUrl, "Ver mis boletos")}`,
    ),
  };
}

export function orderRejectedEmail(
  rawName: string | null,
  rawEventTitle: string,
  rawReason: string | null,
  eventUrl: string,
) {
  const name = rawName ? escapeHtml(rawName) : null;
  const eventTitle = escapeHtml(rawEventTitle);
  const reason = rawReason ? escapeHtml(rawReason) : null;
  return {
    subject: `Tu pedido para ${eventTitle} fue rechazado`,
    html: layout(
      `Hola${name ? ` ${name}` : ""}, tu pedido fue rechazado`,
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        El organizador rechazó el comprobante de tu pedido para
        <strong>${eventTitle}</strong> y los asientos fueron liberados.
        ${reason ? `<br/><br/>Motivo: <em>${reason}</em>` : ""}
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        Si creés que es un error, contactá al organizador. Podés intentar
        la compra de nuevo desde la página del evento.
      </p>
      ${button(eventUrl, "Volver al evento")}`,
    ),
  };
}

export function proofSubmittedEmail(
  rawOrganizerName: string | null,
  rawBuyerName: string,
  rawEventTitle: string,
  rawAmountLabel: string,
  reviewUrl: string,
) {
  const name = rawOrganizerName ? escapeHtml(rawOrganizerName) : null;
  const buyerName = escapeHtml(rawBuyerName);
  const eventTitle = escapeHtml(rawEventTitle);
  const amountLabel = escapeHtml(rawAmountLabel);
  return {
    subject: `Nuevo comprobante de pago para ${eventTitle}`,
    html: layout(
      `Hola${name ? ` ${name}` : ""}, tenés un pago por revisar`,
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        <strong>${buyerName}</strong> subió el comprobante de una transferencia de
        <strong>${amountLabel}</strong> para <strong>${eventTitle}</strong>.
        Verificalo para emitir los boletos — mientras tanto el comprador queda
        esperando.
      </p>
      ${button(reviewUrl, "Revisar comprobante")}`,
    ),
  };
}

export function eventPendingReviewEmail(
  rawEventTitle: string,
  rawOrganizerName: string | null,
  reviewUrl: string,
) {
  const eventTitle = escapeHtml(rawEventTitle);
  const organizerName = rawOrganizerName
    ? escapeHtml(rawOrganizerName)
    : "un organizador";
  return {
    subject: `Evento pendiente de revisión: ${eventTitle}`,
    html: layout(
      "Hay un evento esperando aprobación",
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        <strong>${organizerName}</strong> envió <strong>${eventTitle}</strong> a
        revisión. No se publica hasta que lo apruebes o rechaces.
      </p>
      ${button(reviewUrl, "Revisar evento")}`,
    ),
  };
}

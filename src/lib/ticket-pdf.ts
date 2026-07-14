import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface TicketPdfInput {
  eventTitle: string;
  dateLabel: string;
  timeLabel: string;
  venueLabel: string;
  seatLabel: string;
  buyerName: string;
  code: string;
  qrDataUrl: string;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/** Standard fonts only cover WinAnsi; drop anything else (emoji, CJK…). */
function winAnsiSafe(text: string) {
  return text.replace(/[^\x20-\x7E -ÿ]/g, "").trim();
}

const PAGE_WIDTH = 420;
const PAGE_HEIGHT = 640;
const PURPLE = rgb(0.427, 0.169, 1); // brand #6D2BFF
const GRAY = rgb(0.42, 0.4, 0.5);
const DARK = rgb(0.17, 0.17, 0.17);

export async function buildTicketPdf(input: TicketPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText("Üticket", {
    x: 40,
    y: PAGE_HEIGHT - 60,
    size: 24,
    font: bold,
    color: PURPLE,
  });
  page.drawText("Tu entrada en un clic", {
    x: 40,
    y: PAGE_HEIGHT - 78,
    size: 10,
    font: regular,
    color: GRAY,
  });

  let y = PAGE_HEIGHT - 130;
  page.drawText(winAnsiSafe(input.eventTitle), {
    x: 40,
    y,
    size: 18,
    font: bold,
    color: DARK,
    maxWidth: PAGE_WIDTH - 80,
  });
  y -= 30;
  const lines = [
    `${winAnsiSafe(input.dateLabel)} - ${winAnsiSafe(input.timeLabel)}`,
    winAnsiSafe(input.venueLabel),
    winAnsiSafe(input.seatLabel),
    `A nombre de: ${winAnsiSafe(input.buyerName)}`,
  ];
  for (const line of lines) {
    page.drawText(line, {
      x: 40,
      y,
      size: 12,
      font: regular,
      color: DARK,
      maxWidth: PAGE_WIDTH - 80,
    });
    y -= 20;
  }

  const qr = await doc.embedPng(dataUrlToBytes(input.qrDataUrl));
  const qrSize = 240;
  page.drawImage(qr, {
    x: (PAGE_WIDTH - qrSize) / 2,
    y: 170,
    width: qrSize,
    height: qrSize,
  });

  page.drawText(input.code, {
    x: 40,
    y: 130,
    size: 10,
    font: regular,
    color: GRAY,
  });
  page.drawText(
    "Presenta este QR en la entrada. Cada boleto se acepta una sola vez.",
    { x: 40, y: 106, size: 10, font: regular, color: GRAY, maxWidth: PAGE_WIDTH - 80 },
  );

  return doc.save();
}

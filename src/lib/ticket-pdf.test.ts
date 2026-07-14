import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { buildTicketPdf, dataUrlToBytes } from "@/lib/ticket-pdf";

describe("dataUrlToBytes", () => {
  it("decodes the base64 payload", () => {
    const bytes = dataUrlToBytes("data:image/png;base64,aGVsbG8=");
    expect(new TextDecoder().decode(bytes)).toBe("hello");
  });
});

describe("buildTicketPdf", () => {
  it("produces a PDF with the QR embedded", async () => {
    const qrDataUrl = await QRCode.toDataURL("test-code", {
      width: 320,
      margin: 2,
    });
    const pdf = await buildTicketPdf({
      eventTitle: "Concierto de prueba 🎵", // emoji must not crash encoding
      dateLabel: "14 de julio de 2026",
      timeLabel: "20:00 hrs",
      venueLabel: "Teatro Municipal, La Paz",
      seatLabel: "Platea · Asiento A1",
      buyerName: "Ana Pérez",
      code: "123e4567-e89b-12d3-a456-426614174000",
      qrDataUrl,
    });
    expect(pdf.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});

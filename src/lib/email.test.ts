import { describe, expect, it } from "vitest";
import {
  eventPendingReviewEmail,
  parseSender,
  proofSubmittedEmail,
} from "@/lib/email";

describe("parseSender", () => {
  it("splits a display-name sender", () => {
    expect(parseSender("Üticket <hola@uticket.bo>")).toEqual({
      name: "Üticket",
      email: "hola@uticket.bo",
    });
  });
});

describe("proofSubmittedEmail", () => {
  it("escapes user-provided values", () => {
    const { html } = proofSubmittedEmail(
      "Org",
      '<img src=x onerror=alert(1)>',
      "Evento <script>alert(1)</script>",
      "Bs 100,00",
      "https://uticket.bo/dashboard/orders",
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("links to the review page and names the buyer", () => {
    const { subject, html } = proofSubmittedEmail(
      "Org",
      "Ana",
      "Concierto",
      "Bs 250,00",
      "https://uticket.bo/dashboard/orders",
    );
    expect(subject).toContain("Concierto");
    expect(html).toContain("https://uticket.bo/dashboard/orders");
    expect(html).toContain("Ana");
  });
});

describe("eventPendingReviewEmail", () => {
  it("escapes the event title and links to admin review", () => {
    const { html } = eventPendingReviewEmail(
      "Fiesta <b>XXL</b>",
      "Orga",
      "https://uticket.bo/admin/events",
    );
    expect(html).not.toContain("<b>XXL</b>");
    expect(html).toContain("https://uticket.bo/admin/events");
  });
});

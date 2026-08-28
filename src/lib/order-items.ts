/**
 * One place builds every line and ticket label. It reads the COMMERCIAL layer
 * (or, for tickets, the snapshot frozen at purchase) — never the physical
 * layout, which the organizer may rename or delete between events.
 */
export interface OrderItemLike {
  quantity: number;
  seatsQuantity: number | null;
  eventZone: { zone: { name: string } } | null;
  eventTable: { table: { label: string; seats: number } } | null;
  eventSeat: { seat: { row: string; number: number } } | null;
}

/** A sold ticket answers from its own snapshot: the layout may have moved on. */
export interface TicketLike {
  zoneName: string | null;
  tableLabel: string | null;
  seatLabel: string | null;
}

/** "Platea · Asiento A3", "VIP · M4 (8 personas)", "VIP · M4 × 2 lugares",
 *  "General × 4". */
export function orderItemLabel(item: OrderItemLike) {
  const zoneName = item.eventZone?.zone.name ?? "";

  if (item.eventSeat) {
    const { row, number } = item.eventSeat.seat;
    return `${zoneName} · Asiento ${row}${number}`.trim();
  }

  if (item.eventTable) {
    const { label, seats } = item.eventTable.table;
    if (item.seatsQuantity) {
      return `${zoneName} · ${label} × ${item.seatsQuantity} lugar${item.seatsQuantity === 1 ? "" : "es"}`.trim();
    }
    return `${zoneName} · ${label} (${seats} persona${seats === 1 ? "" : "s"})`.trim();
  }

  return `${zoneName || "Zona"} × ${item.quantity}`;
}

export function orderItemsSummary(items: OrderItemLike[]) {
  return items.map(orderItemLabel).join(", ");
}

/** What one ticket says on the door scanner, the PDF and the order page.
 * No quantity here: a ticket is always one person. */
export function ticketLabel(ticket: TicketLike) {
  const zoneName = ticket.zoneName ?? "";
  if (ticket.seatLabel) {
    return `${zoneName} · Asiento ${ticket.seatLabel}`.trim();
  }
  if (ticket.tableLabel) {
    return `${zoneName} · ${ticket.tableLabel}`.trim();
  }
  return zoneName || "Entrada general";
}

/** How many tickets an order line is worth: one per seat, one per person for
 * a whole table, `seatsQuantity` for spots inside a table, and `quantity` for
 * a GENERAL zone. */
export function ticketCountFor(item: {
  quantity: number;
  seatsQuantity: number | null;
  eventSeatId: string | null;
  eventTable: { table: { seats: number } } | null;
}) {
  if (item.eventSeatId) return 1;
  if (item.eventTable) return item.seatsQuantity ?? item.eventTable.table.seats;
  return item.quantity;
}

/** Human wording for what a price includes, frozen onto the ticket. */
/**
 * What one line actually costs: the unit price times the units it covers. A
 * spot line prices `seatsQuantity` spots, everything else prices `quantity`.
 */
export function orderItemTotal(item: {
  unitPrice: number;
  quantity: number;
  seatsQuantity: number | null;
}) {
  return item.unitPrice * (item.seatsQuantity ?? item.quantity);
}

export function inclusionSummary(inclusion: {
  inclusionType: string;
  inclusionValue: number | null;
  inclusionNote: string | null;
}): string | null {
  switch (inclusion.inclusionType) {
    case "ENTRY_ONLY":
      return "Solo entrada, sin consumo";
    case "CONSUMPTION_CREDIT":
      return inclusion.inclusionValue
        ? `Incluye Bs ${inclusion.inclusionValue} de consumo`
        : "Incluye consumo";
    case "BOTTLE":
      return inclusion.inclusionNote ?? "Incluye botella";
    case "CUSTOM":
      return inclusion.inclusionNote;
    default:
      return null;
  }
}

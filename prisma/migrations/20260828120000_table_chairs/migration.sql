-- A table in a discotheque lounge is a sofa with a headcount, not eight
-- chairs. `hasChairs` only decides how the table is drawn and read; `seats`
-- stays the capacity either way, so nothing about selling changes.
ALTER TABLE "Table" ADD COLUMN "hasChairs" BOOLEAN NOT NULL DEFAULT true;

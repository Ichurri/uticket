// cleanDatabase() truncates every table — refuse anything that doesn't look
// like a dedicated test database.
const url = process.env.DATABASE_URL ?? "";
// Strip the query string BEFORE splitting on "/": a unix-socket connection
// carries the socket path in it (`?host=/var/run/postgresql`), so splitting
// first would read "postgresql" as the database name and reject a perfectly
// valid *_test URL.
const dbName = url.split("?")[0].split("/").pop() ?? "";
if (!dbName.endsWith("_test")) {
  throw new Error(
    `Integration tests require a dedicated *_test database, got "${dbName || "(unset)"}". ` +
      'Run: DATABASE_URL="postgresql://ichurri:boletavip_dev@localhost:5432/boletavip_test" pnpm test:integration',
  );
}

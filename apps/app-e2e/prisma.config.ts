import "dotenv/config";
import { join } from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: join("..", "..", "packages", "db", "prisma", "schema.prisma"),
  migrations: {
    seed: "tsx scripts/seed-db.ts",
  },
});

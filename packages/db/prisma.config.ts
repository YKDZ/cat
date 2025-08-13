import "dotenv/config";
import { join } from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: join("prisma"),
  migrations: {
    seed: join("src", "seed.ts"),
  },
});

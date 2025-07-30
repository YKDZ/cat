import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

export default [
  {
    input: "src/index.ts",
    output: {
      dir: "dist",
      format: "esm",
      sourcemap: true,
    },
    plugins: [
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
        declarationDir: null,
        declarationMap: false,
        outDir: null,
      }),
    ],
    external: [
      "@prisma/client",
      "@aws-sdk/s3-request-presigner",
      "@aws-sdk/client-s3",
      "@elastic/elasticsearch",
      "@prisma/client/runtime/library",
      "@prisma/adapter-pg",
      "@prisma/client/runtime/client",
      "@prisma/client/runtime/query_compiler_bg.postgresql.mjs",
      "node:fs/promises",
      "node:module",
      "dotenv/config",
      "redis",
      "node:process",
      "node:path",
      "node:url",
      "node:crypto",
      "@cat/shared"
    ],
  },

  {
    input: "src/index.ts",
    output: {
      file: "dist/index.d.ts",
      format: "esm",
    },
    plugins: [dts()],
  },
];

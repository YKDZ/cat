import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

export default [
  {
    input: "src/index.ts",
    output: {
      file: "dist/index.js",
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

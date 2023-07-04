import { build, emptyDir } from "https://deno.land/x/dnt@0.37.0/mod.ts";

await emptyDir("./npm");

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  shims: {
    undici: true,
    deno: true,
    crypto: true,
    prompts: true,
    blob: true,
  },
  test: true,
  typeCheck: false,
  esModule: false,
  declaration: false,
  package: {
    name: "smply",
    version: Deno.args[0],
    description: "The CLI the StateBacked.dev XState backend as a service",
    license: "MIT",
    author: "Adam Berger <adam@statebacked.dev>",
    bin: "./script/mod.js",
    files: [
      "script/**/*.js",
      "script/**/*.d.ts",
    ],
    devDependencies: {
      "@types/node": "^16.11.0",
    },
    keywords: [
      "statechart",
      "state machine",
      "scxml",
      "state",
      "finite state machine",
      "state backed",
      "backend as a service",
      "paas",
    ],
    homepage: "https://statebacked.dev",
    repository: {
      type: "git",
      url: "git+https://github.com/statebacked/smply.git",
    },
    bugs: {
      url: "https://github.com/statebacked/smply/issues",
    },
  },
  async postBuild() {
    // steps to run after building and before running the tests
    await Promise.all([
      Deno.copyFile("LICENSE", "npm/LICENSE"),
      Deno.copyFile("README.md", "npm/README.md"),
    ]);
  },
});

import { build, emptyDir } from "https://deno.land/x/dnt@0.37.0/mod.ts";
import * as path from "https://deno.land/std@0.192.0/path/mod.ts";

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
  test: false,
  typeCheck: false,
  esModule: true,
  scriptModule: false,
  declaration: false,
  skipSourceOutput: true,
  package: {
    name: "smply",
    version: Deno.args[0],
    description: "The CLI the StateBacked.dev XState backend as a service",
    license: "MIT",
    author: "Adam Berger <adam@statebacked.dev>",
    bin: "./esm/mod.js",
    type: "module",
    files: [
      "esm/**/*.js",
      "esm/**/*.d.ts",
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
      addShebang(),
    ]);
  },
});

async function addShebang() {
  const modPath = path.join("npm", "esm", "mod.js");
  const mod = await Deno.readTextFile(modPath);
  await Deno.writeTextFile(modPath, `#!/usr/bin/env node\n\n${mod}`);
}

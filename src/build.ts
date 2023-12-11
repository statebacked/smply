import * as esbuild from "esbuild";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { denoPlugin } from "@gjsify/esbuild-plugin-deno-loader";

export async function build(inputFile: string, inputType: "node" | "deno") {
  const [bundled, externalized] = await Promise.all([
    _build(inputFile, inputType, false),
    _build(inputFile, inputType, true),
  ]);

  return {
    fileName: externalized.fileName,
    code: externalized.code,
    bundled: bundled.code,
  };
}

async function _build(
  inputFile: string,
  inputType: "node" | "deno",
  externalizeXState: boolean,
) {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "smply-"));
  const outFile = path.join(outDir, "machine.js");
  try {
    const res = await esbuild.build({
      entryPoints: [inputFile],
      bundle: true,
      outfile: outFile,
      platform: "browser",
      format: "esm",
      minify: true,
      keepNames: true,
      legalComments: "none",
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      drop: ["debugger"],
      plugins: inputType === "deno" ? [denoPlugin()] : [],
      ...(externalizeXState
        ? {
            external: ["npm:xstate"],
            alias: {
              xstate: "npm:xstate",
            },
          }
        : {}),
    });

    const code = await fs.readFile(outFile, { encoding: "utf8" });

    if (res.errors && res.errors.length > 0) {
      console.error(res.errors);
      throw new Error(`failed to build '${inputFile}'.`);
    }

    if (!code) {
      throw new Error(`failed to build '${inputFile}'.`);
    }

    return {
      code,
      fileName: path.basename(inputFile),
    };
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
}

import * as esbuild from "esbuild";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { denoPlugin } from "@gjsify/esbuild-plugin-deno-loader";

export async function build(inputFile: string, inputType: "node" | "deno") {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "smply-"));
  const outFile = path.join(outDir, "machine.js");
  try {
    const res = await esbuild.build({
      entryPoints: [inputFile],
      bundle: true,
      outfile: outFile,
      platform: "browser",
      format: "esm",
      plugins: inputType === "deno" ? [denoPlugin()] : [],
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

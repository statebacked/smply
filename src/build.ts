import * as esbuild from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import { denoPlugins } from "https://deno.land/x/esbuild_deno_loader@0.8.1/mod.ts";
import * as path from "https://deno.land/std@0.192.0/path/mod.ts";

export async function build(inputFile: string, inputType: "node" | "deno") {
  const outFile = await Deno.makeTempFile();
  const res = await esbuild.build({
    entryPoints: [inputFile],
    bundle: true,
    outfile: outFile,
    platform: "browser",
    format: "esm",
    plugins: inputType === "deno" ? denoPlugins({ loader: "native" }) : [],
  });

  esbuild.stop();

  const code = await Deno.readFile(outFile);
  await Deno.remove(outFile);

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
}

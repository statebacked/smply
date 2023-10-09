import { spawn } from "node:child_process";
import { copyFile, mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Command } from "commander";
import { PaginationOptions, paginateWithCursor } from "../paginator.js";
import {
  getStatebackedClient,
  writeObj,
  gzip,
  BuildOpts,
  buildFromCommand,
} from "../utils.js";

export function addMachineVersionsCommands(cmd: Command) {
  const machineVersions = cmd
    .command("machine-versions")
    .description("Manage machine definition versions");

  machineVersions
    .command("create")
    .description("Create a new version of a machine definition")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption(
      "-r, --version-reference <versionReference>",
      "Name for the version. E.g. git commit sha or semantic version identifier.",
    )
    .option(
      "-j, --js <file>",
      "Path to the single javascript file that exports the machine definition. Exactly one of --js or --node must be specified.",
    )
    .option(
      "-n, --node <file>",
      "Path to the Node.js entrypoint to use as the machine definition. We will build the file into a single, self-contained ECMAScript module. Exactly one of --js or --node must be specified.",
    )
    .option(
      "-c, --make-current",
      "Make this version the current version",
      false,
    )
    .option("-s, --skip-validation", "Don't validate the bundle", false)
    .action(createMachineVersion);

  machineVersions
    .command("list")
    .description("List versions of a machine definition")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .action(listMachineVersions);

  machineVersions
    .command("validate-bundle")
    .requiredOption(
      "-j, --js <file>",
      "Path to the single javascript file that exports the machine definition.",
    )
    .action(validateBundle);
}

const validationScript = (file: string) => `
import { allowRead, allowWrite, default as machine } from "${file}";
assert(typeof allowRead === "function", "Bundle must export an allowRead function");
assert(typeof allowWrite === "function", "Bundle must export an allowWrite function");
assert(typeof machine === "object", "Bundle must default export a machine definition");
assert("__xstatenode" in machine, "Bundle's default export must be a machine definition");
// machine.definition resolves state references and throws for invalid ones
assert(machine.definition);
`;

async function validateBundle(opts: { js: string; quiet?: boolean }) {
  const nodePath = process.execPath;

  const tmpDir = await mkdtemp(
    path.join(os.tmpdir(), path.basename(opts.js).replace(/\.[^/.]+$/, "")),
  );
  const codePath = path.join(tmpDir, "bundle.mjs");
  try {
    await copyFile(opts.js, codePath);

    const proc = await spawn(
      nodePath,
      ["--input-type=module", "--eval", validationScript(codePath)],
      {
        env: {
          NODE_ENV: "production",
        },
        shell: false,
        stdio: "pipe",
      },
    );

    proc.stderr.pipe(process.stderr);

    const code = await new Promise<number>((resolve) => {
      proc.on("exit", () => {
        resolve(proc.exitCode);
      });
    });

    if (code !== 0) {
      throw new Error("Invalid bundle");
    }

    if (!opts.quiet) {
      console.log("Valid bundle");
    }
  } finally {
    await unlink(codePath).catch(() => {});
    await rmdir(tmpDir).catch(() => {});
  }
}

async function listMachineVersions(
  opts: PaginationOptions & { machine: string },
  options: Command,
) {
  const client = await getStatebackedClient(options);

  await paginateWithCursor(
    (cursor) => client.machineVersions.list(opts.machine, { cursor }),
    (page) => page.versions,
  );
}

async function createMachineVersion(
  opts: BuildOpts & {
    machine: string;
    versionReference: string;
    makeCurrent: boolean;
    skipValidation: boolean;
  },
  options: Command,
) {
  await silencableCreateMachineVersion(opts, options);
}

export async function silencableCreateMachineVersion(
  opts: BuildOpts & {
    machine: string;
    versionReference: string;
    makeCurrent: boolean;
    skipValidation: boolean;
    quiet?: boolean;
  },
  options: Command,
) {
  const code = await buildFromCommand(opts);
  const gzippedCode = await gzip(code.code);

  if (!opts.skipValidation) {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), opts.machine));
    const codePath = path.join(tmpDir, "bundle.js");
    try {
      await writeFile(codePath, code.code, { encoding: "utf8" });
      await validateBundle({ js: codePath, quiet: opts.quiet });
    } finally {
      await unlink(codePath).catch(() => {});
      await rmdir(tmpDir).catch(() => {});
    }
  }

  const client = await getStatebackedClient(options);

  const version = await client.machineVersions.create(opts.machine, {
    clientInfo: opts.versionReference,
    makeCurrent: opts.makeCurrent,
    gzippedCode,
  });

  if (!opts.quiet) {
    writeObj(version);
  }

  return version;
}

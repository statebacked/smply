import { Command } from "commander";
import {
  PaginationOptions,
  getSortOpts,
  paginate,
  withPaginationOptions,
} from "../paginator.js";
import {
  getLoggedInSupabaseClient,
  getStatebackedClient,
  toMachineVersionId,
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
    .action(createMachineVersion);

  withPaginationOptions(machineVersions.command("list"))
    .description("List versions of a machine definition")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .action(listMachineVersions);
}

async function listMachineVersions(
  opts: PaginationOptions & { machine: string },
  options: Command,
) {
  const s = await getLoggedInSupabaseClient(options);

  await paginate(opts, async ({ from, to }) => {
    const { data, error } = await s
      .from("machine_versions")
      .select(
        `
        id,
        client_info,
        created_at,
        machines:machine_id!inner ( slug ),
        current_machine_versions ( machine_id )
    `,
      )
      .filter("machines.slug", "eq", opts.machine)
      .order("created_at", getSortOpts(opts))
      .range(from, to);
    if (error) {
      console.error(error.message);
      throw error;
    }

    return data.map(
      ({ id, client_info, created_at, current_machine_versions }) => ({
        id: toMachineVersionId(id),
        clientInfo: client_info,
        createdAt: created_at,
        isCurrent:
          current_machine_versions && current_machine_versions.length > 0,
      }),
    );
  });
}

async function createMachineVersion(
  opts: BuildOpts & {
    machine: string;
    versionReference: string;
    makeCurrent: boolean;
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
    quiet?: boolean;
  },
  options: Command,
) {
  const code = await buildFromCommand(opts);
  const gzippedCode = await gzip(code.code);

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

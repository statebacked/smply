import { Command, InvalidArgumentError } from "commander";
import { BuildOpts, getStatebackedClient, prompt, writeObj } from "../utils.js";
import { PaginationOptions, paginateWithCursor } from "../paginator.js";
import { silencableCreateMachineVersion } from "./machine-versions.js";
import { errors } from "@statebacked/client";

export function addMachineCommands(cmd: Command) {
  const machines = cmd
    .command("machines")
    .description("Manage state machine definitions");

  machines
    .command("list")
    .description("List machine definitions")
    .action(listMachines);

  machines
    .command("get")
    .description("Get a machine definition")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .action(getMachine);

  machines
    .command("create")
    .description(
      "Create a new machine definition. If a file is specified, the machine will be created with a version. Otherwise, a version must be added before instances of the machine can be launched.",
    )
    .requiredOption(
      "-m, --machine <machine>",
      "Machine definition name. Must be unique within an org. [a-zA-Z0-9_-]+ (required)",
      (slug: string) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
          throw new InvalidArgumentError(
            "name must use only alphanumeric characters, underscores, and dashes",
          );
        }
        return slug;
      },
    )
    .option(
      "-i, --index <index...>",
      "Names of indexes to create for instances of this machine. If you specify one of --js or --node, use --index-selectors instead to specify the actual index selectors. If specified multiple times, multiple indexes will be created.",
    )
    .option(
      "-d, --index-selectors <indexSelectors>",
      "JSON object mapping index names to JSON path expressions that point into the context for each machine instance to extract the value that will be indexed. If you are not specifying --js or --node to create an initial machine version, use --index instead to specify the names of the indexes only.",
    )
    .option(
      "-r, --version-reference <versionReference>",
      "Name for the first version of the machine. E.g. git commit sha or semantic version identifier.",
      "0.0.1",
    )
    .option(
      "-j, --js <file>",
      "Path to the single javascript file that exports the machine definition. If neither of --js or --node are specified, the machine will be created without a version and a version may be added via the 'machines-versions create' command.",
    )
    .option(
      "-n, --node <file>",
      "Path to the Node.js entrypoint to use as the machine definition. We will build the file into a single, self-contained ECMAScript module. If neither of --js or --node are specified, the machine will be created without a version and a version may be added via the 'machines-versions create' command.",
    )
    .option(
      "-s, --skip-validation",
      "Don't validate the bundle. Only valid if --js or --node is specified.",
      false,
    )
    .action(createMachine);

  machines
    .command("delete")
    .description(
      "Delete a machine definition and any associated versions and migrations",
    )
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .action(deleteMachine);
}

async function getMachine(opts: { machine: string }, options: Command) {
  const client = await getStatebackedClient(options);

  const result = await client.machines.get(opts.machine);

  writeObj(result);
}

async function listMachines(opts: PaginationOptions, options: Command) {
  const client = await getStatebackedClient(options);

  await paginateWithCursor(
    (cursor) => client.machines.list({ cursor }),
    (page) =>
      page.machines.map((m) => ({
        name: m.slug,
        createdAt: m.createdAt,
        currentVersion: m.currentVersion,
      })),
  );
}

async function createMachine(
  opts: BuildOpts & {
    machine: string;
    versionReference?: string;
    skipValidation: boolean;
    index?: string[];
    indexSelectors?: string;
  },
  options: Command,
) {
  const client = await getStatebackedClient(options);

  const indexSelectors = opts.indexSelectors
    ? JSON.parse(opts.indexSelectors)
    : undefined;
  if (
    indexSelectors &&
    Object.entries(indexSelectors).some(([k, v]) => !k || typeof v !== "string")
  ) {
    throw new InvalidArgumentError(
      "indexSelectors must be a JSON object mapping index names to JSON path expressions",
    );
  }

  const indexes = indexSelectors ? Object.keys(indexSelectors) : opts.index;

  await client.machines.create(opts.machine, {
    indexes,
  });

  const output = {
    name: opts.machine,
    currentVersion: undefined,
  };

  if (opts.js || opts.node || opts.deno) {
    output.currentVersion = await silencableCreateMachineVersion(
      {
        machine: opts.machine,
        versionReference: opts.versionReference ?? "0.0.1",
        js: opts.js,
        node: opts.node,
        deno: opts.deno,
        skipValidation: opts.skipValidation,
        indexSelectors,
        makeCurrent: true,
        quiet: true,
      },
      options,
    );
  }

  writeObj(output);
}

async function deleteMachine(
  opts: {
    machine: string;
  },
  options: Command,
) {
  console.log("!!! WARNING !!!");
  console.log("Deleting a machine cannot be undone.");
  console.log(
    "The machine and all of its versions and migrations will be permanently deleted.",
  );

  const confirmedMachineName = await prompt(
    `Re-enter the machine name ("${opts.machine}") to confirm deletion:`,
  );

  if (confirmedMachineName !== opts.machine) {
    console.log("Machine name did not match. Aborting.");
    return;
  }

  const client = await getStatebackedClient(options);

  try {
    await client.machines.dangerously.delete(opts.machine, {
      dangerDataWillBeDeletedForever: true,
    });
  } catch (err) {
    if (err instanceof errors.ConflictError) {
      console.warn(
        "Machine has associated instances so cannot be deleted. You can delete the instances and then retry deleting the machine.",
      );
      return;
    }

    throw err;
  }

  console.log("Deleted machine");
}

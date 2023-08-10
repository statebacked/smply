import { Command, InvalidArgumentError } from "commander";
import {
  BuildOpts,
  getLoggedInSupabaseClient,
  getStatebackedClient,
  prompt,
  singleton,
  toMachineVersionId,
  toUserId,
  writeObj,
} from "../utils.js";
import {
  PaginationOptions,
  getSortOpts,
  paginate,
  withPaginationOptions,
} from "../paginator.js";
import { silencableCreateMachineVersion } from "./machine-versions.js";
import { errors } from "@statebacked/client";

export function addMachineCommands(cmd: Command) {
  const machines = cmd
    .command("machines")
    .description("Manage state machine definitions");

  withPaginationOptions(
    machines.command("list").description("List machine definitions"),
  ).action(listMachines);

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
  const s = await getLoggedInSupabaseClient(options);

  const { data, error } = await s
    .from("machines")
    .select(
      `
        slug,
        created_at,
        created_by,
        current_machine_versions (
            machine_versions (
                id,
                client_info,
                created_at
            )
        )
    `,
    )
    .filter("slug", "eq", opts.machine)
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      console.error(`Machine '${opts.machine}' not found`);
      return;
    }
    console.error(error.message);
    throw error;
  }

  const machineVersion = singleton(
    singleton(data.current_machine_versions)?.machine_versions,
  );

  writeObj({
    name: data.slug,
    createdAt: data.created_at,
    createdBy: toUserId(data.created_by),
    currentVersion: machineVersion && {
      id: toMachineVersionId(machineVersion.id),
      createdAt: machineVersion.created_at,
      clientInfo: machineVersion.client_info,
    },
  });
}

async function listMachines(opts: PaginationOptions, options: Command) {
  const s = await getLoggedInSupabaseClient(options);

  await paginate(opts, async ({ from, to }) => {
    const { data, error } = await s
      .from("machines")
      .select(
        `
        slug,
        created_at,
        created_by,
        current_machine_versions (
            machine_versions (
                id,
                client_info,
                created_at
            )
        )
    `,
      )
      .order("created_at", getSortOpts(opts))
      .range(from, to);
    if (error) {
      console.error(error.message);
      throw error;
    }

    return data.map(
      ({ slug, created_at, created_by, current_machine_versions }) => {
        const machineVersion = singleton(
          singleton(current_machine_versions)?.machine_versions,
        );

        return {
          name: slug,
          createdAt: created_at,
          createdBy: toUserId(created_by),
          currentVersion: machineVersion && {
            id: toMachineVersionId(machineVersion.id),
            createdAt: machineVersion.created_at,
            clientInfo: machineVersion.client_info,
          },
        };
      },
    );
  });
}

async function createMachine(
  opts: BuildOpts & {
    machine: string;
    versionReference?: string;
  },
  options: Command,
) {
  const client = await getStatebackedClient(options);

  await client.machines.create(opts.machine);

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

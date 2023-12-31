import { Command, InvalidArgumentError } from "commander";
import { PaginationOptions, paginateWithCursor } from "../paginator.js";
import { BuildOpts, getStatebackedClient, prompt, writeObj } from "../utils.js";

export function addMachineInstancesCommands(cmd: Command) {
  const instances = cmd
    .command("instances")
    .description("Manage state machine instances");

  instances
    .command("list")
    .description("List machine instances")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .action(listMachineInstances);

  instances
    .command("query")
    .description("Query for machine instances")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption("-i, --index <index>", "Index name to query (required)")
    .option(
      "-o, --op <op>",
      "Operator to use for the query. One of 'eq', 'ne', 'lt', 'lte', 'gt', 'gte'. No filter will be applied if not specified.",
    )
    .option(
      "-v, --value <value>",
      "Value to use for the operator (--op). No filter will be applied if not specified.",
    )
    .option(
      "-s, --sort <sort>",
      "Sort order. One of 'asc' or 'desc'. Defaults to 'asc'.",
    )
    .action(queryMachineInstances);

  instances
    .command("get")
    .description("Get a machine instance")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption("-i, --instance <instance>", "Instance name (required)")
    .action(getMachineInstance);

  instances
    .command("create")
    .description("Create a new machine instance")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption(
      "-i, --instance <instance>",
      "Instance name. Must be unique for the given machine. (required)",
    )
    .option(
      "-t, --token <token>",
      "JWT signed with one of your State Backed keys that will provide the auth context for the machine instance. You may a key with 'smply keys create' and a token with 'smply token generate'. Provide only one of --token and --auth-context.",
    )
    .option(
      "-a, --auth-context <authContext>",
      'JSON auth context to use when creating the machine instance. E.g. \'{"sub": "user_1234"}\' Provide only one of --token and --auth-context.',
    )
    .option("-c, --context <context>", "Initial context")
    .option(
      "-v, --version <version>",
      "Machine version ID to use for this instance. If not specified, the current version for the machine will be used.",
    )
    .action(createMachineInstance);

  instances
    .command("send-event")
    .description("Send an event to a machine instance")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption("-i, --instance <instance>", "Instance name (required)")
    .requiredOption(
      "-e, --event <event>",
      'JSON (or string) event to send. If JSON, { "type": "...", ...otherData }. (required)',
    )
    .option(
      "-t, --token <token>",
      "JWT signed with one of your State Backed keys that will provide the auth context for the machine instance. You may a key with 'smply keys create' and a token with 'smply token generate'. Provide only one of --token and --auth-context.",
    )
    .option(
      "-a, --auth-context <authContext>",
      'JSON auth context to use when creating the machine instance. E.g. \'{"sub": "user_1234"}\' Provide only one of --token and --auth-context.',
    )
    .action(sendEventToMachineInstance);

  instances
    .command("set-desired-version")
    .description("Set the desired version for this instance")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption("-i, --instance <instance>", "Instance name (required)")
    .requiredOption(
      "-v, --version <version>",
      "Desired machine version ID to use for this instance (required)",
    )
    .action(setDesiredMachineInstanceVersion);

  instances
    .command("list-transitions")
    .description("List the transitions for this instance")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption("-i, --instance <instance>", "Instance name (required)")
    .action(listInstanceTransitions);

  instances
    .command("set-status")
    .description("Set the status (running or paused) for this instance")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption("-i, --instance <instance>", "Instance name (required)")
    .requiredOption(
      "-s, --status <status>",
      "Status to set. One of 'running' or 'paused'. (required)",
      (status: string) => {
        if (["running", "paused"].indexOf(status) < 0) {
          throw new InvalidArgumentError(
            "status must be one of 'running' or 'paused'",
          );
        }
        return status;
      },
    )
    .action(setMachineInstanceStatus);

  instances
    .command("delete")
    .description("Delete a machine instance")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption("-i, --instance <instance>", "Instance name (required)")
    .action(deleteMachineInstance);
}

async function setDesiredMachineInstanceVersion(
  opts: {
    machine: string;
    instance: string;
    version: string;
  },
  options: Command,
) {
  const client = await getStatebackedClient(options);

  await client.machineInstances.admin.updateDesiredVersion(
    opts.machine,
    opts.instance,
    {
      targetMachineVersionId: opts.version,
    },
  );

  console.log("Successfully set desired version");
}

async function sendEventToMachineInstance(
  opts: {
    machine: string;
    instance: string;
    token: string;
    authContext: string;
    event: string;
  },
  options: Command,
) {
  if (
    (!opts.token && !opts.authContext) ||
    (!!opts.token && !!opts.authContext)
  ) {
    throw new InvalidArgumentError(
      "One of --token or --auth-context is required",
    );
  }

  const event = (() => {
    try {
      return opts.event.trimStart().startsWith("{")
        ? JSON.parse(opts.event)
        : opts.event;
    } catch (err) {
      return opts.event;
    }
  })();

  const client = await getStatebackedClient(options, {
    authContext: JSON.parse(opts.authContext),
    token: opts.token,
  });

  const response = await client.machineInstances.sendEvent(
    opts.machine,
    opts.instance,
    {
      event,
    },
  );

  writeObj(response);
}

async function createMachineInstance(
  opts: {
    machine: string;
    instance: string;
    token: string;
    authContext: string;
    context?: string;
    version?: string;
  },
  options: Command,
) {
  if (
    (!opts.token && !opts.authContext) ||
    (!!opts.token && !!opts.authContext)
  ) {
    throw new InvalidArgumentError(
      "One of --token or --auth-context is required",
    );
  }

  const client = await getStatebackedClient(options, {
    authContext: JSON.parse(opts.authContext),
    token: opts.token,
  });

  const result = await client.machineInstances.create(opts.machine, {
    slug: opts.instance,
    context: opts.context && JSON.parse(opts.context),
    machineVersionId: opts.version,
  });

  writeObj(result);
}

async function getMachineInstance(
  opts: { machine: string; instance: string },
  options: Command,
) {
  const client = await getStatebackedClient(options);

  const result = await client.machineInstances.admin.get(
    opts.machine,
    opts.instance,
  );
  writeObj(result);
}

async function listInstanceTransitions(
  opts: PaginationOptions & { machine: string; instance: string },
  options: Command,
) {
  const client = await getStatebackedClient(options);

  await paginateWithCursor(
    (cursor) =>
      client.machineInstances.listTransitions(opts.machine, opts.instance, {
        cursor,
      }),
    (page) => page.transitions,
  );
}

async function queryMachineInstances(
  opts: PaginationOptions & {
    machine: string;
    index: string;
    op?: "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
    value?: string;
    sort?: "asc" | "desc";
  },
  options: Command,
) {
  if (opts.op && !["eq", "ne", "lt", "lte", "gt", "gte"].includes(opts.op)) {
    throw new InvalidArgumentError(
      "op must be one of 'eq', 'ne', 'lt', 'lte', 'gt', 'gte'",
    );
  }

  if (opts.sort && !["asc", "desc"].includes(opts.sort)) {
    throw new InvalidArgumentError("sort must be one of 'asc' or 'desc'");
  }

  if ((opts.op && !opts.value) || (!opts.op && opts.value)) {
    throw new InvalidArgumentError(
      "op and value must both be specified or neither must be specified",
    );
  }

  const client = await getStatebackedClient(options);

  await paginateWithCursor(
    (cursor) =>
      client.machineInstances.query(opts.machine, opts.index, {
        dir: opts.sort,
        op: opts.op,
        value: opts.value,
        cursor,
      }),
    (page) =>
      page.instances.map((i) => ({
        name: i.slug,
        indexValue: i.indexValue,
      })),
  );
}

async function listMachineInstances(
  opts: PaginationOptions & { machine: string },
  options: Command,
) {
  const client = await getStatebackedClient(options);

  await paginateWithCursor(
    (cursor) =>
      client.machineInstances.list(opts.machine, {
        cursor,
      }),
    (page) =>
      page.instances.map((i) => ({
        name: i.slug,
        createdAt: i.createdAt,
        machineVersion: i.machineVersion,
        status: i.status,
      })),
  );
}

async function deleteMachineInstance(
  opts: BuildOpts & {
    machine: string;
    instance: string;
  },
  options: Command,
) {
  console.log("!!! WARNING !!!");
  console.log("Deleting an instance cannot be undone.");
  console.log(
    "The instance and its current state, all historical transitions, and any pending upgrades will be permanently deleted.",
  );

  const confirmedInstanceName = await prompt(
    `Re-enter the instance name ("${opts.instance}") to confirm deletion:`,
  );

  if (confirmedInstanceName !== opts.instance) {
    console.log("Instance name did not match. Aborting.");
    return;
  }

  const client = await getStatebackedClient(options);

  await client.machineInstances.dangerously.delete(
    opts.machine,
    opts.instance,
    { dangerDataWillBeDeletedForever: true },
  );

  console.log("Deleted instance");
}

async function setMachineInstanceStatus(
  opts: BuildOpts & {
    machine: string;
    instance: string;
    status: "paused" | "running";
  },
  options: Command,
) {
  if (opts.status === "paused") {
    console.log("!!! WARNING !!!");
    console.log(
      "Pausing an instance is one of the only ways it can get into an invalid state.",
    );
    console.log(
      "Paused instances reject all events, including delayed/scheduled events." +
        "\n" +
        "Delayed events are only retried 5 times before being discarded so pausing a machine may cause it to permanently discard some delayed events.",
    );

    const confirmedInstanceName = await prompt(
      `Re-enter the instance name ("${opts.instance}") to confirm you want to pause it:`,
    );

    if (confirmedInstanceName !== opts.instance) {
      console.log("Instance name did not match. Aborting.");
      return;
    }
  }

  const client = await getStatebackedClient(options);

  await client.machineInstances.dangerously.setStatus(
    opts.machine,
    opts.instance,
    { status: opts.status },
  );

  console.log("Set instance status");
}

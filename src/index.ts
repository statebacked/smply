#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as zlib from "node:zlib";
import fetch, { FormData, Blob } from "node-fetch";
import { signToken } from "@statebacked/token";
import { LogEntry, errors } from "@statebacked/client";
import { build } from "./build.js";
import { relativeTime } from "./relative-time.js";
import {
  PaginationOptions,
  getSortOpts,
  paginate,
  withPaginationOptions,
} from "./paginator.js";
import { addKeysCommands } from "./commands/keys.js";
import {
  defaultOrgFile,
  doCreateOrg,
  getApiURL,
  getEffectiveOrg,
  getHeaders,
  getLoggedInSupabaseClient,
  getStatebackedClient,
  getSupabaseClient,
  login,
  toMachineVersionId,
  toOrgId,
  toUserId,
  whileSuppressingOrgCreationPrompt,
  writeObj,
} from "./utils.js";

globalThis.fetch = fetch as any;
globalThis.FormData = FormData as any;
globalThis.Blob = Blob as any;

const VERSION = "0.1.11";

main();

async function main() {
  const program = new Command("smply");
  program
    .name("smply")
    .showSuggestionAfterError()
    .configureHelp({
      showGlobalOptions: true,
    })
    .addHelpText(
      "afterAll",
      "\nDocumentation: https://docs.statebacked.dev\nSupport: support@statebacked.dev\n",
    )
    .version(VERSION, "-V, --smply-version", "Output the current version")
    .description(
      `Command line tool for State Backed.\n\nState Backed runs statecharts as a service.`,
    )
    .option("-t, --access-token <token>", "Access token")
    .option(
      "-u, --api-url <url>",
      "API URL (default: https://api.statebacked.dev)",
      "https://api.statebacked.dev",
    )
    .option(
      "-o, --org <org>",
      "Organization ID (must be set if you have access to multiple orgs and have not set a default org via 'smply orgs default set <org-id>')",
    );

  program
    .command("login")
    .description(
      "Log in to State Backed and store a token in ~/.smply/credentials.",
    )
    .option(
      "--no-store",
      "Don't store tokens, just print the access token to stdout",
    )
    .action(login);

  program
    .command("whoami")
    .description("Print the current user")
    .action(whoami);

  program
    .command("billing")
    .description("Manage billing")
    .action(launchBilling);

  const machines = program
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

  const machineVersions = program
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

  const migrations = program
    .command("migrations")
    .description("Manage migrations between machine versions");

  migrations
    .command("create")
    .description("Create a new migration between machine versions")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption(
      "-f, --from <from>",
      "Machine version ID of the version that is the source of the migration (required)",
    )
    .requiredOption(
      "-t, --to <to>",
      "Machine version ID of the version that is the target of the migration (required)",
    )
    .option(
      "-j, --js <file>",
      "Path to the single javascript file that exports upgradeState and upgradeContext functions. Exactly one of --js or --node must be specified.",
    )
    .option(
      "-n, --node <file>",
      "Path to the Node.js entrypoint that exports upgradeState and upgradeContext functions. We will build the file into a single, self-contained ECMAScript module. Exactly one of --js or --node must be specified.",
    )
    .action(createMachineVersionMigration);

  const instances = program
    .command("instances")
    .description("Manage state machine instances");

  withPaginationOptions(
    instances.command("list").description("List machine instances"),
  )
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .action(listMachineInstances);

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

  withPaginationOptions(instances.command("list-transitions"))
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

  const logs = program
    .command("logs")
    .description(
      "Retrieve execution logs for transitions, actions, services, authorizers, and migrations",
    );

  logs
    .command("get")
    .description("Retrieve one batch of logs")
    .requiredOption(
      "-f, --from <from>",
      "Start date in ISO8201 format or relative format (e.g. '-1h') (required)",
    )
    .option(
      "-t, --to <to>",
      "End date in ISO8201 format or relative format, interpreted relative to `from` (e.g. '1h')",
    )
    .option("-m, --machine <machine>", "Machine name")
    .option("-i, --instance <instance>", "Instance name")
    .option("-v, --version <version>", "Machine version ID")
    .option(
      "-c, --clean",
      "Only output the clean log lines without metadata",
      false,
    )
    .action(getLogs);

  logs
    .command("watch")
    .description("Read all relevant logs and poll for new logs")
    .requiredOption(
      "-f, --from <from>",
      "Start date in ISO8201 format or relative format (e.g. '-1h') (required)",
    )
    .option(
      "-t, --to <to>",
      "End date in ISO8201 format or relative format, interpreted relative to `from` (e.g. '1h')",
    )
    .option("-m, --machine <machine>", "Machine name")
    .option("-i, --instance <instance>", "Instance name")
    .option("-v, --version <version>", "Machine version ID")
    .option(
      "-c, --clean",
      "Only output the clean log lines without metadata",
      false,
    )
    .action(watchLogs);

  const orgs = program.command("orgs").description("Manage organizations");

  withPaginationOptions(
    orgs.command("list").description("List organizations"),
  ).action(listOrgs);

  orgs
    .command("create")
    .description("Create a new organization")
    .requiredOption("-n, --name <name>", "Organization name (required)")
    .action(createOrg);

  const defaultOrg = orgs
    .command("default")
    .description("Default organization. Stored in ~/.smply/default-org.");

  defaultOrg
    .command("set")
    .description("Set the default organization")
    .option("-o, --org <org>", "Organization ID (required)")
    .action(setDefaultOrg);

  defaultOrg
    .command("get")
    .description("Get the default organization.")
    .action(getDefaultOrg);

  addKeysCommands(program);

  const tokens = program
    .command("tokens")
    .description("Utilities to generate tokens");

  tokens
    .command("generate")
    .description("Generate a token")
    .requiredOption(
      "-k, --key <key>",
      "Key ID of the key to use to sign the token (create one with 'smply keys create'). Must match the secret key provided in --secret (required)",
    )
    .requiredOption(
      "-s, --secret <secret>",
      "Secret key to use to sign the token (create one with 'smply keys create'). Must match the key ID provided in --key. (required)",
    )
    .requiredOption(
      "-c, --claims <claims>",
      "JSON user claims to sign. These will be included within the top-level 'act' claim (required)",
    )
    .action(generateToken);

  const invitations = program
    .command("invitations")
    .description("Manage organization invitations");

  invitations
    .command("send")
    .description("Send an invitation to an organization")
    .option("-o, --org <org>", "Organization ID (required)")
    .requiredOption(
      "-e, --email <email>",
      "Email address to send the invitation to (required)",
    )
    .requiredOption(
      "-r, --role <role>",
      "Role to assign to the user. One of 'admin', 'read', or 'write'. Defaults to 'write'.",
      "write",
    )
    .action(sendInvitation);

  invitations
    .command("accept")
    .description("Accept an invitation to an organization")
    .requiredOption(
      "-i, --invitation <invitation>",
      "Invitation code from the email you received (required)",
    )
    .action(acceptInvitation);

  try {
    await program.parseAsync();
  } catch (err) {
    const code = err?.code ? `(${err.code})` : "";
    const name = err?.name ? err.name : "";
    const msg = [
      name,
      name && code ? " " : "",
      code,
      name || code ? ": " : "",
      err?.message,
    ]
      .filter(Boolean)
      .join("");
    console.error(msg);
    process.exit(1);
  }
}

async function acceptInvitation(
  opts: { invitation: string },
  options: Command,
) {
  const headers = await whileSuppressingOrgCreationPrompt(() =>
    getHeaders(options),
  );

  const res = await fetch(
    `${getApiURL(options)}/${encodeURIComponent(opts.invitation)}`,
    {
      method: "PUT",
      headers,
    },
  );

  if (!res.ok) {
    throw new Error(
      `failed to accept invitation (${res.status}): ${await res.text()}`,
    );
  }

  console.log("Invitation accepted. You are now a member of the organization.");
}

async function sendInvitation(
  opts: { email: string; role: string },
  options: Command,
) {
  if (!["admin", "read", "write"].includes(opts.role)) {
    throw new InvalidArgumentError(
      `invalid role '${opts.role}'. Must be one of 'admin', 'read', or 'write'.`,
    );
  }

  if (!opts.email.includes("@")) {
    throw new InvalidArgumentError(`invalid email address '${opts.email}'`);
  }

  const headers = await getHeaders(options);

  const res = await fetch(`${getApiURL(options)}/org-members`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: opts.email,
      role: opts.role,
    }),
  });

  if (!res.ok) {
    throw new Error(`failed to send invitation: ${await res.text()}`);
  }

  console.log("Invitation sent.");
}

async function launchBilling(_: unknown, options: Command) {
  const headers = await getHeaders(options);

  const res = await fetch(`${getApiURL(options)}/billing`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    throw new Error(
      `failed to launch billing (${res.status}): ${await res.text()}`,
    );
  }

  const { url } = (await res.json()) as any;
  console.log(url);
}

async function getDefaultOrg() {
  try {
    const org = await fs.readFile(defaultOrgFile(), { encoding: "utf8" });
    console.log(org);
  } catch (e) {
    if (e?.code === "ENOENT") {
      console.log("No default organization set.");
      return;
    }

    throw e;
  }
}

async function setDefaultOrg(_: { org: string }, options: Command) {
  const opts = options.optsWithGlobals();
  if (!opts.org) {
    throw new InvalidArgumentError("-o or --org is required");
  }

  await fs.writeFile(defaultOrgFile(), opts.org, {
    encoding: "utf8",
    mode: 0o600,
  });

  console.log("Successfully set default org");
}

async function listOrgs(opts: PaginationOptions, options: Command) {
  const s = await getLoggedInSupabaseClient(options);

  await paginate(opts, async ({ from, to }) => {
    const { data, error } = await s
      .from("orgs")
      .select(
        `
      id,
      created_at,
      name,
      org_limits (
        monthly_events_limit,
        monthly_reads_limit
      )
    `,
      )
      .order("created_at", getSortOpts(opts))
      .range(from, to);
    if (error) {
      console.error(error.message);
      throw error;
    }

    return data.map((o) => ({
      id: toOrgId(o.id),
      createdAt: o.created_at,
      name: o.name,
      limits: o.org_limits && {
        monthlyEventsLimit: singleton(o.org_limits).monthly_events_limit,
        monthlyReadsLimit: singleton(o.org_limits).monthly_reads_limit,
      },
    }));
  });
}

async function createOrg(opts: { name: string }, options: Command) {
  const s = await getLoggedInSupabaseClient(options);
  const orgId = await doCreateOrg(s, opts.name);
  writeObj({
    orgId,
  });
}

async function generateToken(opts: {
  key: string;
  secret: string;
  claims: string;
}) {
  const jwt = await signToken(
    { stateBackedKeyId: opts.key, stateBackedSecretKey: opts.secret },
    JSON.parse(opts.claims),
    {
      expires: {
        in: "24h",
      },
      issuer: "https://cli.statebacked.dev/",
    },
  );

  console.log(jwt);
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
    output.currentVersion = await _createMachineVersion(
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
  opts: BuildOpts & {
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
  await _createMachineVersion(opts, options);
}

async function gzip(data: string) {
  return new Promise<Uint8Array>((resolve, reject) => {
    zlib.gzip(data, (err, gzipped) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(
        new Uint8Array(gzipped.buffer, gzipped.byteOffset, gzipped.byteLength),
      );
    });
  });
}

async function _createMachineVersion(
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

type BuildOpts = {
  js?: string;
  node?: string;
  deno?: string;
};

async function buildFromCommand(opts: BuildOpts) {
  const count = [opts.js, opts.node, opts.deno].filter(Boolean).length;

  if (count !== 1) {
    throw new InvalidArgumentError(
      "Exactly one of --js or --node must be specified",
    );
  }

  const code = opts.js
    ? {
        fileName: path.basename(opts.js),
        code: await fs.readFile(opts.js, { encoding: "utf8" }),
      }
    : opts.deno
    ? await build(opts.deno, "deno")
    : opts.node
    ? await build(opts.node, "node")
    : null;

  if (!code) {
    throw new InvalidArgumentError(
      "Exactly one of --js or --node must be specified",
    );
  }

  return code;
}

async function createMachineVersionMigration(
  opts: BuildOpts & {
    machine: string;
    from?: string;
    to?: string;
  },
  options: Command,
) {
  const code = await buildFromCommand(opts);
  const client = await getStatebackedClient(options);
  const gzippedCode = await gzip(code.code);

  const migration = await client.machineVersionMigrations.create(opts.machine, {
    fromMachineVersionId: opts.from,
    toMachineVersionId: opts.to,
    gzippedCode,
  });

  writeObj(migration);
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

  await client.machineInstances.updateDesiredVersion(
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

  const eventResponse = await fetch(
    `${getApiURL(options)}/machines/${opts.machine}/i/${opts.instance}/events`,
    {
      headers: {
        ...(await getHeaders(options)),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.authContext ? { "x-statebacked-act": opts.authContext } : {}),
      },
      method: "POST",
      body: JSON.stringify({
        event,
      }),
    },
  );
  if (!eventResponse.ok) {
    throw new Error(
      `failed to send event (${
        eventResponse.status
      }): ${await eventResponse.text()}`,
    );
  }

  writeObj(await eventResponse.json());
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

  const instanceCreationResponse = await fetch(
    `${getApiURL(options)}/machines/${opts.machine}`,
    {
      headers: {
        ...(await getHeaders(options)),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.authContext ? { "x-statebacked-act": opts.authContext } : {}),
      },
      method: "POST",
      body: JSON.stringify({
        slug: opts.instance,
        context: opts.context && JSON.parse(opts.context),
        machineVersionId: opts.version,
      }),
    },
  );
  if (!instanceCreationResponse.ok) {
    throw new Error(
      `failed to create instance (${
        instanceCreationResponse.status
      }): ${await instanceCreationResponse.text()}`,
    );
  }

  writeObj(await instanceCreationResponse.json());
}

async function getMachineInstance(
  opts: { machine: string; instance: string },
  options: Command,
) {
  const s = await getLoggedInSupabaseClient(options);

  const { data: machineData, error: machineError } = await s
    .from("machines")
    .select(`id, org_id`)
    .filter("slug", "eq", opts.machine)
    .single();

  if (machineError) {
    if (machineError.code === "PGRST116") {
      console.error(`Machine '${opts.machine}' not found`);
      return;
    }
    console.error("failed to retrieve machine", machineError.message);
    throw machineError;
  }

  const { id: machineId, org_id: orgId } = machineData;

  const { data, error } = await s
    .from("machine_instances")
    .select(
      `
        machine_versions (
            id,
            client_info,
            machines (
              slug
            )
        ),
        extended_slug,
        created_at,
        machine_instance_state (
            machine_transitions (
                created_at,
                state
            )
        )
    `,
    )
    .filter("extended_slug", "eq", `${orgId}/${machineId}/${opts.instance}`)
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      console.error(`Instance '${opts.instance}' not found`);
      return;
    }
    console.error(error.message);
    throw error;
  }

  const machineVersions = singleton(data.machine_versions);
  const machineInstanceState = singleton(data.machine_instance_state);
  const latestTransition = singleton(machineInstanceState?.machine_transitions);

  writeObj({
    machineVersionId: toMachineVersionId(machineVersions?.id),
    machineVersionReference: machineVersions?.client_info,
    machineName: singleton(machineVersions?.machines)?.slug,
    createdAt: data.created_at,
    name: data.extended_slug.split("/", 3)[2],
    latestTransition: latestTransition && {
      createdAt: latestTransition.created_at,
      state: (latestTransition.state as any)?.value,
      event: (latestTransition.state as any)?.event.data,
      context: (latestTransition.state as any)?.context,
    },
  });
}

async function listInstanceTransitions(
  opts: PaginationOptions & { machine: string; instance: string },
  options: Command,
) {
  const s = await getLoggedInSupabaseClient(options);

  const { data: machineData, error: machineError } = await s
    .from("machines")
    .select("id, org_id")
    .filter("slug", "eq", opts.machine)
    .single();

  if (machineError) {
    if (machineError.code === "PGRST116") {
      console.error(`Machine '${opts.machine}' not found`);
      return;
    }

    console.error("failed to retrieve machine", machineError.message);
    throw machineError;
  }

  const { id: machineId, org_id: orgId } = machineData;

  await paginate(opts, async ({ from, to }) => {
    const { data, error } = await s
      .from("machine_transitions")
      .select(
        `
          created_at,
          state,
          machine_instances:machine_instance_id!inner (
            extended_slug
          )
        `,
      )
      .filter(
        "machine_instances.extended_slug",
        "eq",
        `${orgId}/${machineId}/${opts.instance}`,
      )
      .order("created_at", getSortOpts(opts))
      .range(from, to);
    if (error) {
      console.error(error.message);
      throw error;
    }

    return data.map((transition) => {
      return {
        createdAt: transition.created_at,
        state: (transition.state as any)?.value,
        event: (transition.state as any)?.event.data,
      };
    });
  });
}

async function listMachineInstances(
  opts: PaginationOptions & { machine: string },
  options: Command,
) {
  const s = await getLoggedInSupabaseClient(options);

  await paginate(opts, async ({ from, to }) => {
    const { data, error } = await s
      .from("machine_instances")
      .select(
        `
          extended_slug,
          created_at,
          machine_instance_state (
              machine_transitions (
                  created_at,
                  state
              )
          ),
          machine_versions:machine_version_id!inner (
            id,
            client_info,
            machines:machine_id!inner (
              slug
            )
          )
        `,
      )
      .filter("machine_versions.machines.slug", "eq", opts.machine)
      .order("created_at", getSortOpts(opts))
      .range(from, to);
    if (error) {
      console.error(error.message);
      throw error;
    }

    return data.map((inst) => {
      const latestTransition = singleton(
        singleton(inst.machine_instance_state)?.machine_transitions,
      );
      // supabase typing seems to get confused by inner joins
      const machineVersion = singleton(inst.machine_versions as any) as
        | {
            id: string;
            client_info: string;
            machines: { slug: string };
          }
        | undefined;

      return {
        name: inst.extended_slug.split("/", 3)[2],
        createdAt: inst.created_at,
        latestTransition: {
          createdAt: latestTransition?.created_at,
          state: (latestTransition?.state as any)?.value,
          event: (latestTransition?.state as any)?.event.data,
        },
        machineVersionId: toMachineVersionId(machineVersion?.id),
        machineVersionReference: machineVersion?.client_info,
        machineName: singleton(machineVersion?.machines)?.slug,
      };
    });
  });
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

function singleton<T>(
  maybeArr: T | Array<T> | undefined | null,
): T | undefined | null {
  return typeof maybeArr === "undefined"
    ? undefined
    : maybeArr === null
    ? null
    : Array.isArray(maybeArr)
    ? maybeArr[0]
    : maybeArr;
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

type LogOpts = {
  from: string;
  to?: string;
  machine?: string;
  instance?: string;
  version?: string;
  clean?: boolean;
};

const validateLogOpts = (opts: LogOpts) => {
  const from = relativeTime(opts.from);
  if (Number.isNaN(from.getTime())) {
    throw new InvalidArgumentError("invalid from date");
  }

  const to = opts.to && relativeTime(opts.to, from);
  if (to && Number.isNaN(to.getTime())) {
    throw new InvalidArgumentError("invalid to date");
  }

  if (to && to < from) {
    throw new InvalidArgumentError("to must be after from");
  }

  return {
    ...opts,
    from,
    to,
  };
};

async function watchLogs(opts: LogOpts, options: Command) {
  const client = await getStatebackedClient(options);

  const { from, to } = validateLogOpts(opts);

  const logs = await client.logs.watch(from, {
    to,
    machineName: opts.machine,
    instanceName: opts.instance,
    machineVersionId: opts.version,
  });

  printLogs(logs, opts.clean);
}

async function printLogs(
  logs: AsyncIterable<LogEntry> | Iterable<LogEntry>,
  clean: boolean,
) {
  let lastIdentifier: string | undefined;
  for await (const log of logs) {
    if (!clean) {
      writeObj(log);
      continue;
    }

    const identifier = `${log.machineName}/${log.machineVersionId}/${log.instanceName}/${log.orgId}/${log.outputType}`;
    if (identifier !== lastIdentifier) {
      if (lastIdentifier) {
        console.log();
      }
      console.log(
        JSON.stringify({
          msg: "logs for",
          machineName: log.machineName,
          instanceName: log.instanceName,
          machineVersionId: log.machineVersionId,
          orgId: log.orgId,
        }),
      );
      console.log();
      console.log(log.outputType);
      console.log();
      lastIdentifier = identifier;
    }

    console.log(log.log);
  }
}

async function getLogs(opts: LogOpts, options: Command) {
  const client = await getStatebackedClient(options);

  const { from, to } = validateLogOpts(opts);

  const logs = await client.logs.retrieve(from, {
    to,
    machineName: opts.machine,
    instanceName: opts.instance,
    machineVersionId: opts.version,
  });

  if (!opts.clean) {
    writeObj(logs);
    return;
  }

  await printLogs(logs.logs, opts.clean);
}

async function whoami(_: unknown, options: Command) {
  const s = getSupabaseClient({ store: false });
  const { data, error } = await s.auth.getUser();
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  writeObj({
    email: data.user.email,
    userId: data.user.id,
    defaultOrg: await getEffectiveOrg(options),
  });
}

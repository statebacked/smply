#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander";
import * as fs from "node:fs/promises";
import fetch, { FormData, Blob } from "node-fetch";
import { signToken } from "@statebacked/token";
import { LogEntry } from "@statebacked/client";
import { relativeTime } from "./relative-time.js";
import {
  PaginationOptions,
  getSortOpts,
  paginate,
  withPaginationOptions,
} from "./paginator.js";
import { addKeysCommands } from "./commands/keys.js";
import {
  BuildOpts,
  buildFromCommand,
  defaultOrgFile,
  doCreateOrg,
  getApiURL,
  getEffectiveOrg,
  getHeaders,
  getLoggedInSupabaseClient,
  getStatebackedClient,
  getSupabaseClient,
  gzip,
  login,
  singleton,
  toOrgId,
  whileSuppressingOrgCreationPrompt,
  writeObj,
} from "./utils.js";
import { addMachineVersionsCommands } from "./commands/machine-versions.js";
import { addMachineCommands } from "./commands/machines.js";
import { addMachineInstancesCommands } from "./commands/instances.js";
import { addMigrationsCommands } from "./commands/migrations.js";

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

  addMachineCommands(program);

  addMachineVersionsCommands(program);

  addMigrationsCommands(program);

  addMachineInstancesCommands(program);

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

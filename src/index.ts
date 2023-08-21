#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander";
import * as fs from "node:fs/promises";
import fetch, { FormData, Blob } from "node-fetch";
import { signToken } from "@statebacked/token";
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
  singleton,
  toOrgId,
  whileSuppressingOrgCreationPrompt,
  writeObj,
} from "./utils.js";
import { addMachineVersionsCommands } from "./commands/machine-versions.js";
import { addMachineCommands } from "./commands/machines.js";
import { addMachineInstancesCommands } from "./commands/instances.js";
import { addMigrationsCommands } from "./commands/migrations.js";
import { addLogsCommands } from "./commands/logs.js";
import { addIdentityProviderCommands } from "./commands/identity-providers.js";
import { addTokenProviderCommands } from "./commands/token-providers.js";

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

  addLogsCommands(program);

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

  addIdentityProviderCommands(program);

  addTokenProviderCommands(program);

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
  const client = await getStatebackedClient(options);

  const { url } = await client.billing.get();

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

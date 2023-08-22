import { Command, InvalidArgumentError } from "commander";
import { PaginationOptions, paginateWithCursor } from "../paginator.js";
import { getStatebackedClient, writeObj } from "../utils.js";

const allowedScopes = [
  "events.write",
  "events.read",
  "state.read",
  "instances.read",
  "instances.write",
  "machines.read",
  "machines.write",
  "machine-versions.read",
  "machine-versions.write",
  "analytics.read",
  "org.keys.write",
  "org-members.write",
];

export function addKeysCommands(cmd: Command) {
  const keys = cmd.command("keys").description("Manage API keys");

  keys
    .command("create")
    .description("Create a new API key")
    .option(
      "-u, --use [use]",
      "Use for this key. One of 'production' or 'ci'. 'production' adds scopes necessary for creating instances of existing machines, sending events to instances, and reading machine instance state. 'ci' adds scopes necessary for creating machines and machine versions.",
      "production",
    )
    .option(
      "-s, --scopes [scopes...]",
      `Comma-separated list of scopes to add to the key. If not specified, the default scopes for the use will be added. Valid scopes are: ${allowedScopes
        .map((s) => `'${s}'`)
        .join(", ")}`,
    )
    .requiredOption("-n, --name <name>", "Name for the key")
    .action(createKey);

  keys.command("list").description("List API keys").action(listKeys);

  keys
    .command("delete")
    .description("Delete an API key")
    .requiredOption("-k, --key <key>", "Key ID (required)")
    .action(deleteKey);
}

async function listKeys(opts: PaginationOptions, options: Command) {
  const client = await getStatebackedClient(options);

  await paginateWithCursor(
    (cursor) => client.keys.list({ cursor }),
    (k) => k.keys,
  );
}

async function createKey(
  opts: { use?: string; scopes?: Array<string>; name: string },
  options: Command,
) {
  if (!opts.use && (!opts.scopes || opts.scopes.length === 0)) {
    throw new InvalidArgumentError(
      "Either --use or --scopes must be specified",
    );
  }

  if (opts.use !== "production" && opts.scopes && opts.scopes.length > 0) {
    throw new InvalidArgumentError(
      "Only one of --use or --scopes may be specified",
    );
  }

  if (opts.use && !["production", "ci"].includes(opts.use)) {
    throw new InvalidArgumentError("--use must be one of ['production', 'ci']");
  }

  if (opts.scopes) {
    for (const scope of opts.scopes) {
      if (!allowedScopes.includes(scope)) {
        throw new InvalidArgumentError(
          `invalid scope '${scope}'. Valid scopes are: ${allowedScopes.join(
            ", ",
          )}`,
        );
      }
    }
  }

  const client = await getStatebackedClient(options);

  const { id, key } = await client.keys.create({
    name: opts.name,
    use: opts.use as any,
    scopes: opts.scopes as any,
  });

  console.log(
    "Store this key safely now. You can create additional keys in the future but this key will never be shown again!",
  );
  writeObj({ id, key });
}

async function deleteKey(opts: { key: string }, options: Command) {
  const client = await getStatebackedClient(options);

  await client.keys.delete(opts.key);

  console.log("Successfully deleted key");
}

import { Command, InvalidArgumentError } from "npm:commander@11.0.0";
import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.26.0";
import * as path from "https://deno.land/std@0.192.0/path/mod.ts";
import { signToken } from "https://deno.land/x/statebacked_token@v0.2.0/mod.ts";

const VERSION = "0.1.0";

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

main();

function main() {
  const program = new Command("smply");
  program.name("smply")
    .showSuggestionAfterError()
    .configureHelp({
      showGlobalOptions: true,
    })
    .addHelpText(
      "afterAll",
      "\nDocumentation: https://docs.statebacked.dev\nSupport: support@statebacked.dev\n",
    )
    .version(VERSION)
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

  program.command("login")
    .description(
      "Log in to State Backed and store a token in ~/.smply/credentials.",
    )
    .option(
      "--no-store",
      "Don't store tokens, just print the access token to stdout",
    )
    .action(login);

  program.command("whoami")
    .description("Print the current user")
    .action(whoami);

  program.command("billing")
    .description("Manage billing")
    .action(launchBilling);

  const machines = program.command("machines")
    .description("Manage state machine definitions");

  withPaginationOptions(
    machines.command("list").description("List machine definitions"),
  )
    .action(listMachines);

  machines.command("get")
    .description("Get a machine definition")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .action(getMachine);

  machines.command("create")
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
      "-f, --file <file>",
      "Path to the single javascript file that exports the machine definition. If not specified, the machine will be created without a version and a version may be added via the 'machines-versions create' command.",
    )
    .action(createMachine);

  const machineVersions = program.command("machine-versions")
    .description("Manage machine definition versions");

  machineVersions.command("create")
    .description("Create a new version of a machine definition")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption(
      "-r, --version-reference <versionReference>",
      "Name for the version. E.g. git commit sha or semantic version identifier.",
    )
    .requiredOption(
      "-f, --file <file>",
      "Path to the single javascript file that exports the machine definition. (required)",
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

  const instances = program.command("instances")
    .description("Manage state machine instances");

  withPaginationOptions(
    instances.command("list").description("List machine instances"),
  )
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .action(listMachineInstances);

  instances.command("get")
    .description("Get a machine instance")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption("-i, --instance <instance>", "Instance name (required)")
    .action(getMachineInstance);

  instances.command("create")
    .description("Create a new machine instance")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption(
      "-i, --instance <instance>",
      "Instance name. Must be unique for the given machine. (required)",
    )
    .requiredOption(
      "-t, --token <token>",
      "JWT signed with one of your State Backed keys that will provide the auth context for the machine instance. You may a key with 'smply keys create' and a token with 'smply token generate'.",
    )
    .option("-c, --context <context>", "Initial context")
    .option(
      "-v, --version <version>",
      "Machine version ID to use for this instance. If not specified, the current version for the machine will be used.",
    )
    .action(createMachineInstance);

  instances.command("send-event")
    .description("Send an event to a machine instance")
    .requiredOption("-m, --machine <machine>", "Machine name (required)")
    .requiredOption("-i, --instance <instance>", "Instance name (required)")
    .requiredOption(
      "-e, --event <event>",
      'JSON (or string) event to send. If JSON, { "type": "...", ...otherData }. (required)',
    )
    .requiredOption(
      "-t, --token <token>",
      "JWT signed with one of your State Backed keys that will provide the auth context for the machine instance. You may a key with 'smply keys create' and a token with 'smply token generate'.",
    )
    .action(sendEventToMachineInstance);

  const orgs = program.command("orgs")
    .description("Manage organizations");

  withPaginationOptions(
    orgs.command("list")
      .description("List organizations"),
  )
    .action(listOrgs);

  orgs.command("create")
    .description("Create a new organization")
    .requiredOption("-n, --name <name>", "Organization name (required)")
    .action(createOrg);

  const defaultOrg = orgs.command("default").description(
    "Default organization. Stored in ~/.smply/default-org.",
  );

  defaultOrg.command("set")
    .description("Set the default organization")
    .option("-o, --org <org>", "Organization ID (required)")
    .action(setDefaultOrg);

  defaultOrg.command("get")
    .description("Get the default organization.")
    .action(getDefaultOrg);

  const keys = program.command("keys")
    .description("Manage API keys");

  keys.command("create")
    .description("Create a new API key")
    .option(
      "-u, --use [use]",
      "Use for this key. One of 'production' or 'ci'. 'production' adds scopes necessary for creating instances of existing machines, sending events to instances, and reading machine instance state. 'ci' adds scopes necessary for creating machines and machine versions.",
      "production",
    )
    .option(
      "-s, --scopes [scopes...]",
      `Comma-separated list of scopes to add to the key. If not specified, the default scopes for the use will be added. Valid scopes are: ${
        allowedScopes.map((s) => `'${s}'`).join(", ")
      }`,
    )
    .requiredOption("-n, --name <name>", "Name for the key")
    .action(createKey);

  withPaginationOptions(
    keys.command("list")
      .description("List API keys"),
  )
    .action(listKeys);

  keys.command("delete")
    .description("Delete an API key")
    .requiredOption("-k, --key <key>", "Key ID (required)")
    .action(deleteKey);

  const tokens = program.command("tokens")
    .description("Utilities to generate tokens");

  tokens.command("generate")
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

  const invitations = program.command("invitations")
    .description("Manage organization invitations");

  invitations.command("send")
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

  invitations.command("accept")
    .description("Accept an invitation to an organization")
    .requiredOption(
      "-i, --invitation <invitation>",
      "Invitation code from the email you received (required)",
    )
    .action(acceptInvitation);

  const _args = program.parse(Deno.args, { from: "user" });
}

function withPaginationOptions(cmd: Command) {
  return cmd
    .option("-n, --count <count>", "Number of items to retrieve", "20")
    .option("-o, --offset <offset>", "Offset to start listing from", "0")
    .option(
      "-d, --descending",
      "Sort in descending order by creation date (default: sort in ascending order by creation date)",
      false,
    );
}

type PaginationOptions = {
  count?: string;
  offset?: string;
  descending?: boolean;
};

function defaultOrgFile() {
  return path.join(getSmplyConfigDir(), "default-org");
}

async function getHeaders(options: Command) {
  const s = await getLoggedInSupabaseClient(options);
  const accessToken = (await s.auth.getSession()).data?.session?.access_token;
  const org = await getEffectiveOrg(options);

  return {
    authorization: `Bearer ${accessToken}`,
    ...(org ? { "x-statebacked-org-id": org } : {}),
  };
}

async function getEffectiveOrg(options: Command) {
  const optsOrg = options.optsWithGlobals().org;
  if (optsOrg) {
    return optsOrg;
  }

  try {
    return await Deno.readTextFile(defaultOrgFile());
  } catch (_) {
    return null;
  }
}

const [whileSuppressingOrgCreationPrompt, isOrgCreationPromptSuppressed] =
  (() => {
    let suppressed = false;
    async function whileSuppressingOrgCreationPrompt<T>(f: () => Promise<T>) {
      suppressed = true;
      try {
        return await f();
      } finally {
        suppressed = false;
      }
    }

    function isOrgCreationPromptSuppressed() {
      return suppressed;
    }

    return [whileSuppressingOrgCreationPrompt, isOrgCreationPromptSuppressed];
  })();

async function acceptInvitation(
  opts: { invitation: string },
  options: Command,
) {
  const headers = await whileSuppressingOrgCreationPrompt(() =>
    getHeaders(options)
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

  const res = await fetch(
    `${getApiURL(options)}/org-members`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: opts.email,
        role: opts.role,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`failed to send invitation: ${await res.text()}`);
  }

  console.log("Invitation sent.");
}

async function launchBilling(
  _: unknown,
  options: Command,
) {
  const headers = await getHeaders(options);

  const res = await fetch(
    `${getApiURL(options)}/billing`,
    {
      method: "GET",
      headers,
    },
  );

  if (!res.ok) {
    throw new Error(
      `failed to launch billing (${res.status}): ${await res.text()}`,
    );
  }

  const { url } = await res.json();
  console.log(url);
}

async function getDefaultOrg() {
  try {
    const org = await Deno.readTextFile(defaultOrgFile());
    console.log(org);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.log("No default organization set.");
      return;
    }

    throw e;
  }
}

async function setDefaultOrg(
  _: { org: string },
  options: Command,
) {
  const opts = options.optsWithGlobals();
  if (!opts.org) {
    throw new InvalidArgumentError("-o or --org is required");
  }

  await Deno.writeTextFile(
    defaultOrgFile(),
    opts.org,
    {
      mode: 0o600,
    },
  );

  console.log("Successfully set default org");
}

function getSortOpts(opts: PaginationOptions) {
  return {
    ascending: !opts.descending,
  };
}

async function listOrgs(
  opts: PaginationOptions,
  options: Command,
) {
  const s = await getLoggedInSupabaseClient(options);

  await paginate(opts, async ({ from, to }) => {
    const { data, error } = await s.from("orgs").select(`
      id,
      created_at,
      name,
      org_limits (
        monthly_events_limit,
        monthly_reads_limit
      )
    `).order("created_at", getSortOpts(opts)).range(from, to);
    if (error) {
      console.error(error.message);
      throw error;
    }

    return data;
  });
}

async function createOrg(
  opts: { name: string },
  options: Command,
) {
  const s = await getLoggedInSupabaseClient(options);
  const orgId = await doCreateOrg(s, opts.name);
  console.log({
    orgId,
  });
}

async function doCreateOrg(s: SupabaseClient, orgName: string) {
  // we need to insert and then select because we don't have permission to see the org until we're a member of it, which happens via trigger
  const { error } = await s.from("orgs").insert({
    name: orgName,
  });
  if (error) {
    console.error(error.message);
    throw error;
  }

  const { data, error: err } = await s.from("orgs").select("id").filter(
    "name",
    "eq",
    orgName,
  ).order("created_at", { ascending: false }).limit(1).single();
  if (err) {
    console.error(err.message);
    throw err;
  }

  return data.id;
}

async function generateToken(
  opts: { key: string; secret: string; claims: string },
) {
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

async function deleteKey(
  opts: { key: string },
  options: Command,
) {
  const s = await getLoggedInSupabaseClient(options);

  const { error } = await s.from("keys").delete().eq("id", opts.key);
  if (error) {
    console.error("failed to delete key", error.message);
    throw error;
  }
}

async function listKeys(
  opts: PaginationOptions,
  options: Command,
) {
  const s = await getLoggedInSupabaseClient(options);

  await paginate(opts, async ({ from, to }) => {
    const { data, error } = await s.from("keys").select(`
      id,
      created_at,
      name,
      created_by,
      scope
    `).order("created_at", getSortOpts(opts)).range(from, to);
    if (error) {
      console.error(error.message);
      throw error;
    }

    return data;
  });
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
          `invalid scope '${scope}'. Valid scopes are: ${
            allowedScopes.join(", ")
          }`,
        );
      }
    }
  }

  const headers = await getHeaders(options);

  const createKeyResponse = await fetch(
    `${getApiURL(options)}/keys`,
    {
      headers,
      method: "POST",
      body: JSON.stringify({
        name: opts.name,
        use: !opts.scopes || opts.scopes.length === 0 ? opts.use : undefined,
        scopes: opts.scopes,
      }),
    },
  );
  if (!createKeyResponse.ok) {
    throw new Error(
      `failed to create key (${createKeyResponse.status}): ${await createKeyResponse
        .text()}`,
    );
  }

  const { id, key } = await createKeyResponse.json();
  console.log(
    "Store this key safely now. You can create additional keys in the future but this key will never be shown again!",
  );
  console.log({ id, key });
}

async function createMachine(
  opts: { machine: string; versionReference?: string; file?: string },
  options: Command,
) {
  const headers = await getHeaders(options);

  const machineCreationResponse = await fetch(
    `${getApiURL(options)}/machines`,
    {
      headers,
      method: "POST",
      body: JSON.stringify({
        slug: opts.machine,
      }),
    },
  );
  if (!machineCreationResponse.ok) {
    throw new Error(
      `failed to create machine (${machineCreationResponse.status}): ${await machineCreationResponse
        .text()}`,
    );
  }

  console.log(`Created machine: '${opts.machine}'`);

  if (opts.file) {
    await createMachineVersion(
      {
        machine: opts.machine,
        versionReference: opts.versionReference ?? "0.0.1",
        file: opts.file,
        makeCurrent: true,
      },
      options,
    );
  }

  console.log(`Machine '${opts.machine}' is ready to be launched`);
}

async function listMachineVersions(
  opts: PaginationOptions & { machine: string },
  options: Command,
) {
  const s = await getLoggedInSupabaseClient(options);

  await paginate(opts, async ({ from, to }) => {
    const { data, error } = await s.from("machine_versions").select(`
        id,
        client_info,
        created_at,
        machines:machine_id!inner ( slug ),
        current_machine_versions ( machine_id )
    `).filter("machines.slug", "eq", opts.machine).order(
      "created_at",
      getSortOpts(opts),
    ).range(from, to);
    if (error) {
      console.error(error.message);
      throw error;
    }

    return data.map((
      { id, client_info, created_at, current_machine_versions },
    ) => ({
      id,
      client_info,
      created_at,
      is_current: current_machine_versions &&
        current_machine_versions.length > 0,
    }));
  });
}

async function createMachineVersion(
  opts: {
    machine: string;
    versionReference: string;
    file: string;
    makeCurrent: boolean;
  },
  options: Command,
) {
  const headers = await getHeaders(options);

  const versionCreationStep1Res = await fetch(
    `${getApiURL(options)}/machines/${opts.machine}/v`,
    {
      headers,
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  if (!versionCreationStep1Res.ok) {
    throw new Error(
      `failed to create version: ${await versionCreationStep1Res.text()}`,
    );
  }

  const { machineVersionId, codeUploadUrl, codeUploadFields } =
    await versionCreationStep1Res.json();

  const uploadForm = new FormData();
  for (const [key, value] of Object.entries(codeUploadFields)) {
    uploadForm.append(key, value as string);
  }
  uploadForm.set("content-type", "application/javascript");
  uploadForm.append(
    "file",
    new Blob([await Deno.readFile(opts.file)], {
      type: "application/javascript",
    }),
    path.basename(opts.file),
  );

  const uploadRes = await fetch(
    codeUploadUrl,
    {
      method: "POST",
      body: uploadForm,
    },
  );
  if (!uploadRes.ok) {
    throw new Error(
      `failed to upload code for version: ${await uploadRes.text()}`,
    );
  }

  const versionCreationStep2Res = await fetch(
    `${getApiURL(options)}/machines/${opts.machine}/v/${machineVersionId}`,
    {
      headers,
      method: "PUT",
      body: JSON.stringify({
        clientInfo: opts.versionReference,
        makeCurrent: opts.makeCurrent,
      }),
    },
  );

  if (!versionCreationStep2Res.ok) {
    throw new Error(
      `failed to create version: ${await versionCreationStep2Res.text()}`,
    );
  }

  console.log(`Created version: '${opts.versionReference}'`);
}

async function sendEventToMachineInstance(
  opts: {
    machine: string;
    instance: string;
    token: string;
    event: string;
  },
  options: Command,
) {
  const eventResponse = await fetch(
    `${getApiURL(options)}/machines/${opts.machine}/i/${opts.instance}/events`,
    {
      headers: {
        authorization: `Bearer ${opts.token}`,
      },
      method: "POST",
      body: JSON.stringify({
        event: opts.event,
      }),
    },
  );
  if (!eventResponse.ok) {
    throw new Error(
      `failed to send event (${eventResponse.status}): ${await eventResponse
        .text()}`,
    );
  }

  console.log(await eventResponse.json());
}

async function createMachineInstance(
  opts: {
    machine: string;
    instance: string;
    token: string;
    context?: string;
    version?: string;
  },
  options: Command,
) {
  const instanceCreationResponse = await fetch(
    `${getApiURL(options)}/machines/${opts.machine}`,
    {
      headers: {
        authorization: `Bearer ${opts.token}`,
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
      `failed to create instance (${instanceCreationResponse.status}): ${await instanceCreationResponse
        .text()}`,
    );
  }

  console.log(await instanceCreationResponse.json());
}

async function getMachineInstance(
  opts: { machine: string; instance: string },
  options: Command,
) {
  const s = await getLoggedInSupabaseClient(options);

  const { data: machineData, error: machineError } = await s.from("machines")
    .select(`id, org_id`)
    .filter("slug", "eq", opts.machine)
    .single();

  if (machineError) {
    console.error("failed to retrieve machine", machineError.message);
    throw machineError;
  }

  const { id: machineId, org_id: orgId } = machineData;

  const { data, error } = await s.from("machine_instances")
    .select(`
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
    `)
    .filter("extended_slug", "eq", `${orgId}/${machineId}/${opts.instance}`)
    .single();
  if (error) {
    console.error(error.message);
    throw error;
  }

  const machineVersions = singleton(data.machine_versions);
  const machineInstanceState = singleton(data.machine_instance_state);
  const latestTransition = singleton(machineInstanceState?.machine_transitions);

  console.log({
    machine_version_id: machineVersions?.id,
    machine_version_reference: machineVersions?.client_info,
    machine_name: singleton(machineVersions?.machines)?.slug,
    created_at: data.created_at,
    name: data.extended_slug.split("/", 3)[2],
    latest_transition: latestTransition && {
      created_at: latestTransition.created_at,
      state: latestTransition.state.value,
      event: latestTransition.state.event.data,
      context: latestTransition.state.context,
    },
  });
}

async function listMachineInstances(
  opts: PaginationOptions & { machine: string },
  options: Command,
) {
  const s = await getLoggedInSupabaseClient(options);

  await paginate(opts, async ({ from, to }) => {
    const { data, error } = await s.from("machine_instances")
      .select(`
          extended_slug,
          created_at,
          machine_instance_state (
              machine_transitions (
                  created_at,
                  state
              )
          ),
          machine_versions (
            id,
            client_info,
            machines (
              slug
            )
          )
        `)
      .filter("machine_versions.machines.slug", "eq", opts.machine)
      .order(
        "created_at",
        getSortOpts(opts),
      ).range(from, to);
    if (error) {
      console.error(error.message);
      throw error;
    }

    return data.map((inst) => {
      const latestTransition = singleton(
        singleton(inst.machine_instance_state)?.machine_transitions,
      );
      const machineVersion = singleton(inst.machine_versions);

      return {
        name: inst.extended_slug.split("/", 3)[2],
        created_at: inst.created_at,
        latest_transition: {
          created_at: latestTransition?.created_at,
          state: latestTransition?.state.value,
          event: latestTransition?.state.event.data,
        },
        machine_version_id: machineVersion?.id,
        machine_version_reference: machineVersion?.client_info,
        machine_name: singleton(machineVersion?.machines)?.slug,
      };
    });
  });
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

  const { data, error } = await s.from("machines").select(`
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
    `).filter("slug", "eq", opts.machine).single();
  if (error) {
    console.error(error.message);
    throw error;
  }

  const machineVersion = singleton(
    singleton(data.current_machine_versions)?.machine_versions,
  );

  console.log({
    name: data.slug,
    created_at: data.created_at,
    created_by: data.created_by,
    current_version: machineVersion && {
      id: machineVersion.id,
      created_at: machineVersion.created_at,
      client_info: machineVersion.client_info,
    },
  });
}

async function listMachines(opts: PaginationOptions, options: Command) {
  const s = await getLoggedInSupabaseClient(options);

  await paginate(opts, async ({ from, to }) => {
    const { data, error } = await s.from("machines").select(`
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
    `).order(
      "created_at",
      getSortOpts(opts),
    ).range(from, to);
    if (error) {
      console.error(error.message);
      throw error;
    }

    return data.map((
      { slug, created_at, created_by, current_machine_versions },
    ) => {
      const machineVersion = singleton(
        singleton(current_machine_versions)?.machine_versions,
      );

      return {
        name: slug,
        created_at,
        created_by,
        current_version: machineVersion && {
          id: machineVersion.id,
          created_at: machineVersion.created_at,
          client_info: machineVersion.client_info,
        },
      };
    });
  });
}

async function paginate<T>(
  opts: PaginationOptions,
  getItems: (opts: { from: number; to: number }) => Promise<Array<T>>,
) {
  const pageSize = opts.count ? parseInt(opts.count, 10) : 20;
  let from = opts.offset ? parseInt(opts.offset, 10) : 0;
  let to = pageSize - 1;
  const shouldPaginate = Deno.isatty(Deno.stdout.rid);
  let more = true;
  while (more) {
    const page = await getItems({ from, to });
    console.log(page);

    if (!shouldPaginate || page.length < pageSize) {
      more = false;
    } else {
      from += pageSize;
      to += pageSize;
      const quit = await prompt("Press enter for more (q + Enter to quit)...");
      if (quit === "q") {
        more = false;
      }
    }
  }
}

async function whoami(_: unknown, options: Command) {
  const s = getSupabaseClient({ store: false });
  const { data, error } = await s.auth.getUser();
  if (error) {
    console.error(error.message);
    Deno.exit(1);
  }
  console.log({
    email: data.user.email,
    userId: data.user.id,
    defaultOrg: await getEffectiveOrg(options),
  });
}

async function login(opts: { store: boolean }) {
  const shouldStore = opts.store;
  const s = getSupabaseClient({ store: shouldStore });
  const email = prompt("What is your email address?");
  if (!email) {
    console.error("No token provided");
    Deno.exit(1);
  }
  const a = await s.auth.signInWithOtp({ email });
  if (a.error) {
    console.error("Failed to send verification code", a.error.message);
    Deno.exit(1);
  }
  const magicToken = prompt(
    "Check your email and paste the verification code here:",
  );
  if (!magicToken) {
    console.error("No token provided");
    Deno.exit(1);
  }
  const sess = await verifyMagicLinkOrSignup(s, email, magicToken);
  if (sess.error) {
    console.error("Failed to log in", sess.error.message);
    return;
  }
  if (!shouldStore) {
    console.log(sess?.data.session?.access_token);
  }
}

async function verifyMagicLinkOrSignup(
  s: SupabaseClient,
  email: string,
  magicToken: string,
) {
  const sess = await s.auth.verifyOtp({
    type: "magiclink",
    email,
    token: magicToken,
  });

  if (!sess.error) {
    return sess;
  }

  // try to sign up
  const signupSess = await s.auth.verifyOtp({
    type: "signup",
    email,
    token: magicToken,
  });

  if (!signupSess.error && !isOrgCreationPromptSuppressed()) {
    await promptForOrgCreation(s);
  }

  return signupSess;
}

async function promptForOrgCreation(s: SupabaseClient) {
  const shouldCreateOrg = await prompt(
    "You don't belong to any organizations yet. You'll need one to create machines. Would you like to create one? (y/n)",
  );
  if (shouldCreateOrg?.toLowerCase() !== "y") {
    console.log("You can create a new org later with `smply orgs create`");
    return;
  }

  const orgName = await prompt("What would you like to call your org?");
  if (orgName) {
    const orgId = await doCreateOrg(s, orgName);
    console.log(
      "Created org. You can now create machines with `smply machines create`. Manage your org billing with `smply billing`",
    );
    console.log({ orgId });
  }
}

async function getLoggedInSupabaseClient(
  cmd: Command,
) {
  const s = getSupabaseClient({
    store: true,
    ...cmd.optsWithGlobals(),
  });
  const sess = await s.auth.getSession();
  if (!sess.data.session) {
    console.error("Could not find credentials. Log in or sign up.");
    await login({ store: true });
    const s = getSupabaseClient({
      store: true,
      ...cmd.optsWithGlobals(),
    });
    const session = await s.auth.getSession();
    if (!session.data.session) {
      console.error("Failed to log in");
      Deno.exit(1);
    }
    return s;
  }
  return s;
}

function getSmplyConfigDir() {
  return path.join(Deno.env.get("HOME") ?? ".", ".smply");
}

function getSupabaseClient(
  { accessToken, store }: { accessToken?: string; store?: boolean },
) {
  const projectRef = "wzmjedymhlqansmxtsmo";
  const expectedKey = `sb-${projectRef}-auth-token`;
  const tokenFile = path.join(
    getSmplyConfigDir(),
    "credentials",
  );

  return createClient(
    `https://${projectRef}.supabase.co`,
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bWplZHltaGxxYW5zbXh0c21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODY5MzExMTEsImV4cCI6MjAwMjUwNzExMX0.1DILVKbYW7lp_lKy5hHaKh9bHLe5bP1OhErCkjW2MJg",
    {
      auth: {
        storage: {
          getItem: async (key) => {
            if (key === expectedKey) {
              if (accessToken) {
                return JSON.stringify({ accessToken });
              }

              try {
                const item = await Deno.readTextFile(tokenFile);
                return item;
              } catch (e) {
                if (e instanceof Deno.errors.NotFound) {
                  return null;
                }
                throw e;
              }
            }
            return null;
          },
          removeItem: (_key) => {
            return;
          },
          setItem: async (key, value) => {
            if (key === expectedKey && store) {
              await Deno.mkdir(path.dirname(tokenFile), {
                recursive: true,
                mode: 0o700,
              });
              return Deno.writeTextFile(tokenFile, value, { mode: 0o600 });
            }
          },
        },
      },
    },
  );
}

function getApiURL(options: Command) {
  return options.optsWithGlobals().apiUrl ?? "https://api.statebacked.dev";
}

import * as zlib from "node:zlib";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { Command, InvalidArgumentError } from "commander";
import * as readline from "node:readline";
import {
  createClient,
  SupabaseClient as RawSupabaseClient,
} from "@supabase/supabase-js";
import { Database } from "./supabase.js";
import { StateBackedClient } from "@statebacked/client";
import { build } from "./build.js";

export type SupabaseClient = RawSupabaseClient<Database>;

export function writeObj(obj: any) {
  console.log(JSON.stringify(obj, null, 2));
}

export async function gzip(data: string) {
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

export async function prompt(q: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(q + " ", (res) => {
      rl.close();
      resolve(res);
    });
  });
}

export function getApiURL(options: Command) {
  return options.optsWithGlobals().apiUrl ?? "https://api.statebacked.dev";
}

export function defaultOrgFile() {
  return path.join(getSmplyConfigDir(), "default-org");
}

export async function getStatebackedClient(options: Command) {
  const apiHost = getApiURL(options);
  const s = await getLoggedInSupabaseClient(options);
  const accessToken = (await s.auth.getSession()).data?.session?.access_token;
  const orgId = await getEffectiveOrg(options);

  return new StateBackedClient(accessToken, { orgId, apiHost });
}

export async function getHeaders(options: Command) {
  const s = await getLoggedInSupabaseClient(options);
  const accessToken = (await s.auth.getSession()).data?.session?.access_token;
  const org = await getEffectiveOrg(options);

  return {
    authorization: `Bearer ${accessToken}`,
    ...(org ? { "x-statebacked-org-id": org } : {}),
  };
}

export async function getEffectiveOrg(options: Command) {
  const optsOrg = options.optsWithGlobals().org;
  if (optsOrg) {
    return optsOrg;
  }

  try {
    return await fs.readFile(defaultOrgFile(), { encoding: "utf8" });
  } catch (_) {
    return null;
  }
}

export function getSmplyConfigDir() {
  return path.join(process.env.HOME ?? ".", ".smply");
}

function toPrettyId(prefix: string, id: string | undefined) {
  return (
    id &&
    prefix +
      "_" +
      Buffer.from(id.replace(/[-]/g, ""), "hex").toString("base64url")
  );
}

export const toOrgId = toPrettyId.bind(null, "org");
export const toMachineVersionId = toPrettyId.bind(null, "ver");
export const toUserId = toPrettyId.bind(null, "usr");
export const toKeyId = toPrettyId.bind(null, "sbk");

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

export { whileSuppressingOrgCreationPrompt };

export async function login(opts: { store: boolean }) {
  const shouldStore = opts.store;
  const s = getSupabaseClient({ store: shouldStore });
  const email = await prompt("What is your email address?");
  if (!email) {
    console.error("No email provided");
    process.exit(1);
  }
  const signIn = await s.auth.signInWithOtp({ email });
  if (signIn.error) {
    console.error("Failed to send verification code", signIn.error.message);
    process.exit(1);
  }
  const magicToken = await prompt(
    "Check your email and paste the verification code here:",
  );
  if (!magicToken) {
    console.error("No token provided");
    process.exit(1);
  }
  const sess = await verifyMagicLinkOrSignup(s, email, magicToken);
  if (sess.error) {
    console.error("Failed to log in", sess.error.message);
    return;
  }

  if (shouldStore) {
    try {
      await fs.unlink(defaultOrgFile());
    } catch (e) {
      if (e.code !== "ENOENT") {
        console.error(
          `failed to remove default org file at '${defaultOrgFile()}'. remove manually to avoid errors.`,
          e.message,
        );
      }
    }
  }

  if (!isOrgCreationPromptSuppressed()) {
    await createOrgIfNecessary(s);
  }

  if (!shouldStore) {
    console.log(sess?.data.session?.access_token);
  }
}

async function createOrgIfNecessary(s: SupabaseClient) {
  const { count, error } = await s
    .from("orgs")
    .select(undefined, { count: "exact" });

  if (error) {
    console.error("failed to determine org membership", error.message);
    console.error(
      "run `smply orgs list` to see your orgs or `smply orgs create` to create one",
    );
    return;
  }

  if (count === 0) {
    await promptForOrgCreation(s);
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
    writeObj({ orgId });
  }
}

export async function doCreateOrg(s: SupabaseClient, orgName: string) {
  // we need to insert and then select because we don't have permission to see the org until we're a member of it, which happens via trigger
  const { error } = await s.from("orgs").insert({
    name: orgName,
  });
  if (error) {
    console.error(error.message);
    throw error;
  }

  const { data, error: err } = await s
    .from("orgs")
    .select("id")
    .filter("name", "eq", orgName)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (err) {
    console.error(err.message);
    throw err;
  }

  return toOrgId(data.id);
}

export type BuildOpts = {
  js?: string;
  node?: string;
  deno?: string;
};

export async function buildFromCommand(opts: BuildOpts) {
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

export async function getLoggedInSupabaseClient(cmd: Command) {
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
      process.exit(1);
    }
    return s;
  }
  return s;
}

export function getSupabaseClient({
  accessToken,
  store,
}: {
  accessToken?: string;
  store?: boolean;
}) {
  const projectRef = "wzmjedymhlqansmxtsmo";
  const expectedKey = `sb-${projectRef}-auth-token`;
  const tokenFile = path.join(getSmplyConfigDir(), "credentials");

  return createClient<Database>(
    `https://${projectRef}.supabase.co`,
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bWplZHltaGxxYW5zbXh0c21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODY5MzExMTEsImV4cCI6MjAwMjUwNzExMX0.1DILVKbYW7lp_lKy5hHaKh9bHLe5bP1OhErCkjW2MJg",
    {
      auth: {
        storage: {
          getItem: async (key: string) => {
            if (key === expectedKey) {
              if (accessToken) {
                return JSON.stringify({ accessToken });
              }

              try {
                const item = await fs.readFile(tokenFile, { encoding: "utf8" });
                return item;
              } catch (e) {
                if (e.code === "ENOENT") {
                  return null;
                }
                throw e;
              }
            }
            return null;
          },
          removeItem: (_key: string) => {
            return;
          },
          setItem: async (key: string, value: string) => {
            if (key === expectedKey && store) {
              await fs.mkdir(path.dirname(tokenFile), {
                recursive: true,
                mode: 0o700,
              });
              return fs.writeFile(tokenFile, value, {
                encoding: "utf8",
                mode: 0o600,
              });
            }
          },
        },
      },
    },
  );
}

export function singleton<T>(
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

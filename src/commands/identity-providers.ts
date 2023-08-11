import { Command, InvalidArgumentError } from "commander";
import { getStatebackedClient, prompt } from "../utils.js";

export function addIdentityProviderCommands(cmd: Command) {
  const idps = cmd
    .command("identity-providers")
    .description("Manage identity provider configurations for token exchange");

  idps
    .command("upsert")
    .description("Create or update an identity provider configuration")
    .option(
      "-a, --audience <audience>",
      "Audience for the identity provider (--audience and/or --issuer required)",
    )
    .option(
      "-i, --issuer <issuer>",
      "Issuer for the identity provider (--audience and/or --issuer required)",
    )
    .requiredOption(
      "-l, --algorithm <algorithm...>",
      "Allowed signing algorithms. One of HS256, HS384, HS512, PS256, PS384, PS512, RS256, RS384, RS512, ES256, ES384, ES512, or EdDSA. If specified multiple times, any of the specified algorithms are allowed.",
    )
    .requiredOption(
      "-m, --mapping <mapping>",
      "JSON object mapping identity provider claims to the set of claims available for token providers to add to State Backed tokens. The value of any object key that ends in '.$' will be treated as a JSON path expression indexing into the claims of the identity provider token. So { \"sub.$\" \"$.sub\" } will extract the sub claim from the identity provider token and name it 'sub'.",
    )
    .option(
      "-k, --key <key>",
      "The key to use to validate the identity provider token. --key is the exact utf8-encoded key to use. To specify a binary key, encode into base64 and pass to --base64-key (--key, --base64-key or --jwks-url required)",
    )
    .option(
      "-b, --base64-key <b64key>",
      "The base64-encoded key to use to validate the identity provider token. To specify a utf8 key, pass to --key (--key, --base64-key or --jwks-url required)",
    )
    .option(
      "-j, --jwks-url <jwksurl>",
      "The URL of the JWKS endpoint to use to validate the identity provider token (--key, --base64-key or --jwks-url required)",
    )
    .action(upsertIdentityProvider);

  idps
    .command("upsert-supabase")
    .description(
      "Create or update an identity provider configuration for Supabase",
    )
    .requiredOption("-p, --project <project>", "Supabase project ID")
    .requiredOption("-s, --secret <secret>", "Supabase JWT secret")
    .requiredOption(
      "-m, --mapping <mapping>",
      "JSON object mapping identity provider claims to the set of claims available for token providers to add to State Backed tokens. The value of any object key that ends in '.$' will be treated as a JSON path expression indexing into the claims of the identity provider token. So { \"sub.$\" \"$.sub\" } will extract the sub claim from the identity provider token and name it 'sub'.",
    )
    .action(upsertSupabaseIdentityProvider);

  idps
    .command("upsert-auth0")
    .description(
      "Create or update an identity provider configuration for Auth0",
    )
    .requiredOption("-d, --domain <domain>", "Auth0 application domain")
    .requiredOption(
      "-m, --mapping <mapping>",
      "JSON object mapping identity provider claims to the set of claims available for token providers to add to State Backed tokens. The value of any object key that ends in '.$' will be treated as a JSON path expression indexing into the claims of the identity provider token. So { \"sub.$\" \"$.sub\" } will extract the sub claim from the identity provider token and name it 'sub'.",
    )
    .action(upsertAuth0IdentityProvider);

  idps
    .command("upsert-cognito")
    .description(
      "Create or update an identity provider configuration for AWS Cognito",
    )
    .requiredOption(
      "-u, --user-pool-id <userPoolId>",
      "Cognito user pool ID (required)",
    )
    .requiredOption("-r, --region <region>", "Cognito region (required)")
    .requiredOption(
      "-m, --mapping <mapping>",
      "JSON object mapping identity provider claims to the set of claims available for token providers to add to State Backed tokens. The value of any object key that ends in '.$' will be treated as a JSON path expression indexing into the claims of the identity provider token. So { \"sub.$\" \"$.sub\" } will extract the sub claim from the identity provider token and name it 'sub'.",
    )
    .action(upsertCognitoIdentityProvider);

  idps
    .command("delete")
    .description("Delete an identity provider configuration")
    .option(
      "-a, --audience <audience>",
      "Audience for the identity provider. (--audience and/or --issuer required)",
    )
    .option(
      "-i, --issuer <issuer>",
      "Issuer for the identity provider. (--audience and/or --issuer required)",
    )
    .action(deleteIdentityProvider);
}

async function upsertCognitoIdentityProvider(
  opts: {
    userPoolId: string;
    region: string;
    mapping: string;
  },
  options: Command,
) {
  const domain = `https://cognito-idp.${opts.region}.amazonaws.com/${opts.userPoolId}`;

  return upsertIdentityProvider(
    {
      issuer: domain,
      algorithm: ["RS256"],
      jwksUrl: `${domain}/.well-known/jwks.json`,
      mapping: opts.mapping,
    },
    options,
  );
}

async function upsertAuth0IdentityProvider(
  opts: {
    domain: string;
    mapping: string;
  },
  options: Command,
) {
  const domain = new URL(opts.domain).hostname;

  return upsertIdentityProvider(
    {
      audience: `https://${domain}/api/v2/`,
      issuer: `https://${domain}/`,
      algorithm: ["RS256"],
      jwksUrl: `https://${domain}/.well-known/jwks.json`,
      mapping: opts.mapping,
    },
    options,
  );
}

async function upsertSupabaseIdentityProvider(
  opts: {
    project: string;
    secret: string;
    mapping: string;
  },
  options: Command,
) {
  return upsertIdentityProvider(
    {
      audience: "authenticated",
      issuer: `https://${opts.project}.supabase.co/auth/v1`,
      algorithm: ["HS256"],
      mapping: opts.mapping,
      key: opts.secret,
    },
    options,
  );
}

async function upsertIdentityProvider(
  opts: {
    audience?: string;
    issuer?: string;
    algorithm: string[];
    mapping: string;
    key?: string;
    base64Key?: string;
    jwksUrl?: string;
  },
  options: Command,
) {
  if (!opts.audience && !opts.issuer) {
    throw new InvalidArgumentError(
      "Must specify at least one of --audience and --issuer",
    );
  }

  const keysSpecified = [opts.key, opts.base64Key, opts.jwksUrl].filter(
    Boolean,
  ).length;
  if (keysSpecified !== 1) {
    throw new InvalidArgumentError(
      "Must specify exactly one of --key, --base64-key or --jwks-url",
    );
  }

  if ((opts.algorithm ?? []).length === 0) {
    throw new InvalidArgumentError(
      "--algorithm must be specified at least once",
    );
  }

  const allowedAlgs = new Set([
    "HS256",
    "HS384",
    "HS512",
    "PS256",
    "PS384",
    "PS512",
    "RS256",
    "RS384",
    "RS512",
    "ES256",
    "ES384",
    "ES512",
    "EdDSA",
  ]);
  const invalidAlgs = opts.algorithm.filter((a) => !allowedAlgs.has(a));
  if (invalidAlgs.length > 0) {
    throw new InvalidArgumentError(
      `Invalid algorithm(s) specified: ${invalidAlgs.join(", ")}`,
    );
  }

  const mapping = (() => {
    try {
      return JSON.parse(opts.mapping);
    } catch {
      throw new InvalidArgumentError("--mapping must be a valid JSON object");
    }
  })();

  const key = opts.key
    ? Buffer.from(opts.key, "utf8").toString("base64url")
    : opts.base64Key
    ? Buffer.from(opts.base64Key, "base64").toString("base64url")
    : undefined;

  const client = await getStatebackedClient(options);

  await client.identityProviders.upsert({
    algs: opts.algorithm as any,
    mapping,
    aud: opts.audience,
    iss: opts.issuer,
    jwksUrl: opts.jwksUrl,
    key,
  });

  console.log("Identity provider configuration updated");
}

async function deleteIdentityProvider(
  opts: {
    audience?: string;
    issuer?: string;
  },
  options: Command,
) {
  if (!opts.audience && !opts.issuer) {
    throw new InvalidArgumentError(
      "Must specify at least one of --audience and --issuer",
    );
  }

  const confirmation = await prompt(
    "Are you sure you want to delete this identity provider? (y/n) ",
  );
  if (confirmation.toLowerCase() !== "y") {
    console.log("Aborting");
    return;
  }

  const client = await getStatebackedClient(options);

  await client.identityProviders.delete({
    aud: opts.audience,
    iss: opts.issuer,
  });

  console.log("Identity provider configuration deleted");
}

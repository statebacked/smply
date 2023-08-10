import { Command } from "commander";
import {
  BuildOpts,
  buildFromCommand,
  getStatebackedClient,
  gzip,
  writeObj,
} from "../utils.js";

export function addMigrationsCommands(cmd: Command) {
  const migrations = cmd
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

import { Command, InvalidArgumentError } from "commander";
import { relativeTime } from "../relative-time.js";
import { LogEntry } from "@statebacked/client";
import { getStatebackedClient, writeObj } from "../utils.js";

export function addLogsCommands(cmd: Command) {
  const logs = cmd
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

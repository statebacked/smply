import { Command, InvalidArgumentError } from "commander";
import { getApiURL, getHeaders, writeObj } from "../utils.js";

export type UsageOptions = {
  start: string;
  end: string;
  machine?: string;
  version?: string;
  instance?: string;
};

const USAGE_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1000;

export function addUsageDateRangeOptions(cmd: Command, now = new Date()) {
  return cmd
    .option(
      "-s, --start <start>",
      "Start date (defaults to 24 hours ago)",
      new Date(now.getTime() - USAGE_WINDOW_MILLISECONDS).toISOString(),
    )
    .option("-e, --end <end>", "End date (defaults to now)", now.toISOString());
}

export function addUsageCommand(cmd: Command) {
  addUsageDateRangeOptions(
    cmd.command("usage").description("Get organization-wide usage counts"),
  ).action(getUsage);
}

export async function getUsage(opts: UsageOptions, options: Command) {
  if (opts.instance && !opts.machine) {
    throw new InvalidArgumentError("instance requires machine");
  }

  const url = usageUrl(getApiURL(options), opts);
  const res = await fetch(url, {
    method: "GET",
    headers: await getHeaders(options),
  });

  if (!res.ok) {
    throw new Error(`failed to get usage (${res.status}): ${await res.text()}`);
  }

  writeObj(await res.json());
}

function usageUrl(apiUrl: string, opts: UsageOptions) {
  const url = new URL("/usage/counts", apiUrl);

  url.searchParams.set("start", opts.start);
  url.searchParams.set("end", opts.end);

  if (opts.machine) {
    url.searchParams.set("machineSlug", opts.machine);
  }

  if (opts.version) {
    url.searchParams.set("machineVersionId", opts.version);
  }

  if (opts.instance) {
    url.searchParams.set("instanceSlug", opts.instance);
  }

  return url;
}

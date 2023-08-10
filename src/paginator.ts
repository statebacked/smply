import { Command } from "commander";
import { prompt, writeObj } from "./utils.js";

export async function paginate<T>(
  opts: PaginationOptions,
  getItems: (opts: { from: number; to: number }) => Promise<Array<T>>,
) {
  const pageSize = opts.count ? parseInt(opts.count, 10) : 20;
  let from = opts.offset ? parseInt(opts.offset, 10) : 0;
  let to = pageSize - 1;
  const shouldPaginate = process.stdout.isTTY;
  let more = true;
  while (more) {
    const page = await getItems({ from, to });
    writeObj(page);

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

export function withPaginationOptions(cmd: Command) {
  return cmd
    .option("-n, --count <count>", "Number of items to retrieve", "20")
    .option("-o, --offset <offset>", "Offset to start listing from", "0")
    .option(
      "-d, --descending",
      "Sort in descending order by creation date (default: sort in ascending order by creation date)",
      false,
    );
}

export function getSortOpts(opts: PaginationOptions) {
  return {
    ascending: !opts.descending,
  };
}

export type PaginationOptions = {
  count?: string;
  offset?: string;
  descending?: boolean;
};

import { Command } from "commander";
import { prompt, writeObj } from "./utils.js";

export async function paginateWithCursor<T extends { cursor?: string }>(
  getPage: (cursor?: string) => Promise<T>,
  getItems: (page: T) => Array<any>,
) {
  const shouldPaginate = process.stdout.isTTY;
  let cursor: string | undefined;
  do {
    const page = await getPage(cursor);

    cursor = page.cursor;
    writeObj(getItems(page));

    if (cursor && shouldPaginate) {
      const quit = await prompt("Press enter for more (q + Enter to quit)...");
      if (quit === "q") {
        return;
      }
    }
  } while (cursor);
}

export function withPaginationOptions(cmd: Command) {
  return cmd.option("-c, --cursor <cursor>", "Pagination cursor");
}

export type PaginationOptions = {
  cursor?: string;
};

#!/bin/bash -e

cmd="deno fmt ./mod.ts ./supabase.ts ./scripts"

if [ "$1" = "--no-docker" ]; then
  exec ${cmd}
fi

exec docker run --rm -it -u "${UID}:${UID}" -v "$(pwd)/deno_dir:/home/deno/deno_dir" -v "$(pwd):/home/deno/code" -e "DENO_DIR=/home/deno/deno_dir" -e "HOME=/home/deno" -v "${HOME}/.smply:/home/deno/.smply" --workdir /home/deno/code denoland/deno:ubuntu-1.34.3 ${cmd}

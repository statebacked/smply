#!/bin/bash -e

exec docker run --rm -it -u "${UID}:${UID}" -v "$(pwd)/deno_dir:/home/deno/deno_dir" -v "$(pwd):/home/deno/code" -e "DENO_DIR=/home/deno/deno_dir" -e "HOME=/home/deno" -v "${HOME}/.smply:/home/deno/.smply" -v "$(pwd)/cache:/home/deno/.cache" --workdir /home/deno/code denoland/deno:ubuntu-1.34.3 run --allow-env --allow-read --allow-write --allow-net --allow-run ./mod.ts "$@"

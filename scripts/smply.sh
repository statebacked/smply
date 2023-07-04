#!/bin/bash -e

exec docker run --rm -it -u "${UID}:${UID}" -v "$(pwd)/deno_dir:/home/deno/deno_dir" -v "$(pwd):/home/deno/code:ro" -e "DENO_DIR=/home/deno/deno_dir" -e "HOME=/home/deno" -v "${HOME}/.smply:/home/deno/.smply" --workdir /home/deno/code denoland/deno:ubuntu-1.34.3 run --allow-env=HOME --allow-read --allow-write=/home/deno/.smply --allow-net=wzmjedymhlqansmxtsmo.supabase.co,api.statebacked.dev ./mod.ts "$@"

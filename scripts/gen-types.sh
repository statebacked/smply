#!/bin/bash

homedir="$(mktemp -d)"

function cleanup {
  rm -rf "${homedir}"
}

trap cleanup EXIT

exec docker run --rm -v "$(pwd):/work" -v "${homedir}:/me" -v "/etc/ssl/certs:/etc/ssl/certs:ro" -v "${HOME}/.supabase:/me/.supabase" -e "HOME=/me" --user ${UID} --entrypoint=npx --workdir=/work node:16.17-buster-slim supabase gen types typescript --project-id wzmjedymhlqansmxtsmo --schema public 1> ./supabase.ts

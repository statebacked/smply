#!/bin/bash -e

homedir="$(mktemp -d)"

function cleanup {
  rm -rf "${homedir}"
}

trap cleanup EXIT

exec docker run --rm -it -p 3000:3000 -v "$(pwd):/work" -v "${homedir}:/me" -e "HOME=/me" --user ${UID} --entrypoint=npm --workdir=/work node:16.17-buster-slim "$@"

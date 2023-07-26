#!/bin/bash -e

homedir="$(mktemp -d)"

function cleanup {
  rm -rf "${homedir}"
}

trap cleanup EXIT

exec docker run --rm -it -v "$(pwd):/work" -v "${homedir}:/me" -e "HOME=/me" --user ${UID} --entrypoint=npm --workdir=/work node:16.17-buster-slim "$@"

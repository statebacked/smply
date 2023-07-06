#!/bin/bash -e

homedir="$(mktemp -d)"

function cleanup {
  rm -rf "${homedir}"
}

trap cleanup EXIT

exec docker run --rm -it -u "${UID}:${UID}" -v "$(pwd):/work" -v "${homedir}:/me" -e "HOME=/me" -v "${HOME}/.smply:/me/.smply" --workdir /work node:16.17-buster-slim node ./dist/index.js "$@"

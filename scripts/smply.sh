#!/bin/bash -e

homedir="$(mktemp -d)"

function cleanup {
  rm -rf "${homedir}"
}

trap cleanup EXIT

script_dir=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

exec docker run --rm -it -u "${UID}:${UID}" -v "$(pwd):/work" -v "${script_dir}/..:/smply" -v "${homedir}:/me" -e "HOME=/me" -v "${HOME}/.smply:/me/.smply" --workdir /work node:18.17-buster-slim node "/smply/dist/index.js" "$@"

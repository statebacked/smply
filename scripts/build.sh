#!/bin/bash -e

cmd="run --allow-env --allow-net=deno.land,registry.npmjs.org --allow-run --allow-read --allow-write=npm,/home/${USER}/.cache/esbuild ./scripts/build.ts"

docker='1'

if [ "$1" = "--no-docker" ]; then
    shift
    docker='0'
fi

if [ -z "$1" ]; then
    echo "Usage: $0 <version>"
    exit 1
fi

if [ "$docker" = "0" ]; then
    exec deno $cmd "$@"
fi

tag="statebacked-build:1"
image="$(docker images --filter "reference=${tag}" --format "{{.ID}}")"

if [ -z "${image}" ]; then
    docker build -t "${tag}" - <<EOF
FROM node:16.17-buster-slim
RUN useradd --base-dir /home --home-dir /home/${USER} --uid ${UID} ${USER} \
    && mkdir -p /home/${USER} && chown ${USER}:${USER} /home/${USER}
RUN apt-get update && \
    apt-get install --yes curl unzip && \
    rm -rf /var/lib/apt/lists/* && \
    curl -fsSL https://deno.land/x/install/install.sh | sh && \
    chmod -R 777 /root
EOF

    image="$(docker images --filter "reference=${tag}" --format "{{.ID}}")"

fi

exec docker run --rm -e "DENO_DIR=/home/${USER}/deno_dir" -v "$(pwd)/deno_dir:/home/${USER}/deno_dir" -v "$(pwd):/home/${USER}/code" --workdir="/home/${USER}/code" --user "${USER}" --entrypoint=/root/.deno/bin/deno ${tag} $cmd
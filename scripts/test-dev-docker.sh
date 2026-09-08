#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${ENV_FILE:-${repo_root}/.env}"
image_tag="${IMAGE_TAG:-yazio-mcp-dev:local}"

if ! command -v docker >/dev/null 2>&1; then
  printf 'docker is required but was not found in PATH.\n' >&2
  exit 127
fi

if [[ ! -f "${env_file}" ]]; then
  printf 'Environment file not found: %s\n' "${env_file}" >&2
  printf 'Create it with: cp .env.example .env\n' >&2
  exit 1
fi

if [[ "$#" -ne 0 ]]; then
  printf 'This tunnel-backed container does not accept a replacement command.\n' >&2
  printf 'Use bun test for local unit tests, or run the default script with no arguments.\n' >&2
  exit 2
fi

printf 'Building the tunnel-enabled YAZIO MCP image as %s.\n' "${image_tag}"
docker build --tag "${image_tag}" "${repo_root}"
printf 'Starting temporary tunnel-backed dev container.\n'
printf 'Press Ctrl-C to stop it; Docker will remove the container automatically.\n'

docker_args=(
  --rm
  --init
  --interactive
  --name "yazio-mcp-dev-$$"
  --env-file "${env_file}"
)

exec docker run "${docker_args[@]}" "${image_tag}"

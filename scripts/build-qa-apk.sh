#!/usr/bin/env sh
set -eu
# The helper scopes test-tool variables to the Gradle child process.
exec node "$(dirname "$0")/build-qa-apk.cjs"

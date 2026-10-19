$ErrorActionPreference = 'Stop'
# Environment overrides are scoped to the Gradle child process in the helper.
& node (Join-Path $PSScriptRoot 'build-qa-apk.cjs')
exit $LASTEXITCODE

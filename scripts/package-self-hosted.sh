#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
private_key=${FINITE_CRX_PRIVATE_KEY:-"$HOME/.config/finite/finite-extension.pem"}
update_base_url=${FINITE_UPDATE_BASE_URL:-"https://api.vckry.com/finite-updates"}
browser_binary=${CHROMIUM_BINARY:-"/Applications/Helium.app/Contents/MacOS/Helium"}

if [ ! -f "$private_key" ]; then
	printf 'Finite signing key not found: %s\n' "$private_key" >&2
	exit 1
fi

if [ ! -x "$browser_binary" ]; then
	printf 'Chromium-compatible browser not found: %s\n' "$browser_binary" >&2
	printf 'Set CHROMIUM_BINARY to a browser that supports --pack-extension.\n' >&2
	exit 1
fi

version=$(bun -e "console.log(require('$project_dir/package.json').version)")
public_key=$(openssl rsa -in "$private_key" -pubout -outform DER 2>/dev/null | base64 | tr -d '\n')
manifest_key=$(bun -e "console.log(require('$project_dir/build/manifest.json').key)")

if [ "$public_key" != "$manifest_key" ]; then
	printf 'The signing key does not match the public key in manifest.json.\n' >&2
	exit 1
fi

profile_dir=$(mktemp -d "${TMPDIR:-/tmp}/finite-pack.XXXXXX")
trap 'rm -rf "$profile_dir"' EXIT INT TERM
rm -f "$project_dir/build.crx"

"$browser_binary" \
	--user-data-dir="$profile_dir" \
	--no-first-run \
	--disable-default-apps \
	--pack-extension="$project_dir/build" \
	--pack-extension-key="$private_key"

if [ ! -f "$project_dir/build.crx" ]; then
	printf 'The browser did not create build.crx.\n' >&2
	exit 1
fi

release_dir="$project_dir/dist/self-hosted"
mkdir -p "$release_dir"
mv "$project_dir/build.crx" "$release_dir/finite.crx"

extension_id=$(python3 - "$private_key" <<'PY'
import hashlib
import subprocess
import sys

der = subprocess.check_output([
    "openssl", "rsa", "-in", sys.argv[1], "-pubout", "-outform", "DER"
], stderr=subprocess.DEVNULL)
digest = hashlib.sha256(der).digest()[:16]
print("".join(chr(97 + nibble) for byte in digest for nibble in (byte >> 4, byte & 15)))
PY
)

cat > "$release_dir/updates.xml" <<EOF
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='$extension_id'>
    <updatecheck codebase='$update_base_url/finite.crx' version='$version' />
  </app>
</gupdate>
EOF

cat > "$release_dir/release.json" <<EOF
{
  "extensionId": "$extension_id",
  "version": "$version",
  "updateUrl": "$update_base_url/updates.xml"
}
EOF

printf 'Packaged Finite %s (%s) in %s\n' "$version" "$extension_id" "$release_dir"

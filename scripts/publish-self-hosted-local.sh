#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
release_dir="$project_dir/dist/self-hosted"
publish_dir=${FINITE_UPDATE_PUBLISH_DIR:-/srv/containers/vckry-prod/volumes/finite-updates}

for file in finite.crx updates.xml release.json; do
	if [ ! -f "$release_dir/$file" ]; then
		printf 'Missing release artifact: %s\n' "$release_dir/$file" >&2
		exit 1
	fi
done

install -d -m 0755 "$publish_dir"
staging_dir=$(mktemp -d "$publish_dir/.finite-release.XXXXXX")
trap 'rm -rf "$staging_dir"' EXIT INT TERM

install -m 0644 "$release_dir/finite.crx" "$staging_dir/finite.crx"
install -m 0644 "$release_dir/release.json" "$staging_dir/release.json"
install -m 0644 "$release_dir/updates.xml" "$staging_dir/updates.xml"

mv -f "$staging_dir/finite.crx" "$publish_dir/finite.crx"
mv -f "$staging_dir/release.json" "$publish_dir/release.json"
mv -f "$staging_dir/updates.xml" "$publish_dir/updates.xml"
rmdir "$staging_dir"
trap - EXIT INT TERM

printf 'Published Finite updates to %s\n' "$publish_dir"


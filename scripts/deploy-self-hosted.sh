#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
release_dir="$project_dir/dist/self-hosted"
remote_host=${FINITE_UPDATE_HOST:-Zenithar}
remote_dir=${FINITE_UPDATE_REMOTE_DIR:-/srv/containers/vckry-prod/volumes/finite-updates}

for file in finite.crx updates.xml release.json; do
	if [ ! -f "$release_dir/$file" ]; then
		printf 'Missing release artifact: %s\n' "$release_dir/$file" >&2
		exit 1
	fi
done

ssh "$remote_host" "sudo install -d -o pvckry -g pvckry -m 0755 '$remote_dir'"
rsync -av --delete "$release_dir/" "$remote_host:$remote_dir/"
ssh "$remote_host" "chmod 0644 '$remote_dir'/finite.crx '$remote_dir'/updates.xml '$remote_dir'/release.json"

printf 'Published Finite updates to %s:%s\n' "$remote_host" "$remote_dir"

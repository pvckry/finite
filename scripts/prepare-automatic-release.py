#!/usr/bin/env python3
"""Choose a Chrome-compatible version newer than the hosted Finite release."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen


MAX_COMPONENT = 65535


def parse_version(value: str) -> tuple[int, int, int, int]:
	parts = value.split(".")
	if not 1 <= len(parts) <= 4 or any(not part.isdigit() for part in parts):
		raise ValueError(f"Invalid Chrome extension version: {value}")

	numbers = [int(part) for part in parts]
	if any(number > MAX_COMPONENT for number in numbers):
		raise ValueError(f"Chrome extension version component exceeds {MAX_COMPONENT}: {value}")

	return tuple(numbers + [0] * (4 - len(numbers)))


def next_patch(value: str) -> str:
	major, minor, patch, _ = parse_version(value)
	if patch < MAX_COMPONENT:
		return f"{major}.{minor}.{patch + 1}"
	if minor < MAX_COMPONENT:
		return f"{major}.{minor + 1}.0"
	if major < MAX_COMPONENT:
		return f"{major + 1}.0.0"
	raise ValueError("Finite has exhausted Chrome's extension version range")


def main() -> None:
	parser = argparse.ArgumentParser()
	parser.add_argument("--package", type=Path, default=Path("package.json"))
	parser.add_argument(
		"--release-url",
		default="https://api.vckry.com/finite-updates/release.json",
	)
	parser.add_argument("--hosted-version")
	args = parser.parse_args()

	package = json.loads(args.package.read_text())
	current_version = package["version"]
	parse_version(current_version)

	if args.hosted_version:
		hosted_version = args.hosted_version
	else:
		request = Request(
			args.release_url,
			headers={"User-Agent": "Finite release publisher/1.0"},
		)
		with urlopen(request, timeout=15) as response:
			hosted_version = json.load(response)["version"]
	parse_version(hosted_version)

	release_version = current_version
	if parse_version(current_version) <= parse_version(hosted_version):
		release_version = next_patch(hosted_version)
		package["version"] = release_version
		args.package.write_text(json.dumps(package, indent=2) + "\n")

	print(release_version)


if __name__ == "__main__":
	main()

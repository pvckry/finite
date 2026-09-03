.PHONY: build clean install dev

PACKAGE_VERSION=$(shell bun -e "console.log(require('./package.json').version)")
GITREV=$(shell git rev-parse --short HEAD)

build: install
	rm -rf build
	bun run src/dev/build.ts
	mkdir -p dist
	(cd build && zip -r ../dist/Finite_v$(PACKAGE_VERSION)-$(GITREV).zip .)

dev: install
	bun run src/dev/build.ts --watch

install:
	bun install

clean:
	rm -rf dist
	rm -rf build
	rm -rf node_modules

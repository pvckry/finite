.PHONY: build clean install dev

# The current git tag is used as the version number
GITTAG=$(shell git describe --always --tag)

build: install
	rm -rf build
	bun run src/dev/build.ts
	mkdir -p dist
	(cd build && zip -r ../dist/Finite_$(GITTAG).zip .)

dev: install
	bun run src/dev/build.ts --watch

install:
	bun install

clean:
	rm -rf dist
	rm -rf build
	rm -rf node_modules

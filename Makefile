.PHONY: build clean deploy-self-hosted install package-self-hosted publish-self-hosted-local dev

PACKAGE_VERSION=$(shell bun -e "console.log(require('./package.json').version)")
GITREV=$(shell git rev-parse --short HEAD)

build: install
	rm -rf build
	bun run src/dev/build.ts
	mkdir -p dist
	(cd build && zip -r ../dist/Finite_v$(PACKAGE_VERSION)-$(GITREV).zip .)

package-self-hosted: build
	./scripts/package-self-hosted.sh

deploy-self-hosted: package-self-hosted
	./scripts/deploy-self-hosted.sh

publish-self-hosted-local: package-self-hosted
	./scripts/publish-self-hosted-local.sh

dev: install
	bun run src/dev/build.ts --watch

install:
	bun install

clean:
	rm -rf dist
	rm -rf build
	rm -rf node_modules

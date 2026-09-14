.PHONY: build test lint wasm

build:
	cargo build --release -p greedy-rs

test:
	cargo test --workspace

lint:
	cargo clippy --workspace --all-targets -- -D warnings
	cargo fmt --all --check

wasm:
	cd ../.. && pnpm --filter @neurodesk/greedy build:wasm

MACOS_SIGN_IDENTITY ?= $(shell security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -1)
MACOS_INSTALLER_IDENTITY ?= $(shell security find-identity -v | sed -n 's/.*"\(Developer ID Installer: [^"]*\)".*/\1/p' | head -1)

.PHONY: macos-pkg-adhoc macos-release
macos-pkg-adhoc: build
	MACOS_SIGN_IDENTITY=- ../../scripts/package-greedy-macos.sh

macos-release: test build
	@test -n "$(MACOS_SIGN_IDENTITY)" && test -n "$(MACOS_INSTALLER_IDENTITY)"
	MACOS_SIGN_IDENTITY="$(MACOS_SIGN_IDENTITY)" MACOS_INSTALLER_IDENTITY="$(MACOS_INSTALLER_IDENTITY)" NOTARY_PROFILE="$(NOTARY_PROFILE)" ../../scripts/package-greedy-macos.sh

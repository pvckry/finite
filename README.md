# Finite

A Chrome extension that makes infinite feeds finite. It removes distracting algorithmic content while keeping the useful parts of the sites you visit.

Source: [github.com/pvckry/finite](https://github.com/pvckry/finite)

Finite is based on News Feed Eradicator v3. It can be loaded unpacked for development or installed from its private self-hosted release channel for automatic updates in Helium.

## Included blockers

- Facebook
- Instagram, with separate toggles for Stories, two kinds of suggested home content, suggested accounts, Explore, the Reels feed, and Reels navigation
- YouTube, with cinema mode on by default and separate toggles for the main feed, recommendations, comments, and Shorts
- Reddit
- Twitter/X
- LinkedIn
- Threads

Instagram Stories remain visible by default, while suggested posts are detected independently of followed-account posts. Media inside blocked Instagram suggestions, Instagram Reels, and YouTube Shorts is paused and muted.

Twitter/X includes independent controls for the For you and Following timelines, defaults to Following, and can remove promoted posts, the right sidebar, suggestion modules, engagement counts, Explore navigation, Grok, and Premium promotions.

## Privacy

Finite does not include third-party analytics or telemetry. Preferences, snooze state, and 90 days of daily per-site usage totals are stored locally by Chrome. When optional private browser sync is paired, privacy-safe activity spans and intervention events are queued locally until acknowledged, then retained on the account owner's vckry server alongside aggregate totals, limits, settings, and snooze outcomes.

Raw events contain only timestamps, the Finite site/category and stable surface identifier, snooze state, event reason, browser installation, version, and local time-zone context. They never contain exact URLs, page titles, searches, account names, posts, messages, or page content. A visit is a foreground entry, a session starts after 30 minutes away, and time is counted only while the page is visible and focused. Incognito browsing is not recorded.

## Build and install

Requirements:

- [Bun](https://bun.com/)
- make

Build once:

    make build

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the generated `build` directory.

For development with automatic rebuilds:

    make dev

## Self-hosted Helium releases

Finite has a stable extension identity and a private update channel hosted on Zenithar at `https://api.vckry.com/finite-updates/`. The first packaged install creates the automatic-update relationship; later releases retain the same identity and settings when they are signed with the same private key.

Install it once in each Helium profile on macOS or Windows:

1. Open `chrome://flags/#extension-mime-request-handling`.
2. Set **Extension MIME Request Handling** to **Always prompt for install**, then relaunch Helium.
3. Open `https://api.vckry.com/finite-updates/finite.crx` and approve the installation.

Helium then checks the embedded update URL and installs later signed releases automatically.

The signing key is kept outside this repository at `~/.config/finite/finite-extension.pem` on the Mac and `/home/pvckry/finite-secrets/finite-extension.pem` on Zenithar. Both copies are readable only by `pvckry`. Keep a separate secure backup: losing every copy prevents future packages from updating existing installations.

To build a signed CRX and its update manifest:

    make package-self-hosted

To build and publish the release to Zenithar:

    make deploy-self-hosted

The deployment script uploads only the signed CRX and public update metadata. It never uploads the private signing key.

Pushes to `main` that change the extension automatically run the self-hosted GitHub Actions runner on Zenithar. The workflow tests, signs, publishes, and verifies the release. When `package.json` does not already contain a newer version, it increments the patch version and records that bump on `main` before publishing.

The original project is Copyright Jordan West and contributors and remains licensed under AGPL-3.0-only.

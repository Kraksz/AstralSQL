# Installation

## Windows

Download the Windows beta from the Astral site. It supports Windows 10/11 x64 and
requires WebView2. The installer is unsigned; trusted publisher signing and
clean-machine install/upgrade/uninstall checks remain pending.

## Linux

Prebuilt Linux packages are not released or verified. To build on Debian/Ubuntu,
install Node.js 24, Rust, and the system libraries:

```sh
sudo apt update
sudo apt install build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libsecret-1-dev libdbus-1-dev pkg-config
git clone https://github.com/Kraksz/AstralSQL.git
cd AstralSQL
npm ci
npm run desktop:build -- --bundles deb,appimage
```

Artifacts are created under `target/release/bundle`. A working Secret Service
provider is required for credential storage. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux)
for other distributions. Test on each supported target distribution before release.

## macOS

No signed or notarized Mac download is available. On a Mac, install Xcode command
line tools, Node.js 24, and Rust, then:

```sh
xcode-select --install
git clone https://github.com/Kraksz/AstralSQL.git
cd AstralSQL
npm ci
npm run desktop:build -- --bundles dmg
```

The DMG is created under `target/release/bundle/dmg`. Local source builds still
need platform testing. Public distribution requires signing and notarization.

## iPhone and iPad

The website and handbook work on phones. No native iOS app or App Store download
exists. macOS apps cannot be installed on iOS.

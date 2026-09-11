# Third-party software

Astral SQL uses open-source libraries and bundled fonts. The MIT license at the
repository root covers Astral's own code, not a replacement for dependency terms.
Dependency versions are recorded in both npm lockfiles and Cargo.lock.

Major components include React, Three.js, CodeMirror, SQL.js, Lucide, Tauri,
SQLx, Tokio, and Vinext. Their original notices and license files are supplied
with the installed npm packages and Rust crates. Inter and JetBrains Mono are
distributed under the SIL Open Font License; preserve the font license files
when redistributing font assets.

Before distributing modified third-party sources or separately repackaged
libraries, review their installed LICENSE / COPYING files. The source repository
does not vendor dependency source code; `npm ci` and Cargo restore locked
dependencies with their original metadata.

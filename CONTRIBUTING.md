# Contributing to Astral SQL

Use Node.js 24 LTS, npm, and a stable Rust toolchain supporting Rust 1.88 or newer.
Follow the platform prerequisites linked in README.md. Run `npm ci`, then
`npm run dev` for the browser or `npm run desktop` for the native application.

Before proposing a change:

```sh
npm test
npm run build
npm run release:check
cargo fmt --all -- --check
cargo test --workspace --no-default-features --locked
```

For native changes also run `cargo check --workspace --all-targets --locked` after
building the frontend. For site changes run `npm run website:sync`, then
`npm ci` and `npm run build` inside `website/`.

Keep the aurora and connection guide source in `src/components/`; the sync
script copies those shared files into the website. Honor reduced-motion defaults
and the user's explicit animation preference. Avoid animating editor text or grid
rows during typing and selection.

Use only disposable databases for integration tests. `network_integration` creates
and drops tables in a database named `astral_test`. Never use a real customer or
production database. Document behavior changes, test results, and limitations in
your pull request. Do not include passwords, database dumps, connection history,
private hostnames, or screenshots containing private data.

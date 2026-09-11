# Source and contributing

Source: [Kraksz/AstralSQL](https://github.com/Kraksz/AstralSQL).

Install Node.js 24, Rust, and [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
git clone https://github.com/Kraksz/AstralSQL.git
cd AstralSQL
npm ci
npm test
npm run desktop
```

Use `npm run dev` for the browser SQLite workspace. For the site, build the root
frontend, run `npm run website:sync`, then install and run `website/` separately.

Read CONTRIBUTING.md and SECURITY.md in the repository root. Report bugs with
reproduction steps, OS, app version, engine, and a sanitized error. Do not include
passwords or private database content in issues.

## Publish this handbook with GitBook

The root `.gitbook.yaml` points to this Markdown handbook. In your GitBook
workspace, enable Git Sync, select this repository and branch, and import from GitHub.
Review the imported pages before publishing. This configuration does not create a
GitBook account or publish a GitBook-hosted URL automatically.

[GitBook Git Sync documentation](https://gitbook.com/docs/getting-started/git-sync).

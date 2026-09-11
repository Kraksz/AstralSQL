# Prepare a GitHub release

The source ZIP is a complete repository tree. Extract it into a new folder rather
than uploading the working directory, which may contain local databases or tools.
The archive omits local hosting identifiers, nested Git history, installers,
dependencies, caches, credentials, and test databases.

1. Create an empty GitHub repository with the visibility you intend. Extract the
   source ZIP and open its `astral-sql` folder in GitHub Desktop. Add it as a local
   repository, review the changed files, commit, and publish to your repository.
   With Git CLI, initialize a `main` branch, commit the source, then add the remote
   shown by your own empty GitHub repository and push `main`.
2. Enable private vulnerability reporting and dependency alerts in repository
   settings. Protect `main` and require the frontend and native checks to pass.
3. Let the included workflows run. They have not been verified on your GitHub
   account until an actual run completes. The database workflow uses disposable
   service containers; it never needs production secrets.
4. Run **Build Windows beta artifacts** manually from Actions, or push a version
   tag matching `package.json` (for example `v0.1.5`). Download the installer and
   SHA-256 checksum artifact. The workflow builds artifacts without publishing a
   release automatically.
5. Test installation, upgrade, launch, and uninstall on a clean Windows machine.
   Review `docs/release-checklist.md`. Create a GitHub prerelease, attach the
   installer and checksum file, and clearly label it as an unsigned beta until
   trusted publisher signing is configured.

GitHub hosts source and downloads; it does not automatically run this Vinext
website. Deploy `website/` through its existing Sites workflow or configure a
compatible Worker host separately. Never upload a Sites write credential or a
private `.openai/hosting.json` to GitHub.

The root license is MIT, matching the Rust package metadata. Dependencies and
bundled fonts retain their respective licenses; see `THIRD_PARTY_NOTICES.md`.

Linux and macOS packaging is available as the manually triggered **Build Linux and macOS beta artifacts** workflow. These artifacts remain unverified until target-platform testing completes. The Markdown handbook in `docs/handbook` is configured for GitBook Git Sync through `.gitbook.yaml`.

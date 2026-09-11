# Cloudflare hosting

The public Astral SQL website is hosted at https://sql.astralworks.xyz in the owner's Cloudflare account, using the `astral-sql` Worker and its custom domain. The existing Sites publication is separate.

## Deploy a website update

From `website/`, with the owner's Wrangler OAuth session authenticated:

```sh
npm ci
npx wrangler login
npm run deploy:cloudflare
```

Skip login when `npx wrangler whoami` already shows the correct account. Credentials stay in Wrangler's local credential storage; never commit them. The account ID and hostname in `scripts/prepare-cloudflare.mjs` are deployment identifiers, not credentials.

The deploy command builds the site, derives a separate Cloudflare configuration from Vite's generated output, and deploys to `sql.astralworks.xyz`. It preserves the generated server modules and static-asset settings. Direct workers.dev and preview URLs are disabled. No paid plan upgrade or application database service is needed by this deployment configuration.

For application updates, first refresh the playground and release downloads using the repository's existing release process. Website builds copy the current files in `public/`; they do not rebuild the Windows installer or regenerate the source archive.

## Custom domain

The domain must remain active in the same Cloudflare account. The Worker configuration uses `custom_domain: true`; Cloudflare manages the domain attachment, DNS record, and HTTPS certificate. Do not point a CNAME to the previous Sites URL for this deployment.

Verify after each deployment: `/`, `/docs`, `/docs/faq`, `/docs/connections`, `/playground/index.html`, and `/downloads/SHA256SUMS.txt`. Downloaded installer/source files should match their recorded SHA-256 hashes.

The initial deployment on September 11, 2026 uses Worker version `48dd6b41-ce32-4c75-9472-1dcef776d0dd`. DNS resolved and all listed HTTPS paths returned 200 after deployment.

This hosts the marketing website, documentation, downloads, and browser SQLite playground. Remote MySQL/MariaDB/PostgreSQL connections continue to run directly from the native desktop app; moving the website does not change a database server's firewall or account permissions.

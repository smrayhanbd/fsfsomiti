import type { NextConfig } from "next";
// @sentry/nextjs wraps the Next.js config to inject source-map upload + the
// Sentry server-runtime. The wrap is a no-op when SENTRY_DSN is unset (the
// SDK short-circuits), so this stays safe in dev / CI / preview.
import { withSentryConfig } from "@sentry/nextjs";
// next-intl plugin: wires the i18n/request.ts config into the Next.js server
// runtime so messages can be loaded per-request based on the locale cookie.
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 110mb so admins can upload software installers (.apk / .exe, capped
      // at 100 MB in lib/upload.ts) through the site-content server action.
      // Note: serverless platforms (e.g. Vercel) enforce their own lower
      // request-body limits — large installs are intended for self-hosted
      // (Docker) deployments.
      bodySizeLimit: '110mb',
    },
    // Tree-shake large barrel-file packages that are NOT already in Next's
    // default optimize list (lucide-react and date-fns are). recharts and
    // framer-motion otherwise drag big module graphs into every dashboard
    // client bundle, slowing load + navigation on admin pages.
    optimizePackageImports: ['recharts', 'framer-motion'],
  },

  // next.config.js

  allowedDevOrigins: ['192.168.0.100'],

  // nodemailer uses Node built-ins (net/tls/crypto); keep it out of the
  // Server Components / Route Handlers bundle so they resolve at runtime.
  //
  // pdfkit -> fontkit is built by Parcel against `@swc/helpers` whose
  // `applyDecoratedDescriptor` named export is mis-bundled by Turbopack and
  // ends up undefined at runtime, crashing any Server Action that imports
  // the receipt generator (see lib/pdf/moneyReceiptPdf.ts). Marking both as
  // server-external packages forces Next.js to `require()` them straight from
  // node_modules at runtime, bypassing the broken SWC helper path entirely.
  serverExternalPackages: ['nodemailer', 'resend', 'pdfkit', 'fontkit'],

  // Enable the standalone build output ONLY for Docker builds.
  //
  // Why conditional: Next.js 16 made Turbopack the default bundler. The
  // standalone tracing step looks for `.next/next-server.js.nft.json`
  // (a webpack-output artifact) — with Turbopack that file doesn't exist,
  // and the build fails with:
  //   ENOENT: no such file or directory, open '.next/next-server.js.nft.json'
  //
  // Vercel does NOT need `output: 'standalone'` — it has its own file
  // tracing + serverless bundling pipeline. Only Docker (self-hosted)
  // needs the standalone server.js bundle.
  //
  // The Dockerfile sets `DOCKER_BUILD=1` during the build stage; Vercel
  // never sets this env var, so on Vercel `output` is `undefined` and
  // the standalone tracing step is skipped entirely.
  output: process.env.DOCKER_BUILD === '1' ? 'standalone' : undefined,

  // NOTE (phase4-infra / Roadmap item 1): the previous
  //   typescript: { ignoreBuildErrors: true }
  //   eslint:     { ignoreDuringBuilds: true }
  // blocks have been REMOVED. TypeScript errors now FAIL the build — this is
  // the desired behaviour so type drift can't slip onto `main`. Run
  //   `npx tsc --noEmit`
  // locally before pushing if you want the same check without the full build.
};

// Sentry wrapper options. `silent: true` keeps the build log clean; the
// SDK reads SENTRY_DSN / SENTRY_AUTH_TOKEN from env at build time. When
// SENTRY_AUTH_TOKEN is missing the source-map upload is skipped silently.
//
// Note: Sentry v10 dropped BOTH `disableClientWebpackPlugin` and
// `disableServerWebpackPlugin` from `SentryBuildOptions`. The webpack/turbopack
// plugins are now always wired in but short-circuit themselves when no auth
// token is present (so local dev builds don't try to hit Sentry's API).
// Effectively the same behaviour as before, with a smaller surface area.
export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
});

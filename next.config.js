/** @type {import('next').NextConfig} */
const config = {
  // Next.js 14.x uses experimental.serverComponentsExternalPackages
  // (renamed to top-level serverExternalPackages in Next.js 15)
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
}

module.exports = config

import type { NextConfig } from 'next'

const config: NextConfig = {
  // pdf-parse is still used as a fallback for server-side PDF extraction
  serverExternalPackages: ['pdf-parse'],
}

export default config

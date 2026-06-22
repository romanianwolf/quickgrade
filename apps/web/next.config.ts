/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['@supabase/supabase-js', '@upstash/redis'],
}

export default nextConfig

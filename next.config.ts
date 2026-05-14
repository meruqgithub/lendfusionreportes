/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mssql', 'tedious'],
  eslint: {
    // Deshabilitar ESLint durante el build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Deshabilitar TypeScript durante el build
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
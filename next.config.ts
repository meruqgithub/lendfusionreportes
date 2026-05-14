/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mssql', 'tedious'],
  typescript: {
    // Deshabilitar TypeScript durante el build
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
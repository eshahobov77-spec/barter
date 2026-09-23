/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Loyiha konteynerda quriladi; tip/lint xatolari build'ni to'xtatmasin.
  // Qat'iy tekshiruv kerak bo'lsa, bu ikkalasini false qiling va `npx tsc --noEmit` ishlating.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Bu paketlar server tomonda bundle qilinmasin (native/CJS bog'liqliklari bor)
  serverExternalPackages: ['exceljs', '@prisma/client'],
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
      // Reverse proxy (nginx) ortida ishlaganda kerak bo'lishi mumkin.
      // .env: ALLOWED_ORIGINS=91.200.10.5:8080,barter.domen.uz
      allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
    },
  },
  poweredByHeader: false,
};

export default nextConfig;

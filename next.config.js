/** @type {import('next').NextConfig} */
module.exports = {
  poweredByHeader: false,
  async rewrites() {
    return { beforeFiles: [{ source: '/', destination: '/dashboard.html' }] };
  },
};

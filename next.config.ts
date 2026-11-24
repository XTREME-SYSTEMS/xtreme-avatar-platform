import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {source: '/sw.js', headers: [{key:'Cache-Control',value:'no-cache'}, {key:'Service-Worker-Allowed',value:'/'}]},
      {source: '/:path*', headers: [{key:'X-Content-Type-Options',value:'nosniff'}, {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'}]}
    ];
  }
};
export default withWorkflow(nextConfig);

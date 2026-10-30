import { isIP } from "node:net";
import { handler as storeApiHandler } from "../src/server/api.mjs";

export default {
  async fetch(request) {
    try {
      const requestUrl = new URL(request.url);
      const route = (requestUrl.searchParams.get("route") || "").replace(/^\/+/, "");
      const body = ["GET", "HEAD"].includes(request.method) ? null : await request.text();
      const headers = Object.fromEntries(request.headers.entries());
      // Vercel overwrites x-forwarded-for with the connecting client IP.
      const forwardedFor = request.headers.get("x-forwarded-for") || "";
      const candidateIp = forwardedFor.split(",")[0].trim();
      const ip = isIP(candidateIp) ? candidateIp : "unknown";

      const result = await storeApiHandler(
        {
          httpMethod: request.method,
          path: `/api/${route}`,
          headers,
          body,
          isBase64Encoded: false
        },
        { ip }
      );

      return new Response(
        result.statusCode === 204 || request.method === "HEAD" ? null : result.body,
        {
          status: result.statusCode,
          headers: result.headers
        }
      );
    } catch {
      return Response.json(
        { error: "Server error" },
        {
          status: 500,
          headers: {
            "cache-control": "no-store",
            "x-content-type-options": "nosniff"
          }
        }
      );
    }
  }
};
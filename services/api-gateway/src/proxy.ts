import { FastifyRequest, FastifyReply } from "fastify";
import * as http from "http";
import * as https from "https";
import { URL } from "url";

export function createProxyHandler(targetBaseUrl: string) {
  return async function proxyHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const targetUrl = new URL(req.url, targetBaseUrl);
    const isMultipart = (req.headers["content-type"] ?? "").includes("multipart/form-data");

    // For multipart: forward raw buffer. For JSON: re-serialize. Otherwise: no body.
    let bodyBuffer: Buffer | undefined;
    if (req.body instanceof Buffer) {
      bodyBuffer = req.body;
    } else if (req.body && !isMultipart) {
      bodyBuffer = Buffer.from(JSON.stringify(req.body), "utf-8");
    }

    const forwardHeaders: http.OutgoingHttpHeaders = {
      ...req.headers,
      host: targetUrl.host,
      "x-user-id": (req as any).user?.userId ?? "",
      "x-user-role": (req as any).user?.role ?? "",
      "x-cohort-id": (req as any).user?.cohortId ?? "",
      "x-request-id": req.id,
    };

    // Override content-type only for JSON bodies; keep original for multipart
    if (bodyBuffer && !isMultipart) {
      forwardHeaders["content-type"] = "application/json";
    }

    if (bodyBuffer) {
      forwardHeaders["content-length"] = bodyBuffer.byteLength.toString();
    } else {
      forwardHeaders["content-length"] = "0";
    }

    const options: http.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || 80,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: forwardHeaders,
    };

    const startedAt = Date.now();
    // Log the outbound proxy call BEFORE dispatch so a hang shows up as a
    // "proxy dispatched" without a matching "proxy completed" — makes it
    // possible to see stuck upstream calls in the log stream alone.
    req.log.info(
      { upstreamUrl: targetUrl.href, upstreamMethod: req.method },
      "proxy dispatched",
    );

    return new Promise((resolve) => {
      const protocol = targetUrl.protocol === "https:" ? https : http;

      const proxyReq = protocol.request(options, (proxyRes) => {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on("end", () => {
          const responseBody = Buffer.concat(chunks);
          const upstreamMs = Date.now() - startedAt;
          const upstreamStatus = proxyRes.statusCode ?? 502;
          req.log.info(
            { upstreamUrl: targetUrl.href, upstreamStatus, upstreamMs, upstreamBytes: responseBody.byteLength },
            "proxy completed",
          );
          reply
            .code(upstreamStatus)
            .headers(proxyRes.headers as Record<string, string>)
            .send(responseBody);
          resolve();
        });
      });

      proxyReq.on("error", (err) => {
        const upstreamMs = Date.now() - startedAt;
        req.log.error(
          { err, upstreamUrl: targetUrl.href, upstreamMs },
          "proxy failed",
        );
        reply.code(502).send({
          success: false,
          error: { code: "BAD_GATEWAY", message: "Upstream service unavailable" },
        });
        resolve();
      });

      if (bodyBuffer) proxyReq.write(bodyBuffer);
      proxyReq.end();
    });
  };
}

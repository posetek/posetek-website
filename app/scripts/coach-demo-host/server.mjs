import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./index.html", import.meta.url));
if (!page.includes('<meta name="posetek-report-kind" content="synthetic-coach-demo">')) {
  throw new Error("Expected the generated synthetic coach demo.");
}

if (!process.argv.includes("--check")) {
  const robots = Buffer.from("User-agent: *\nDisallow: /\n");
  const headers = {
    "Cache-Control": "no-cache",
    "Content-Security-Policy": "connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
  createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { ...headers, Allow: "GET, HEAD" }).end();
      return;
    }
    const pathname = req.url.split("?", 1)[0];
    const isPage = pathname === "/" || pathname === "/index.html";
    if (!isPage && pathname !== "/robots.txt") {
      res.writeHead(404, headers).end();
      return;
    }
    const bytes = isPage ? page : robots;
    res.writeHead(200, {
      ...headers,
      "Content-Type": isPage ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Length": bytes.length,
    }).end(req.method === "HEAD" ? undefined : bytes);
  }).listen(Number(process.env.PORT || 8080), "0.0.0.0");
}

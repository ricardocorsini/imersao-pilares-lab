import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2",
};
try { await stat(resolve(root, "index.html")); }
catch { console.error("dist/index.html não encontrado. Execute npm install e npm run build."); process.exit(1); }

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }); response.end(); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!path.startsWith(`${root}${sep}`)) { response.writeHead(403); response.end(); return; }
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": types[extname(path)] ?? "application/octet-stream",
      "Content-Length": body.length, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch { response.writeHead(404); response.end("Arquivo não encontrado."); }
});
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
server.listen(4173, "127.0.0.1", () => console.log("Laboratório v6: http://localhost:4173 — Ctrl+C para encerrar."));

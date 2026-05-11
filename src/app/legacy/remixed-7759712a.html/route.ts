import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const htmlPath = path.join(process.cwd(), "remixed-7759712a.html");
  const html = await readFile(htmlPath, "utf8");

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}


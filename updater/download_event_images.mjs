import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eventsPath = path.join(root, "events.json");
const outputDir = path.join(root, "assets", "events");
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36";
const extensionByType = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function shortcode(postUrl) {
  try {
    const parts = new URL(postUrl).pathname.split("/").filter(Boolean);
    return ["p", "reel", "tv"].includes(parts[0]) ? parts[1] : null;
  } catch {
    return null;
  }
}

async function existingImage(code) {
  for (const ext of extensionByType.values()) {
    const file = path.join(outputDir, `${code}.${ext}`);
    try {
      await fs.access(file);
      return `assets/events/${code}.${ext}`;
    } catch {}
  }
  return null;
}

async function downloadCover(postUrl) {
  const code = shortcode(postUrl);
  if (!code) throw new Error(`Unsupported Instagram URL: ${postUrl}`);
  const existing = await existingImage(code);
  if (existing) return existing;

  const mediaUrl = new URL(postUrl);
  mediaUrl.pathname = `${mediaUrl.pathname.replace(/\/?$/, "/")}media/`;
  mediaUrl.search = "?size=l";
  const response = await fetch(mediaUrl, {
    redirect: "follow",
    headers: { "user-agent": userAgent, "accept-language": "en-US,en;q=0.9" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].toLowerCase();
  const ext = extensionByType.get(contentType);
  if (!ext) throw new Error(`Unexpected content type: ${contentType || "missing"}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`Image response is too small (${bytes.length} bytes)`);

  const file = path.join(outputDir, `${code}.${ext}`);
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, file);
  return `assets/events/${code}.${ext}`;
}

const data = JSON.parse(await fs.readFile(eventsPath, "utf8"));
const events = Array.isArray(data.events) ? data.events : [];
const uniquePosts = [...new Set(events.map((event) => event.post_url).filter(Boolean))];
const resolved = new Map();
const failures = [];
let cursor = 0;

await fs.mkdir(outputDir, { recursive: true });
async function worker() {
  while (cursor < uniquePosts.length) {
    const postUrl = uniquePosts[cursor++];
    try {
      const localUrl = await downloadCover(postUrl);
      resolved.set(postUrl, localUrl);
      console.log(`saved ${localUrl}`);
    } catch (error) {
      failures.push({ postUrl, error: error.message });
      console.error(`failed ${postUrl}: ${error.message}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(4, uniquePosts.length) }, worker));

for (const event of events) {
  const localUrl = resolved.get(event.post_url);
  if (localUrl) event.image_url = localUrl;
}
await fs.writeFile(eventsPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

console.log(`\n${resolved.size}/${uniquePosts.length} post images saved; ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;

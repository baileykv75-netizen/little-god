const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const iconMatch = html.match(/<link\b[^>]*\brel=["']icon["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i);
assert.ok(iconMatch, "index.html must declare a favicon so browsers do not request missing /favicon.ico");
assert.ok(iconMatch[1].startsWith("data:image/svg+xml,"),
  "favicon must be embedded to avoid an extra network request and 404");

const references = [];
for (const match of html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)=["']([^"']+)["'][^>]*>/gi)) {
  const reference = match[1];
  if (reference.startsWith("data:") || reference.startsWith("http://") || reference.startsWith("https://")) continue;
  references.push(reference.split(/[?#]/, 1)[0]);
}

assert.ok(references.length > 0, "index.html should load local game assets");
for (const reference of references) {
  const assetPath = path.join(root, reference);
  assert.ok(fs.existsSync(assetPath), `Missing browser asset: ${reference}`);
  assert.ok(fs.statSync(assetPath).isFile(), `Browser asset is not a file: ${reference}`);
}

console.log(`static-assets.test: PASS (${references.length} local assets)`);

// Baut die Browser-Version als eine einzige index.html (für GitHub Pages).
// Aufruf: npm run build:web
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const wurzel = new URL("../", import.meta.url);
const pfad = (p: string) => new URL(p, wurzel).pathname;
const pkg = JSON.parse(readFileSync(pfad("package.json"), "utf8"));
const bestandDatei = process.argv[2] ?? "data/bestand-2026-11-02.json";
const bestand = readFileSync(pfad(bestandDatei), "utf8");
JSON.parse(bestand); // muss gültiges JSON sein

const stand = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" }).format(new Date());
const ergebnis = await build({
  entryPoints: [pfad("web/app/main.tsx")],
  bundle: true, minify: true, write: false, format: "iife", platform: "browser",
  target: ["chrome109", "edge109", "firefox115", "safari16"],
  jsx: "automatic", jsxImportSource: "preact",
  define: { __VERSION__: JSON.stringify(`v${pkg.version} · ${stand}`) },
  legalComments: "none", logLevel: "warning",
});
const js = ergebnis.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync(pfad("web/app/styles.css"), "utf8");
const daten = JSON.stringify(JSON.parse(bestand)).replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Klinkerhandel ERP</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 12"><rect width="7.5" height="3.5" fill="#c8161d"/><rect x="8.5" width="7.5" height="3.5" fill="#c8161d"/><rect y="4.25" width="3.5" height="3.5" fill="#c8161d"/><rect x="4.5" y="4.25" width="7" height="3.5" fill="#c8161d"/><rect x="12.5" y="4.25" width="3.5" height="3.5" fill="#c8161d"/><rect y="8.5" width="7.5" height="3.5" fill="#c8161d" opacity=".45"/><rect x="8.5" y="8.5" width="7.5" height="3.5" fill="#c8161d" opacity=".45"/></svg>')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<noscript>Das Klinkerhandel ERP benötigt JavaScript.</noscript>
<script type="application/json" id="shop-bestand">${daten}</script>
<script>${js}</script>
</body>
</html>
`;
writeFileSync(pfad("index.html"), html);
const kb = (n: number) => `${Math.round(n / 1024)} KB`;
console.log(`index.html geschrieben: ${kb(html.length)} (Programm ${kb(js.length)}, Shop-Daten ${kb(daten.length)}), SHA-256 ${createHash("sha256").update(html).digest("hex").slice(0, 12)}`);

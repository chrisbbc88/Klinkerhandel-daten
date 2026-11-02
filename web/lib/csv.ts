// CSV für Excel (deutsch): Semikolon, UTF-8 mit BOM, Dezimalkomma. Ohne Browser-Abhängigkeiten.

/** Zelle sicher schreiben: Formeln werden entschärft, Trennzeichen und Zeilenumbrüche maskiert. */
export function zelle(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? zahlText(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !(typeof v === "number")) s = "'" + s;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function zahlText(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return String(n).replace(".", ",");
}

export function csvText(kopf: string[], zeilen: unknown[][]): string {
  return "﻿" + [kopf, ...zeilen].map((z) => z.map(zelle).join(";")).join("\r\n") + "\r\n";
}

/** Liest CSV (Semikolon, Komma oder Tab, automatisch erkannt). Gibt Zeilen als Arrays zurück. */
export function csvLesen(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const ersteZeile = text.slice(0, text.search(/\r?\n|$/));
  const trenner = [";", "\t", ","].map((t) => [t, ersteZeile.split(t).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const zeilen: string[][] = [];
  let z: string[] = [], f = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else inQ = false; }
      else f += c;
    } else if (c === '"' && f === "") inQ = true;
    else if (c === trenner) { z.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      z.push(f); f = "";
      if (z.some((x) => x !== "")) zeilen.push(z);
      z = [];
    } else f += c;
  }
  z.push(f);
  if (z.some((x) => x !== "")) zeilen.push(z);
  // Entschärfungs-Apostroph aus unserem eigenen Export wieder entfernen
  return zeilen.map((r) => r.map((x) => (/^'[=+\-@]/.test(x) ? x.slice(1) : x)));
}

/** Deutsche oder englische Zahl lesen. "" → undefined, ungültig → NaN. */
export function zahlLesen(s: string): number | undefined {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return undefined;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^-?\d+(\.\d+)?$/.test(norm) ? Number(norm) : NaN;
}

export const LEEREN = "LEEREN";

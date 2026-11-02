// Einstieg: Rahmen mit Seitenleiste, Navigation, globale Dialoge.
import { render } from "preact";
import { useEffect, useState, useRef } from "preact/hooks";
import { z, useZ, starten, sichern, sicherungFaellig, geraetAendern, neuZeichnen } from "./store.ts";
import { ab, kontaktName } from "./abgeleitet.ts";
import { useRoute, Icon, Dialog, relZeit, geheZu } from "./ui.tsx";
import { Dashboard } from "./dashboard.tsx";
import { Bestand } from "./produkte.tsx";
import { ProduktDetail } from "./produkt.tsx";
import { Erfassen } from "./erfassen.tsx";
import { PreisPflege, HinweisListe, Referenzen, SteinCodes } from "./bereiche.tsx";
import { ImportExport } from "./importexport.tsx";
import { KontaktListe, KontaktDetail } from "./kontakte.tsx";
import { VorgangListe, NeuerVorgang, VorgangDetail } from "./vorgaenge.tsx";
import { Einstellungen } from "./einstellungen.tsx";
import { ImportDialog, SicherungsBanner } from "./sicherung.tsx";
import type { KontaktTyp } from "../lib/modell.ts";
import type { Bestand as ShopBestand } from "../../src/import/bestand.ts";

const BESTAND: ShopBestand = JSON.parse(document.getElementById("shop-bestand")!.textContent!);

function Seitenleiste({ route, offen, schliessen }: { route: string[]; offen: boolean; schliessen: () => void }) {
  const a = ab(), g = z.geraet;
  const [r0, r1] = route;
  const link = (href: string, aktiv: boolean, icon: string | null, text: string, zahl?: number, rot?: boolean) =>
    <a class={`sb-a ${aktiv ? "aktiv" : ""}`} href={`#/${href}`} onClick={schliessen} aria-current={aktiv ? "page" : undefined}>
      {icon && <Icon n={icon} />}{text}{zahl ? <span class={`zahl ${rot ? "rot" : ""}`}>{zahl}</span> : null}
    </a>;
  const produktSub = !r1 || /^\d+$/.test(r1) ? "bestand" : r1;
  const kontaktTyp = r1 === "k" ? a.kontakte.get(Number(route[2]))?.typ ?? "" : r1 ?? "";
  const gesichertOk = !sicherungFaellig() || (z.ordner === "erlaubt" && g.auto_an);
  return <aside class={`sb ${offen ? "offen" : ""}`} aria-label="Hauptnavigation">
    <a class="sb-brand" href="#/" onClick={schliessen}><span class="mark"><i /><i /><i /><i /><i /><i /><i /></span><span><b>Klinkerhandel</b><span>ERP · Testversion</span></span></a>
    <nav>
      {link("", !r0, "dashboard", "Dashboard")}
      <div class="sb-grp">
        {link("produkte", r0 === "produkte", "produkte", "Produkte")}
        {r0 === "produkte" && <div class="sb-sub">
          {link("produkte", produktSub === "bestand", null, "Bestand")}
          {link("produkte/neu", produktSub === "neu", null, "Produkt erfassen")}
          {link("produkte/preise", produktSub === "preise", null, "Preise")}
          {link("produkte/hinweise", produktSub === "hinweise", null, "Hinweise", a.hinweiseOffen)}
          {link("produkte/referenzen", produktSub === "referenzen", null, "Referenzen")}
          {link("produkte/export", produktSub === "export", null, "Import & Export", a.exportOffen)}
        </div>}
      </div>
      <div class="sb-grp">
        {link("kontakte", r0 === "kontakte", "kontakte", "Kontakte")}
        {r0 === "kontakte" && <div class="sb-sub">
          {link("kontakte/kunde", kontaktTyp === "kunde", null, "Kunden")}
          {link("kontakte/hersteller", kontaktTyp === "hersteller", null, "Hersteller")}
          {link("kontakte/lieferant", kontaktTyp === "lieferant", null, "Lieferanten")}
          {link("kontakte/partner", kontaktTyp === "partner", null, "Partner")}
        </div>}
      </div>
      <div class="sb-grp">{link("angebote", r0 === "angebote", "angebote", "Anfragen & Angebote", a.vorgaengeOffen)}</div>
      <div class="sb-grp">
        {link("einstellungen", r0 === "einstellungen", "einstellungen", "Einstellungen")}
        {r0 === "einstellungen" && <div class="sb-sub">
          {link("einstellungen/allgemein", !r1 || r1 === "allgemein", null, "Allgemein")}
          {link("einstellungen/sicherung", r1 === "sicherung", null, "Sicherung & Daten")}
          {link("einstellungen/stammdaten", r1 === "stammdaten", null, "Stammdaten")}
        </div>}
      </div>
    </nav>
    <div class="sb-fuss">
      <button onClick={() => geraetAendern({ bearbeiter: null })} title="Bearbeiter wechseln"><span class="wer" style={{ width: 20, height: 20, fontSize: 9, background: "var(--signal)" }}>{(g.bearbeiter ?? "?").slice(0, 2).toUpperCase()}</span>{g.bearbeiter ?? "Wer arbeitet?"}</button>
      <button onClick={() => sichern(false)} title="Jetzt sichern" disabled={z.sicherungLaeuft}>
        <span class={`punkt ${gesichertOk ? "ok" : z.ordner === "freigeben" ? "warn" : "warn"}`} />
        {z.sicherungLaeuft ? "Sichere…" : g.letzte_sicherung ? `Gesichert ${relZeit(g.letzte_sicherung)}` : "Noch nicht gesichert"}
      </button>
      {z.nurLesen && <span style={{ color: "#e0a531" }}>Nur lesen</span>}
    </div>
  </aside>;
}

function Palette({ schliessen }: { schliessen: () => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const d = z.daten;
  const t = q.trim().toLowerCase();
  const seiten = [["Dashboard", ""], ["Produktbestand", "produkte"], ["Produkt erfassen", "produkte/neu"], ["Preise", "produkte/preise"], ["Import & Export", "produkte/export"], ["Hinweise", "produkte/hinweise"],
    ["Referenzen", "produkte/referenzen"], ["Kunden", "kontakte/kunde"], ["Hersteller-Kontakte", "kontakte/hersteller"], ["Anfragen & Angebote", "angebote"], ["Neue Anfrage", "angebote/neu"], ["Sicherung", "einstellungen/sicherung"], ["Stammdaten", "einstellungen/stammdaten"]];
  const treffer: { text: string; typ: string; ziel: string }[] = !t ? seiten.map(([x, z2]) => ({ text: x, typ: "Seite", ziel: z2 })) : [
    ...seiten.filter(([x]) => x.toLowerCase().includes(t)).map(([x, z2]) => ({ text: x, typ: "Seite", ziel: z2 })),
    ...d.produkte.filter((p) => `${p.sku ?? ""} ${p.name}`.toLowerCase().includes(t)).slice(0, 12).map((p) => ({ text: `${p.sku ?? ""} ${p.sku ? "" : p.name}`.trim(), typ: p.art === "riemchen" ? "Riemchen" : "Produkt", ziel: `produkte/${p.id}` })),
    ...d.kontakte.filter((k) => `${kontaktName(k)} ${k.email} ${k.ort}`.toLowerCase().includes(t)).slice(0, 8).map((k) => ({ text: kontaktName(k), typ: "Kontakt", ziel: `kontakte/k/${k.id}` })),
    ...d.vorgaenge.filter((v) => `${v.nummer} ${v.betreff}`.toLowerCase().includes(t)).slice(0, 8).map((v) => ({ text: `${v.nummer} ${v.betreff}`, typ: "Vorgang", ziel: `angebote/${v.id}` })),
  ];
  const los = (x: { ziel: string } | undefined) => { if (x) { geheZu(x.ziel); schliessen(); } };
  return <div class="schleier" onMouseDown={(e) => { if (e.target === e.currentTarget) schliessen(); }}>
    <div class="dialog palette" role="dialog" aria-label="Suche">
      <input ref={ref} type="text" placeholder="Produkt, Kontakt, Angebot oder Seite suchen…" value={q}
        onInput={(e) => { setQ((e.target as HTMLInputElement).value); setI(0); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { setI(Math.min(i + 1, treffer.length - 1)); e.preventDefault(); } else if (e.key === "ArrowUp") { setI(Math.max(i - 1, 0)); e.preventDefault(); } else if (e.key === "Enter") los(treffer[i]); else if (e.key === "Escape") schliessen(); }} />
      <ul>{treffer.slice(0, 30).map((x, j) => <li class={j === i ? "an" : ""} onMouseEnter={() => setI(j)} onClick={() => los(x)}><span class={x.typ === "Seite" ? "" : "mono"}>{x.text}</span><span class="typ">{x.typ}</span></li>)}
        {!treffer.length && <li class="muted">Nichts gefunden.</li>}</ul>
    </div>
  </div>;
}

function BearbeiterWahl() {
  const namen = z.daten.einstellungen.bearbeiter;
  return <Dialog titel="Wer arbeitet an diesem Rechner?" onClose={() => { if (z.geraet.bearbeiter) neuZeichnen(); }}>
    <p class="muted" style={{ marginTop: 0 }}>Ihr Name wird bei jeder Änderung vermerkt und erscheint in Sicherungsdateien. Wechseln können Sie jederzeit unten in der Seitenleiste.</p>
    <div class="raster r3">{namen.map((n) => <button class="btn" style={{ justifyContent: "center", padding: 14 }} onClick={() => geraetAendern({ bearbeiter: n })}><span class="wer">{n.slice(0, 2).toUpperCase()}</span>{n}</button>)}</div>
  </Dialog>;
}

function Inhalt({ route }: { route: string[] }) {
  const [r0, r1, r2] = route;
  const key = location.hash;
  if (!r0) return <Dashboard />;
  if (r0 === "produkte") {
    if (!r1) return <Bestand key={key} />;
    if (r1 === "neu") return <Erfassen key={key} />;
    if (r1 === "preise") return <PreisPflege />;
    if (r1 === "hinweise") return <HinweisListe />;
    if (r1 === "referenzen") return <Referenzen />;
    if (r1 === "export") return <ImportExport />;
    return <ProduktDetail id={Number(r1)} reiter={r2} />;
  }
  if (r0 === "kontakte") {
    if (r1 === "k") return <KontaktDetail id={Number(r2)} />;
    return <KontaktListe key={r1 ?? ""} typ={(r1 ?? "") as KontaktTyp | ""} />;
  }
  if (r0 === "angebote") {
    if (!r1) return <VorgangListe key={key} />;
    if (r1 === "neu") return <NeuerVorgang key={key} />;
    return <VorgangDetail id={Number(r1)} druck={r2 === "druck"} />;
  }
  if (r0 === "einstellungen") return <Einstellungen sub={r1} bestand={BESTAND} />;
  return <p>Seite nicht gefunden. <a href="#/">Zum Dashboard</a></p>;
}

function App() {
  useZ();
  const route = useRoute();
  const [menue, setMenue] = useState(false);
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); } };
    addEventListener("keydown", f); return () => removeEventListener("keydown", f);
  }, []);
  useEffect(() => { scrollTo(0, 0); }, [route.join("/")]);

  if (z.startFehler) return <div class="inhalt"><div class="hinweisbox bad"><b>Das ERP konnte nicht starten:</b> {z.startFehler}. Ist der Browser im privaten Modus oder ist der Speicher blockiert?</div></div>;
  if (!z.bereit) return <div class="leer" style={{ paddingTop: "30vh" }}><b>Klinkerhandel ERP</b>wird geladen…</div>;

  return <div class="app">
    <Seitenleiste route={route} offen={menue} schliessen={() => setMenue(false)} />
    <div class="haupt">
      <header class="kopf">
        <button class="btn burger" onClick={() => setMenue(!menue)} aria-label="Menü"><Icon n="menue" /></button>
        <button class="suche-knopf" onClick={() => setPalette(true)}><Icon n="suche" />Suchen…<kbd>Strg K</kbd></button>
      </header>
      {z.nurLesen && <div class="hinweisbox warn banner"><Icon n="warnung" /><span>Das ERP ist bereits in einem anderen Tab oder Fenster geöffnet. Dieses Fenster ist nur zum Lesen – bitte im anderen Tab arbeiten.</span></div>}
      {z.speicherFehler && <div class="hinweisbox bad banner"><Icon n="warnung" /><span>{z.speicherFehler}</span><div class="knopfreihe"><button class="btn klein" onClick={() => sichern(false)}>Sicherung herunterladen</button></div></div>}
      <SicherungsBanner />
      <main class="inhalt" id="inhalt"><Inhalt route={route} /></main>
    </div>
    <SteinCodes />
    {!z.geraet.bearbeiter && <BearbeiterWahl />}
    {palette && <Palette schliessen={() => setPalette(false)} />}
    {z.importAngebot && <ImportDialog />}
    {z.frage && <Dialog titel={z.frage.titel} onClose={() => z.frage!.antwort(false)} fuss={<>
      <button class="btn" onClick={() => z.frage!.antwort(false)}>Abbrechen</button>
      <button class={`btn ${z.frage.gefahr ? "gefahr" : "primaer"}`} onClick={() => z.frage!.antwort(true)} autoFocus>{z.frage.ok}</button>
    </>}><p style={{ margin: 0 }}>{z.frage.text}</p></Dialog>}
    <div class="meldungen" role="status" aria-live="polite">{z.meldungen.map((m) => <div class={`meldung ${m.art}`}>{m.text}</div>)}</div>
    {menue && <div class="schleier" style={{ zIndex: 35 }} onClick={() => setMenue(false)} />}
  </div>;
}

render(<App />, document.getElementById("app")!);
starten(BESTAND);


// Preisstaffeln, Mindermengenzuschlag und Vier-Augen-Freigabe. Ohne Browser-Abhängigkeiten.
import { positionRechnen, summen } from "./angebot.ts";
import type { Daten, Position, Vorgang } from "./modell.ts";

/** Rabatt laut Staffel für eine Menge in m² (höchste erreichte Stufe). */
export function staffelRabatt(d: Pick<Daten, "einstellungen">, menge_m2: number): number {
  let r = 0;
  for (const s of d.einstellungen.preise.staffeln) if (menge_m2 >= s.ab_m2 && s.rabatt_proz > r) r = s.rabatt_proz;
  return r;
}

/** Mindermengenzuschlag für die Gesamtmenge der Artikel in m² (0, wenn nicht fällig). */
export function mindermengeFuer(d: Pick<Daten, "einstellungen">, positionen: Position[]): number {
  const m = d.einstellungen.preise.mindermenge;
  const gesamt = positionen.filter((p) => p.produkt_id).reduce((s, p) => s + p.menge_m2, 0);
  return m.unter_m2 != null && gesamt > 0 && gesamt < m.unter_m2 ? m.betrag : 0;
}

/** Wendet Staffel und Mindermenge an. Von Hand gesetzte Rabatte und Zuschläge bleiben unberührt. */
export function regelnAnwenden<T extends Pick<Vorgang, "positionen" | "mindermenge_netto" | "mindermenge_manuell">>(v: T, d: Pick<Daten, "einstellungen">): T {
  const positionen = v.positionen.map((p) => (p.rabatt_manuell || !p.produkt_id ? p : positionRechnen({ ...p, rabatt_proz: staffelRabatt(d, positionRechnen(p).menge_m2) })));
  return { ...v, positionen, mindermenge_netto: v.mindermenge_manuell ? v.mindermenge_netto : mindermengeFuer(d, positionen) };
}

export function vierAugenNoetig(v: Vorgang, d: Daten): boolean {
  const grenze = d.einstellungen.preise.vier_augen_ab;
  return grenze != null && summen(v, d.einstellungen.angebot.mwst_proz).netto >= grenze;
}

/** Wer das Angebot erstellt hat (darf es nicht selbst freigeben). */
export function erstellerVon(v: Vorgang): string {
  return [...v.statusverlauf].reverse().find((x) => x.status === "angebot_erstellt")?.von ?? v.statusverlauf[0]?.von ?? v.geaendert_von;
}

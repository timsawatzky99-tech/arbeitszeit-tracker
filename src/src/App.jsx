import React, { useEffect, useMemo, useState } from "react";

// Single‑file React app for tracking work time with localStorage persistence.
// German UI, weekly/monthly summaries, CSV export, JSON import/export.
// No backend needed. Works offline. Hostable on GitHub Pages / Netlify.

// ---- Types ----
type TimePair = { start: string; end?: string }; // ISO time strings (HH:MM)
type DayEntry = { date: string; pairs: TimePair[]; note?: string };

// ---- Helpers ----
const STORAGE_KEY = "arbeitszeit_v1";

function todayYMD() {
  const d = new Date();
  const tzOff = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzOff * 60000);
  return local.toISOString().slice(0, 10);
}

function toMinutes(hhmm: string | undefined) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToHHMM(mins: number) {
  const sign = mins < 0 ? "-" : "";
  const a = Math.abs(mins);
  const h = Math.floor(a / 60)
    .toString()
    .padStart(2, "0");
  const m = (a % 60).toString().padStart(2, "0");
  return `${sign}${h}:${m}`;
}

function sumDayMinutes(entry: DayEntry): number {
  return entry.pairs.reduce((acc, p) => {
    if (!p.start || !p.end) return acc;
    let dm = toMinutes(p.end) - toMinutes(p.start);
    if (dm < 0) dm += 24 * 60; // overnight safety
    return acc + dm;
  }, 0);
}

function startOfWeek(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7); // YYYY-MM
}

function formatDateDE(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

function nowHHMM() {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function download(filename: string, text: string) {
  const el = document.createElement("a");
  el.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
  el.setAttribute("download", filename);
  el.style.display = "none";
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
}

// ---- Component ----
export default function TimeTracker() {
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayYMD());
  const [dailyTargetMinutes, setDailyTargetMinutes] = useState<number>(8 * 60); // default 8h
  const [activeTab, setActiveTab] = useState<"heute" | "woche" | "monat" | "alle">("heute");
  const [note, setNote] = useState<string>("");

  // Load / Save localStorage
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (Array.isArray(data.entries)) setEntries(data.entries);
        if (typeof data.dailyTargetMinutes === "number") setDailyTargetMinutes(data.dailyTargetMinutes);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, dailyTargetMinutes }));
  }, [entries, dailyTargetMinutes]);

  // Ensure current day exists
  useEffect(() => {
    const d = selectedDate;
    setEntries((prev) => {
      if (prev.some((e) => e.date === d)) return prev;
      return [...prev, { date: d, pairs: [] }].sort((a, b) => a.date.localeCompare(b.date));
    });
  }, [selectedDate]);

  const todayEntry = useMemo(() => entries.find((e) => e.date === selectedDate) || { date: selectedDate, pairs: [] }, [entries, selectedDate]);

  const weekEntries = useMemo(() => {
    const sow = startOfWeek(selectedDate);
    const d0 = new Date(sow + "T00:00:00");
    const list: DayEntry[] = [];
    for (let i = 0; i < 7; i++) {
      const di = new Date(d0);
      di.setDate(d0.getDate() + i);
      const ymd = di.toISOString().slice(0, 10);
      list.push(entries.find((e) => e.date === ymd) || { date: ymd, pairs: [] });
    }
    return list;
  }, [entries, selectedDate]);

  const monthEntries = useMemo(() => entries.filter((e) => monthKey(e.date) === monthKey(selectedDate)), [entries, selectedDate]);

  // Calculations
  function overtimeFor(entriesList: DayEntry[]) {
    const total = entriesList.reduce((acc, e) => acc + sumDayMinutes(e), 0);
    // Count only days that have any minutes for target comparison
    const workedDays = entriesList.filter((e) => sumDayMinutes(e) > 0).length;
    const target = workedDays * dailyTargetMinutes;
    return { total, target, delta: total - target };
  }

  const weekOT = useMemo(() => overtimeFor(weekEntries), [weekEntries, dailyTargetMinutes]);
  const monthOT = useMemo(() => overtimeFor(monthEntries), [monthEntries, dailyTargetMinutes]);
  const todayMinutes = useMemo(() => sumDayMinutes(todayEntry), [todayEntry]);

  // Mutations
  function updateToday(mut: (e: DayEntry) => void) {
    setEntries((prev) => prev.map((e) => (e.date === selectedDate ? (mut({ ...e }), { ...e }) : e)));
  }

  function addStartNow() {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.date === selectedDate);
      const copy = [...prev];
      if (idx === -1) {
        copy.push({ date: selectedDate, pairs: [{ start: nowHHMM() }] });
      } else {
        const e = { ...copy[idx] };
        // If last pair has no end, do nothing
        if (e.pairs.length && !e.pairs[e.pairs.length - 1].end) return prev;
        e.pairs = [...e.pairs, { start: nowHHMM() }];
        copy[idx] = e;
      }
      return copy;
    });
  }

  function addEndNow() {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.date === selectedDate);
      if (idx === -1) return prev;
      const copy = [...prev];
      const e = { ...copy[idx] };
      if (e.pairs.length === 0) return prev;
      const last = { ...e.pairs[e.pairs.length - 1] };
      if (last.end) return prev; // already closed
      last.end = nowHHMM();
      e.pairs = [...e.pairs.slice(0, -1), last];
      copy[idx] = e;
      return copy;
    });
  }

  function setPair(i: number, key: "start" | "end", val: string) {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.date === selectedDate);
      if (idx === -1) return prev;
      const copy = [...prev];
      const e = { ...copy[idx] };
      const pairs = e.pairs.map((p, j) => (j === i ? { ...p, [key]: val } : p));
      e.pairs = pairs;
      copy[idx] = e;
      return copy;
    });
  }

  function addEmptyPair() {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.date === selectedDate);
      const copy = [...prev];
      if (idx === -1) copy.push({ date: selectedDate, pairs: [{ start: "08:00", end: "16:00" }] });
      else {
        const e = { ...copy[idx] };
        e.pairs = [...e.pairs, { start: "08:00", end: "16:00" }];
        copy[idx] = e;
      }
      return copy;
    });
  }

  function deletePair(i: number) {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.date === selectedDate);
      if (idx === -1) return prev;
      const copy = [...prev];
      const e = { ...copy[idx] };
      e.pairs = e.pairs.filter((_, j) => j !== i);
      copy[idx] = e;
      return copy;
    });
  }

  function clearDay() {
    setEntries((prev) => prev.map((e) => (e.date === selectedDate ? { ...e, pairs: [] } : e)));
  }

  function handleExportCSV() {
    const rows = [["Datum", "Start", "Ende", "Dauer [min]", "Dauer [hh:mm]"]];
    entries.forEach((e) => {
      if (e.pairs.length === 0) rows.push([e.date, "", "", "0", "00:00"]);
      e.pairs.forEach((p) => {
        const dm = p.start && p.end ? (toMinutes(p.end) - toMinutes(p.start) + 1440) % 1440 : 0;
        rows.push([e.date, p.start || "", p.end || "", String(dm), minutesToHHMM(dm)]);
      });
    });
    const csv = rows.map((r) => r.map((c) => `"${(c || "").replaceAll('"', '""')}"`).join(";")).join("\n");
    download("arbeitszeit.csv", csv);
  }

  function handleExportJSON() {
    const blob = JSON.stringify({ entries, dailyTargetMinutes }, null, 2);
    download("arbeitszeit.json", blob);
  }

  function handleImportJSON(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data.entries)) setEntries(data.entries);
        if (typeof data.dailyTargetMinutes === "number") setDailyTargetMinutes(data.dailyTargetMinutes);
      } catch (e) {
        alert("Ungültige JSON-Datei");
      }
    };
    reader.readAsText(file);
    ev.target.value = "";
  }

  function ProgressBar({ value, max }: { value: number; max: number }) {
    const pct = Math.min(100, Math.round((value / (max || 1)) * 100));
    return (
      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-3 rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, #22c55e, #3b82f6)` }} />
      </div>
    );
  }

  const hasOpenPair = todayEntry.pairs.some((p) => p.start && !p.end);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Arbeitszeit‑Tracker</h1>
          <div className="flex gap-2 items-center">
            <label className="text-sm">Zieltageszeit
              <input
                type="time"
                className="ml-2 border rounded px-2 py-1"
                value={minutesToHHMM(dailyTargetMinutes)}
                onChange={(e) => setDailyTargetMinutes(toMinutes(e.target.value))}
                step={300}
              />
            </label>
            <button className="border px-3 py-1 rounded hover:bg-gray-100" onClick={handleExportCSV}>CSV</button>
            <button className="border px-3 py-1 rounded hover:bg-gray-100" onClick={handleExportJSON}>Export</button>
            <label className="border px-3 py-1 rounded hover:bg-gray-100 cursor-pointer">
              Import
              <input type="file" accept="application/json" className="hidden" onChange={handleImportJSON} />
            </label>
          </div>
        </header>

        {/* Tabs */}
        <nav className="flex gap-2">
          {(["heute", "woche", "monat", "alle"] as const).map((k) => (
            <button key={k} className={`px-4 py-2 rounded-full border ${activeTab === k ? "bg-white shadow" : "hover:bg-white"}`} onClick={() => setActiveTab(k)}>
              {k === "heute" && "Heute"}
              {k === "woche" && "Woche"}
              {k === "monat" && "Monat"}
              {k === "alle" && "Alle"}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <input type="date" className="border rounded px-2 py-1" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            <button className="border px-3 py-1 rounded hover:bg-gray-100" onClick={() => setSelectedDate(todayYMD())}>Heute</button>
          </div>
        </nav>

        {/* Heute Panel */}
        {activeTab === "heute" && (
          <section className="bg-white rounded-2xl shadow p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{formatDateDE(selectedDate)}</h2>
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-xl bg-green-600 text-white hover:opacity-90" onClick={addStartNow} disabled={hasOpenPair}>
                  Kommen jetzt
                </button>
                <button className="px-3 py-2 rounded-xl bg-blue-600 text-white hover:opacity-90 disabled:opacity-50" onClick={addEndNow} disabled={!hasOpenPair}>
                  Gehen jetzt
                </button>
                <button className="px-3 py-2 rounded-xl border hover:bg-gray-50" onClick={addEmptyPair}>Paar hinzufügen</button>
                <button className="px-3 py-2 rounded-xl border hover:bg-gray-50" onClick={clearDay}>Tag leeren</button>
              </div>
            </div>

            <div className="space-y-2">
              {todayEntry.pairs.length === 0 && (
                <p className="text-gray-500">Noch keine Einträge für heute.</p>
              )}
              {todayEntry.pairs.map((p, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3">
                    <label className="text-sm block">Kommen
                      <input type="time" className="w-full border rounded px-2 py-1" value={p.start || ""} onChange={(e) => setPair(i, "start", e.target.value)} />
                    </label>
                  </div>
                  <div className="col-span-3">
                    <label className="text-sm block">Gehen
                      <input type="time" className="w-full border rounded px-2 py-1" value={p.end || ""} onChange={(e) => setPair(i, "end", e.target.value)} />
                    </label>
                  </div>
                  <div className="col-span-4 text-sm">
                    Dauer: <strong>{minutesToHHMM(p.start && p.end ? (toMinutes(p.end) - toMinutes(p.start) + 1440) % 1440 : 0)}</strong>
                  </div>
                  <div className="col-span-2 text-right">
                    <button className="text-red-600 hover:underline" onClick={() => deletePair(i)}>Entfernen</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-sm">Heutige Summe: <strong>{minutesToHHMM(todayMinutes)}</strong> / Ziel <strong>{minutesToHHMM(dailyTargetMinutes)}</strong></div>
              <ProgressBar value={todayMinutes} max={dailyTargetMinutes} />
              <div className="text-sm">Heutiger Saldo: <strong className={todayMinutes - dailyTargetMinutes >= 0 ? "text-green-600" : "text-red-600"}>{minutesToHHMM(todayMinutes - dailyTargetMinutes)}</strong></div>
            </div>
          </section>
        )}

        {/* Woche Panel */}
        {activeTab === "woche" && (
          <section className="bg-white rounded-2xl shadow p-4 space-y-4">
            <h2 className="text-xl font-semibold">Woche ab {formatDateDE(startOfWeek(selectedDate))}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">Datum</th>
                  <th>Arbeitszeit</th>
                  <th>Ziel</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {weekEntries.map((e) => {
                  const m = sumDayMinutes(e);
                  const delta = m - (m > 0 ? dailyTargetMinutes : 0);
                  return (
                    <tr key={e.date} className="border-b last:border-0">
                      <td className="py-2">{formatDateDE(e.date)}</td>
                      <td>{minutesToHHMM(m)}</td>
                      <td>{m > 0 ? minutesToHHMM(dailyTargetMinutes) : "—"}</td>
                      <td className={delta >= 0 ? "text-green-600" : "text-red-600"}>{minutesToHHMM(delta)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-2">Summe</td>
                  <td>{minutesToHHMM(weekOT.total)}</td>
                  <td>{minutesToHHMM(weekOT.target)}</td>
                  <td className={weekOT.delta >= 0 ? "text-green-600" : "text-red-600"}>{minutesToHHMM(weekOT.delta)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {/* Monat Panel */}
        {activeTab === "monat" && (
          <section className="bg-white rounded-2xl shadow p-4 space-y-4">
            <h2 className="text-xl font-semibold">Monat {monthKey(selectedDate)}</h2>
            <div className="flex items-center gap-2 text-sm">
              <div>Geleistete Arbeit: <strong>{minutesToHHMM(monthOT.total)}</strong></div>
              <div className="mx-2">|</div>
              <div>Ziel (nur Arbeitstage mit Eintrag): <strong>{minutesToHHMM(monthOT.target)}</strong></div>
              <div className="mx-2">|</div>
              <div>Saldo: <strong className={monthOT.delta >= 0 ? "text-green-600" : "text-red-600"}>{minutesToHHMM(monthOT.delta)}</strong></div>
            </div>
            <div className="space-y-2">
              {entries.filter((e) => monthKey(e.date) === monthKey(selectedDate)).sort((a,b)=>a.date.localeCompare(b.date)).map((e) => (
                <div key={e.date} className="flex items-center justify-between border-b py-2">
                  <div className="font-medium w-40">{formatDateDE(e.date)}</div>
                  <div className="text-sm">{minutesToHHMM(sumDayMinutes(e))}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Alle Panel */}
        {activeTab === "alle" && (
          <section className="bg-white rounded-2xl shadow p-4 space-y-4">
            <h2 className="text-xl font-semibold">Alle Einträge</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">Datum</th>
                  <th>Paare</th>
                  <th>Summe</th>
                </tr>
              </thead>
              <tbody>
                {entries.sort((a,b)=>a.date.localeCompare(b.date)).map((e) => (
                  <tr key={e.date} className="border-b last:border-0">
                    <td className="py-2">{formatDateDE(e.date)}</td>
                    <td>
                      {e.pairs.length === 0 ? "—" : e.pairs.map((p, i) => (
                        <span key={i} className="inline-block mr-2">{p.start || "??"}–{p.end || ".."}</span>
                      ))}
                    </td>
                    <td>{minutesToHHMM(sumDayMinutes(e))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="text-xs text-gray-500 pt-4">
          <p>Speichert Daten lokal im Browser (localStorage). Keine Server‑Übertragung.</p>
        </footer>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { openDB } from "idb";

const DB_NAME = "loyalty_wallet";
const STORE = "cards";

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("by_name", "name");
      }
    }
  });
}

function uid() {
  return crypto.randomUUID?.() ?? String(Date.now());
}

export default function App() {
  const [cards, setCards] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const reader = useMemo(() => new BrowserMultiFormatReader(), []);

  useEffect(() => {
    (async () => {
      const d = await db();
      const all = await d.getAll(STORE);
      setCards(all.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
    })();
  }, []);

  useEffect(() => {
    // service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    }
  }, []);

  async function startScan() {
    setLastCode("");
    setScanning(true);
    try {
      const result = await reader.decodeOnceFromVideoDevice(undefined, "video");
      setLastCode(result.getText());
      setScanning(false);
      reader.reset();
    } catch (e) {
      setScanning(false);
      reader.reset();
      alert("Scannen is gestopt / niet gelukt. Geef camera toestemming en probeer opnieuw.");
    }
  }

  async function addCard() {
    if (!lastCode) return;
    const name = prompt("Naam van de kaart (bijv. AH, Lidl, DM):", "Nieuwe kaart");
    if (!name) return;

    const newCard = {
      id: uid(),
      name: name.trim(),
      value: lastCode.trim(),
      createdAt: Date.now(),
      format: lastCode.includes("http") ? "QR/URL" : "Barcode/QR"
    };

    const d = await db();
    await d.put(STORE, newCard);
    const all = await d.getAll(STORE);
    setCards(all.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
    setLastCode("");
  }

  async function removeCard(id) {
    const ok = confirm("Kaart verwijderen?");
    if (!ok) return;
    const d = await db();
    await d.delete(STORE, id);
    const all = await d.getAll(STORE);
    setCards(all.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">Loyalty Wallet</div>
        <div className="subtitle">Scan en bewaar je klantenkaarten</div>
      </header>

      <main className="content">
        <section className="card">
          <h2>Scan kaart</h2>

          {!scanning ? (
            <button className="primary" onClick={startScan}>📷 Start scan</button>
          ) : (
            <div className="scanner">
              <video id="video" className="video" />
              <button className="ghost" onClick={() => { reader.reset(); setScanning(false); }}>Stop</button>
            </div>
          )}

          {lastCode && (
            <div className="result">
              <div className="code">{lastCode}</div>
              <button className="primary" onClick={addCard}>➕ Opslaan als kaart</button>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Mijn kaarten</h2>
          {cards.length === 0 ? (
            <p className="muted">Nog geen kaarten. Scan er één 😊</p>
          ) : (
            <div className="list">
              {cards.map((c) => (
                <div key={c.id} className="item">
                  <div>
                    <div className="name">{c.name}</div>
                    <div className="small">{c.format}</div>
                  </div>
                  <div className="actions">
                    <button className="ghost" onClick={() => navigator.clipboard?.writeText(c.value)}>Kopieer</button>
                    <button className="danger" onClick={() => removeCard(c.id)}>Verwijder</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card muted">
          <h2>Wallet (Apple/Google)</h2>
          <p className="muted">
            Volgende stap: “Add to Apple Wallet” / “Add to Google Wallet”.
            Dat kan pas als we server-side passes gaan genereren (certificaten/issuer nodig).
          </p>
        </section>
      </main>
    </div>
  );
}

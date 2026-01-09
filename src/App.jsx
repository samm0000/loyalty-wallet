import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "./supabase";

function uid() {
  return crypto.randomUUID?.() ?? String(Date.now());
}

function isQr(zxingFormat, value) {
  if (zxingFormat === "QR_CODE") return true;
  return !/^\d+$/.test((value || "").trim());
}

function toJsBarcodeFormat(zxingFormat, value) {
  switch (zxingFormat) {
    case "EAN_13":
      return "EAN13";
    case "EAN_8":
      return "EAN8";
    case "CODE_128":
      return "CODE128";
    case "CODE_39":
      return "CODE39";
    case "ITF":
      return "ITF";
    case "UPC_A":
      return "UPC";
    default:
      if (/^\d{13}$/.test(value)) return "EAN13";
      if (/^\d{8}$/.test(value)) return "EAN8";
      return "CODE128";
  }
}

export default function App() {
  const reader = useMemo(() => new BrowserMultiFormatReader(), []);
  const barcodeRef = useRef(null);

  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [authInfo, setAuthInfo] = useState("");

  const [cards, setCards] = useState([]);
  const [scanning, setScanning] = useState(false);

  const [selected, setSelected] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const [syncInfo, setSyncInfo] = useState("");

  // Service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    }
  }, []);

  // Load local + auth session
  useEffect(() => {
    const local = JSON.parse(localStorage.getItem("cards") || "[]");
    setCards(local);

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });

    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // Persist local
  useEffect(() => {
    localStorage.setItem("cards", JSON.stringify(cards));
  }, [cards]);

  // Render QR or barcode when a card is selected
  useEffect(() => {
    (async () => {
      if (!selected) return;

      const val = (selected.value || "").trim();
      const fmt = selected.format || "";

      if (isQr(fmt, val)) {
        const url = await QRCode.toDataURL(val, { margin: 1, width: 720 });
        setQrDataUrl(url);
      } else {
        setQrDataUrl("");
        const jsFmt = toJsBarcodeFormat(fmt, val);
        requestAnimationFrame(() => {
          if (barcodeRef.current) {
            JsBarcode(barcodeRef.current, val, {
              format: jsFmt,
              displayValue: false,
              margin: 0
            });
          }
        });
      }
    })();
  }, [selected]);

  // Auth (magic link)
  async function signInMagicLink() {
    setAuthInfo("");
    if (!email.trim()) return;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin }
    });

    if (error) {
      setAuthInfo("Login mislukt: " + error.message);
    } else {
      setAuthInfo("Check je e-mail voor de magic link. Open die op dezelfde iPhone.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSyncInfo("");
  }

  // Scan
  async function startScan() {
    setScanning(true);
    setSyncInfo("");
    try {
      const result = await reader.decodeOnceFromVideoDevice(undefined, "video");
      const value = result.getText();
      const format = String(result.getBarcodeFormat()); // EAN_13, QR_CODE, CODE_128, etc.

      reader.reset();
      setScanning(false);

      const name = prompt("Naam van de kaart (bijv. AH, Lidl, DM):", "Nieuwe kaart");
      if (!name) return;

      const newCard = {
        id: uid(),
        name: name.trim(),
        value: value.trim(),
        format,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // LET OP: geen auto-open popup (jij wilde de optionele optie weg)
      setCards((prev) => [newCard, ...prev]);
    } catch (e) {
      reader.reset();
      setScanning(false);
      alert("Scannen gestopt of geen toegang tot camera. Probeer opnieuw en geef camera-toestemming.");
    }
  }

  function stopScan() {
    reader.reset();
    setScanning(false);
  }

  function removeCard(id) {
    const ok = confirm("Kaart verwijderen?");
    if (!ok) return;
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  // Cloud sync (merge + upsert)
  async function syncToCloud() {
    setSyncInfo("");
    if (!session?.user?.id) {
      setSyncInfo("Log eerst in om te syncen.");
      return;
    }

    try {
      setSyncInfo("Sync bezig…");
      const userId = session.user.id;

      // Pull cloud
      const { data: cloud, error: pullErr } = await supabase
        .from("cards")
        .select("*")
        .eq("user_id", userId);

      if (pullErr) throw pullErr;

      const cloudAsLocal = (cloud || []).map((c) => ({
        id: c.id,
        name: c.name,
        value: c.value,
        format: c.format || "",
        createdAt: new Date(c.created_at).getTime(),
        updatedAt: new Date(c.updated_at).getTime()
      }));

      // Merge by updatedAt
      const merged = new Map();
      for (const c of cards) merged.set(c.id, c);
      for (const c of cloudAsLocal) {
        const local = merged.get(c.id);
        if (!local) merged.set(c.id, c);
        else merged.set(c.id, (c.updatedAt > (local.updatedAt || 0)) ? c : local);
      }

      const mergedArr = Array.from(merged.values()).sort(
        (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
      );

      setCards(mergedArr);

      // Push merged
      const payload = mergedArr.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        value: c.value,
        format: c.format || ""
      }));

      const { error: pushErr } = await supabase
        .from("cards")
        .upsert(payload, { onConflict: "id" });

      if (pushErr) throw pushErr;

      setSyncInfo("Sync klaar ✅");
    } catch (e) {
      setSyncInfo("Sync fout: " + (e?.message || String(e)));
    }
  }

  function openPopup(card) {
    setSelected(card);
  }

  function closePopup() {
    setSelected(null);
    setQrDataUrl("");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">Loyalty Wallet</div>
        <div className="subtitle">Scan, bewaar en toon je kaart aan de kassa</div>
      </header>

      <main className="content">
        {/* AUTH + SYNC */}
        <section className="card">
          <h2>Cloud Sync (Supabase)</h2>

          {!session ? (
            <>
              <p className="small">
                Log in met e-mail (magic link) om je kaarten te synchroniseren.
              </p>
              <input
                className="input"
                placeholder="jouw@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
              />
              <div style={{ height: 10 }} />
              <button className="primary" onClick={signInMagicLink}>
                Login via magic link
              </button>
              {authInfo && <p className="small">{authInfo}</p>}
            </>
          ) : (
            <>
              <p className="small">
                Ingelogd als: <b>{session.user.email}</b>
              </p>
              <div className="btnRow">
                <button className="primary" onClick={syncToCloud}>Sync nu</button>
                <button className="ghost" onClick={signOut}>Logout</button>
              </div>
              {syncInfo && <p className="small">{syncInfo}</p>}
            </>
          )}
        </section>

        {/* SCAN */}
        <section className="card">
          <h2>Scan kaart</h2>

          {!scanning ? (
            <button className="primary" onClick={startScan}>📷 Start scan</button>
          ) : (
            <>
              <video id="video" className="video" />
              <div style={{ height: 10 }} />
              <button className="ghost" onClick={stopScan}>Stop</button>
            </>
          )}

          <p className="small">
            Tip: zet je schermhelderheid hoog voor sneller scannen bij de kassa.
          </p>
        </section>

        {/* CARDS */}
        <section className="card">
          <h2>Mijn kaarten</h2>

          {cards.length === 0 ? (
            <p className="muted">Nog geen kaarten. Scan er één 😊</p>
          ) : (
            <div className="list">
              {cards.map((c) => (
                <div
                  key={c.id}
                  className="item clickable"
                  onClick={() => openPopup(c)}
                >
                  <div>
                    <div className="name">{c.name}</div>
                    <div className="meta">Format: {c.format || "onbekend"}</div>
                  </div>

                  <div className="actions">
                    <button
                      className="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard?.writeText(c.value);
                      }}
                    >
                      Kopieer
                    </button>
                    <button
                      className="danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCard(c.id);
                      }}
                    >
                      Verwijder
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="small">
            Tik op een kaart → popup opent met barcode/QR om te scannen in de winkel.
          </p>
        </section>

        {/* iPhone note */}
        <section className="card">
          <h2>iPhone tip</h2>
          <p className="small">
            iOS houdt je scherm niet altijd “wakker” via web. Zet eventueel tijdelijk
            “Automatische vergrendeling” langer (Instellingen → Scherm en helderheid).
          </p>
        </section>
      </main>

      {/* POPUP */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePopup}
          >
            <motion.div
              className="sheet"
              initial={{ y: 40, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 40, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sheetTop">
                <div>
                  <div className="sheetTitle">{selected.name}</div>
                  <div className="sheetSub">
                    Laat dit aan de kassa scannen • Format: {selected.format || "onbekend"}
                  </div>
                </div>
                <button
                  className="ghost"
                  style={{ width: "auto" }}
                  onClick={closePopup}
                >
                  Sluiten
                </button>
              </div>

              <div className="codeBox">
                {isQr(selected.format, selected.value) ? (
                  <img className="qr" src={qrDataUrl} alt="QR" />
                ) : (
                  <svg className="barcode" ref={barcodeRef} />
                )}
              </div>

              <div style={{ height: 10 }} />
              <div className="codeMono">{selected.value}</div>

              <div className="center" style={{ marginTop: 10 }}>
                <div className="small">
                  Tip: zet je schermhelderheid hoog voor sneller scannen.
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { AnimatePresence, motion } from "framer-motion";
import { supabase, supabaseConfigOk } from "./supabase";

function uid() {
  return crypto.randomUUID?.() ?? String(Date.now());
}

/** Retailer list (mix: loyalty + common “online accounts” as labels) */
const RETAILERS = [
  // Supermarkets / drugstores / retail
  "Lidl",
  "Aldi",
  "Kaufland",
  "REWE",
  "EDEKA",
  "PENNY",
  "Netto",
  "dm",
  "Rossmann",
  "Carrefour",
  "Tesco",
  "SPAR",
  "Coop",
  "Migros",
  "Auchan",
  "IKEA Family",
  "Decathlon",
  "H&M",
  "Zara",
  "MediaMarkt",
  "Saturn",
  "Douglas",

  // “Online / accounts” (je kunt zelf QR/barcode/text opslaan)
  "Amazon",
  "PayPal",
  "Google",
  "Apple",
  "Uber",
  "Bolt",
  "Booking",
  "Airbnb",
  "Netflix",
  "Spotify",

  // Shipping / services
  "DHL",
  "GLS",
  "DPD",
  "PostNL",
  "Deutsche Post",

  // Other
  "Other"
];

/** Country list (brede lijst zodat je “alle landen” hebt) */
const COUNTRIES = [
  { code: "NL", name: "Netherlands" },
  { code: "DE", name: "Germany" },
  { code: "BE", name: "Belgium" },
  { code: "LU", name: "Luxembourg" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "PT", name: "Portugal" },
  { code: "IT", name: "Italy" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "DK", name: "Denmark" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "FI", name: "Finland" },
  { code: "IE", name: "Ireland" },
  { code: "GB", name: "United Kingdom" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czechia" },
  { code: "SK", name: "Slovakia" },
  { code: "HU", name: "Hungary" },
  { code: "SI", name: "Slovenia" },
  { code: "HR", name: "Croatia" },
  { code: "RO", name: "Romania" },
  { code: "BG", name: "Bulgaria" },
  { code: "GR", name: "Greece" },
  { code: "CY", name: "Cyprus" },
  { code: "MT", name: "Malta" },
  { code: "LT", name: "Lithuania" },
  { code: "LV", name: "Latvia" },
  { code: "EE", name: "Estonia" },
  { code: "RS", name: "Serbia" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "ME", name: "Montenegro" },
  { code: "MK", name: "North Macedonia" },
  { code: "AL", name: "Albania" },
  { code: "XK", name: "Kosovo" },
  { code: "TR", name: "Türkiye" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "IL", name: "Israel" },
  { code: "EG", name: "Egypt" },
  { code: "MA", name: "Morocco" },
  { code: "TN", name: "Tunisia" },
  { code: "ZA", name: "South Africa" },
  { code: "IN", name: "India" },
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "SG", name: "Singapore" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" }
];

function countryName(code) {
  return COUNTRIES.find((c) => c.code === code)?.name || code || "—";
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
  const scanControlsRef = useRef(null);

  const barcodeRef = useRef(null);

  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [syncInfo, setSyncInfo] = useState("");

  const [cards, setCards] = useState([]);

  // Add flow state
  const [addOpen, setAddOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [manualFormat, setManualFormat] = useState("QR_CODE");

  const [retailer, setRetailer] = useState("Lidl");
  const [country, setCountry] = useState("DE");
  const [retailerSearch, setRetailerSearch] = useState("");
  const [countrySearch, setCountrySearch] = useState("");

  // Popup usage
  const [selected, setSelected] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Register SW
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    }
  }, []);

  // Load local + auth
  useEffect(() => {
    const local = JSON.parse(localStorage.getItem("cards") || "[]");
    setCards(local);

    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));

    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  useEffect(() => {
    localStorage.setItem("cards", JSON.stringify(cards));
  }, [cards]);

  // Render code in popup
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

  function stopScan() {
    try {
      scanControlsRef.current?.stop();
    } catch {}
    scanControlsRef.current = null;
    try {
      reader.reset();
    } catch {}
    setScanning(false);
  }

  async function startScan() {
    stopScan();
    setScanning(true);
    await new Promise((r) => requestAnimationFrame(r));

    try {
      const controls = await reader.decodeFromVideoDevice(undefined, "video", (result) => {
        if (!result) return;
        const value = String(result.getText() || "").trim();
        const format = String(result.getBarcodeFormat() || "");

        if (!value) return;

        try {
          controls?.stop();
        } catch {}
        scanControlsRef.current = null;

        try {
          reader.reset();
        } catch {}

        setScanning(false);

        const nickname = prompt("Kaartnaam (bijv. Lidl Plus / PayPal / …):", retailer);
        if (!nickname) return;

        const newCard = {
          id: uid(),
          retailer,
          country,
          nickname: nickname.trim(),
          value,
          format,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        setCards((prev) => [newCard, ...prev]);
        setAddOpen(false);
      });

      scanControlsRef.current = controls;
    } catch (e) {
      stopScan();
      alert("Scanner kon niet starten. Camera-toestemming ok? Probeer opnieuw.");
    }
  }

  function addManual() {
    const value = (manualValue || "").trim();
    if (!value) return;

    const nickname = prompt("Kaartnaam (bijv. Lidl Plus / PayPal / …):", retailer);
    if (!nickname) return;

    const newCard = {
      id: uid(),
      retailer,
      country,
      nickname: nickname.trim(),
      value,
      format: manualFormat,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setCards((prev) => [newCard, ...prev]);
    setManualValue("");
    setAddOpen(false);
  }

  function removeCard(id) {
    const ok = confirm("Kaart verwijderen?");
    if (!ok) return;
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function openPopup(card) {
    setSelected(card);
  }

  function closePopup() {
    setSelected(null);
    setQrDataUrl("");
  }

  async function signInMagicLink() {
    setAuthInfo("");
    if (!supabase) {
      setAuthInfo("Supabase is niet geconfigureerd (Vercel env vars ontbreken).");
      return;
    }
    if (!email.trim()) return;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin }
    });

    if (error) setAuthInfo("Login mislukt: " + error.message);
    else setAuthInfo("Check je e-mail voor de magic link (open op dezelfde iPhone).");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSyncInfo("");
  }

  async function syncToCloud() {
    setSyncInfo("");
    if (!supabase) {
      setSyncInfo("Supabase env vars ontbreken in Vercel.");
      return;
    }
    if (!session?.user?.id) {
      setSyncInfo("Log eerst in om te syncen.");
      return;
    }

    try {
      setSyncInfo("Sync bezig…");
      const userId = session.user.id;

      const { data: cloud, error: pullErr } = await supabase
        .from("cards")
        .select("*")
        .eq("user_id", userId);

      if (pullErr) throw pullErr;

      const cloudAsLocal = (cloud || []).map((c) => ({
        id: c.id,
        retailer: c.retailer,
        country: c.country,
        nickname: c.nickname,
        value: c.value,
        format: c.format || "",
        createdAt: new Date(c.created_at).getTime(),
        updatedAt: new Date(c.updated_at).getTime()
      }));

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

      const payload = mergedArr.map((c) => ({
        id: c.id,
        user_id: userId,
        retailer: c.retailer,
        country: c.country,
        nickname: c.nickname,
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

  // Filters
  const [filterRetailer, setFilterRetailer] = useState("All");
  const [filterCountry, setFilterCountry] = useState("All");
  const [search, setSearch] = useState("");

  const filteredCards = cards.filter((c) => {
    if (filterRetailer !== "All" && c.retailer !== filterRetailer) return false;
    if (filterCountry !== "All" && c.country !== filterCountry) return false;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      const hay = `${c.nickname} ${c.retailer} ${c.country} ${countryName(c.country)}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const retailerOptions = RETAILERS.filter((r) =>
    r.toLowerCase().includes(retailerSearch.trim().toLowerCase())
  );

  const countryOptions = COUNTRIES.filter((c) =>
    `${c.code} ${c.name}`.toLowerCase().includes(countrySearch.trim().toLowerCase())
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">Loyalty Wallet</div>
        <div className="subtitle">Scan, bewaar en toon je kaart aan de kassa</div>
      </header>

      <main className="content">
        {!supabaseConfigOk && (
          <section className="card">
            <h2>Supabase niet ingesteld</h2>
            <p className="small">
              Vercel → Project → Settings → Environment Variables:
              <br />• <b>VITE_SUPABASE_URL</b>
              <br />• <b>VITE_SUPABASE_ANON_KEY</b>
              <br />Daarna redeploy.
            </p>
          </section>
        )}

        <section className="card">
          <h2>Account & Sync</h2>
          {!session ? (
            <>
              <p className="small">Login met e-mail (magic link) om je kaarten te syncen.</p>
              <input
                className="input"
                placeholder="jouw@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
              />
              <div style={{ height: 10 }} />
              <button className="primary" onClick={signInMagicLink} disabled={!supabase}>
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
                <button className="primary" onClick={syncToCloud}>
                  Sync nu
                </button>
                <button className="ghost" onClick={signOut}>
                  Logout
                </button>
              </div>
              {syncInfo && <p className="small">{syncInfo}</p>}
            </>
          )}
        </section>

        <section className="card">
          <h2>Kaart toevoegen</h2>
          <button className="primary" onClick={() => setAddOpen(true)}>
            ➕ Add card
          </button>
          <p className="small">
            Kies retailer + land. Daarna scan je barcode/QR (of voeg handmatig toe).
          </p>
        </section>

        <section className="card">
          <h2>Mijn kaarten</h2>

          <div className="filters">
            <input
              className="input"
              placeholder="Zoek (bijv. Lidl DE / PayPal / …)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="filterRow">
              <select
                className="select"
                value={filterRetailer}
                onChange={(e) => setFilterRetailer(e.target.value)}
              >
                <option value="All">Alle retailers</option>
                {RETAILERS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <select
                className="select"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
              >
                <option value="All">Alle landen</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredCards.length === 0 ? (
            <p className="muted">Nog geen kaarten (of geen match). Voeg er één toe.</p>
          ) : (
            <div className="list">
              {filteredCards.map((c) => (
                <div key={c.id} className="item clickable" onClick={() => openPopup(c)}>
                  <div>
                    <div className="name">{c.nickname}</div>
                    <div className="meta">
                      {c.retailer} • {c.country} ({countryName(c.country)}) • {c.format || "—"}
                    </div>
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

          <p className="small">Tik op een kaart → popup opent voor gebruik in de winkel.</p>
        </section>
      </main>

      {/* Add Card Modal */}
      <AnimatePresence>
        {addOpen && (
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              stopScan();
              setAddOpen(false);
            }}
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
                  <div className="sheetTitle">Add card</div>
                  <div className="sheetSub">Kies retailer + land, scan of voeg handmatig toe</div>
                </div>
                <button
                  className="ghost"
                  style={{ width: "auto" }}
                  onClick={() => {
                    stopScan();
                    setAddOpen(false);
                  }}
                >
                  Sluiten
                </button>
              </div>

              <div className="grid2">
                <div>
                  <div className="label">Retailer</div>
                  <input
                    className="input"
                    placeholder="Zoek retailer…"
                    value={retailerSearch}
                    onChange={(e) => setRetailerSearch(e.target.value)}
                  />
                  <select
                    className="select"
                    value={retailer}
                    onChange={(e) => setRetailer(e.target.value)}
                  >
                    {retailerOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="label">Land</div>
                  <input
                    className="input"
                    placeholder="Zoek land/code…"
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                  />
                  <select
                    className="select"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  >
                    {countryOptions.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ height: 10 }} />

              {!scanning ? (
                <div className="btnRow">
                  <button className="primary" onClick={startScan}>
                    📷 Scan barcode/QR
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      setScanning(false);
                      setManualValue("");
                    }}
                  >
                    Handmatig
                  </button>
                </div>
              ) : (
                <>
                  <video id="video" className="video" />
                  <div style={{ height: 10 }} />
                  <button className="ghost" onClick={stopScan}>
                    Stop
                  </button>
                  <p className="small">
                    Richt de camera op de barcode/QR. Goede belichting + stilhouden helpt enorm.
                  </p>
                </>
              )}

              <div style={{ height: 14 }} />

              <div className="label">Handmatig toevoegen</div>
              <select
                className="select"
                value={manualFormat}
                onChange={(e) => setManualFormat(e.target.value)}
              >
                <option value="QR_CODE">QR (tekst/URL)</option>
                <option value="CODE_128">Barcode (CODE128)</option>
                <option value="EAN_13">EAN-13</option>
                <option value="EAN_8">EAN-8</option>
                <option value="CODE_39">CODE39</option>
              </select>

              <input
                className="input"
                placeholder="Plak code/tekst hier…"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
              />
              <div style={{ height: 10 }} />
              <button className="primary" onClick={addManual} disabled={!manualValue.trim()}>
                Opslaan
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Use Card Popup */}
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
                  <div className="sheetTitle">{selected.nickname}</div>
                  <div className="sheetSub">
                    {selected.retailer} • {selected.country} ({countryName(selected.country)})
                  </div>
                </div>
                <button className="ghost" style={{ width: "auto" }} onClick={closePopup}>
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
              <p className="small">Laat dit scannen bij de kassa.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

export default function App() {
  const [cards, setCards] = useState([]);
  const [selected, setSelected] = useState(null);
  const [qr, setQr] = useState("");
  const barcodeRef = useRef(null);
  const reader = new BrowserMultiFormatReader();

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("cards") || "[]");
    setCards(stored);
  }, []);

  useEffect(() => {
    localStorage.setItem("cards", JSON.stringify(cards));
  }, [cards]);

  useEffect(() => {
    if (!selected) return;

    if (/^\d+$/.test(selected.value)) {
      JsBarcode(barcodeRef.current, selected.value, {
        format: "CODE128",
        displayValue: false
      });
      setQr("");
    } else {
      QRCode.toDataURL(selected.value).then(setQr);
    }
  }, [selected]);

  async function scan() {
    const res = await reader.decodeOnceFromVideoDevice(undefined, "video");
    const name = prompt("Naam van kaart:");
    if (!name) return;
    setCards([...cards, { id: Date.now(), name, value: res.getText() }]);
  }

  return (
    <div className="app">
      <h1>Loyalty Wallet</h1>

      <button onClick={scan}>📷 Scan kaart</button>
      <video id="video" />

      <ul>
        {cards.map((c) => (
          <li key={c.id} onClick={() => setSelected(c)}>
            {c.name}
          </li>
        ))}
      </ul>

      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div className="card">
            <h2>{selected.name}</h2>
            {qr ? <img src={qr} /> : <svg ref={barcodeRef} />}
            <p>{selected.value}</p>
          </div>
        </div>
      )}
    </div>
  );
}

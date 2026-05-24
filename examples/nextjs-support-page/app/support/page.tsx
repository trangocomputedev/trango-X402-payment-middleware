"use client";

import { useState } from "react";

// x402-fetch handles the 402 → wallet prompt → retry cycle automatically.
// Install: npm install x402-fetch
// import { wrapFetchWithPayment } from "x402-fetch";
// const fetch402 = wrapFetchWithPayment(fetch, wallet);

const TIERS = [
  { label: "Coffee", amount: "1.00" },
  { label: "Lunch", amount: "5.00" },
  { label: "Dinner", amount: "10.00" },
];

export default function SupportPage() {
  const [selected, setSelected] = useState("1.00");
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const effectiveAmount = custom || selected;

  async function handleSupport() {
    setStatus("Opening wallet...");
    try {
      // Replace fetch with fetch402 in production to trigger the wallet
      const res = await fetch(`/api/support?amount=${effectiveAmount}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.message);
      } else {
        const err = await res.json();
        setStatus(err.error ?? "Payment failed");
      }
    } catch {
      setStatus("Something went wrong");
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Support this project</h1>
      <p>Pay with USDC on Base. Every contribution helps.</p>

      <div style={{ display: "flex", gap: "0.75rem", margin: "1.5rem 0" }}>
        {TIERS.map((tier) => (
          <button
            key={tier.amount}
            onClick={() => { setSelected(tier.amount); setCustom(""); }}
            style={{
              padding: "0.5rem 1rem",
              border: selected === tier.amount && !custom ? "2px solid #3B82F6" : "2px solid #ccc",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {tier.label}
            <br />
            <small>{tier.amount} USDC</small>
          </button>
        ))}
      </div>

      <input
        type="number"
        min="1"
        step="0.01"
        placeholder="Custom amount (USDC)"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        style={{ padding: "0.5rem", width: "100%", marginBottom: "1rem", boxSizing: "border-box" }}
      />

      <button
        onClick={handleSupport}
        style={{
          width: "100%",
          padding: "0.75rem",
          background: "#3B82F6",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: "1rem",
        }}
      >
        Support with {effectiveAmount} USDC
      </button>

      {status && <p style={{ marginTop: "1rem", color: "#22D3EE" }}>{status}</p>}
    </main>
  );
}

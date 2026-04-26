// pages/rules.tsx — Merchant Rule Editor

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const GOALS = [
  { value: 'fill_quiet_hours', label: '📉 Fill Quiet Hours' },
  { value: 'increase_basket', label: '🛒 Increase Basket Size' },
  { value: 'first_time_visits', label: '👋 Attract First-Time Visitors' },
  { value: 'loyalty_reward', label: '💛 Reward Loyal Customers' },
];

const TONES = ['warm', 'playful', 'factual', 'urgent'];

const TONE_EMOJI: Record<string, string> = {
  warm: '☕',
  playful: '🎉',
  factual: '📋',
  urgent: '⚡',
};

export default function RulesPage() {
  const [goal, setGoal] = useState('fill_quiet_hours');
  const [maxDiscount, setMaxDiscount] = useState(15);
  const [tone, setTone] = useState('warm');
  const [items, setItems] = useState('freshly brewed espresso, croissants, oat milk latte, sourdough toast');
  const [showToast, setShowToast] = useState(false);

  const dslString = `IF ${goal === 'fill_quiet_hours' ? 'quiet_hours' : goal === 'increase_basket' ? 'basket_value < threshold' : goal === 'first_time_visits' ? 'first_visit = true' : 'loyalty_score > 0'}
  AND weather.cold = true
  AND available_items = [${items.split(',').map(i => `"${i.trim()}"`).join(', ')}]
THEN
  max_discount = ${maxDiscount}%
  tone = ${tone}
  emotional_frame = ${tone === 'warm' ? 'warm' : tone === 'playful' ? 'social' : tone === 'urgent' ? 'comfort' : 'factual'}
  cta_urgency = ${tone === 'urgent' ? 'high' : 'medium'}`;

  const handleSave = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <>
      <Head>
        <title>City Wallet — Offer Rules Editor</title>
        <meta name="description" content="Configure offer rules for your Stuttgart merchant" />
      </Head>

      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {/* Sidebar */}
        <aside style={{
          width: 220,
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flexShrink: 0,
        }}>
          <div style={{ padding: '8px 14px', marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 28 }}>🏙️</span> CityWallet
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Merchant Portal</div>
          </div>

          <nav>
            <Link href="/">
              <div className="nav-link">📊 Analytics</div>
            </Link>
            <Link href="/rules">
              <div className="nav-link active">⚙️ Offer Rules</div>
            </Link>
          </nav>

          <div style={{ marginTop: 'auto', padding: '12px 14px', background: 'rgba(108,99,255,0.08)', borderRadius: 12, border: '1px solid var(--border-accent)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ACTIVE MERCHANT</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>Café Müller</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Stuttgart Mitte</div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: '32px 28px', overflow: 'auto' }}>
          <div style={{ maxWidth: 860 }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
                Offer Rule Editor
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
                Configure how City Wallet AI generates offers for your café
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {/* Left: Form */}
              <div className="card" style={{ height: 'fit-content' }}>
                {/* Merchant name (read-only) */}
                <div className="form-group">
                  <label className="form-label">Merchant Name</label>
                  <input
                    className="form-input"
                    type="text"
                    value="Café Müller"
                    readOnly
                    style={{ opacity: 0.6, cursor: 'not-allowed' }}
                  />
                </div>

                {/* Goal */}
                <div className="form-group">
                  <label className="form-label">Offer Goal</label>
                  <select
                    className="form-select"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                  >
                    {GOALS.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>

                {/* Max discount slider */}
                <div className="form-group">
                  <label className="form-label">
                    Max Discount — <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{maxDiscount}%</span>
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={30}
                    step={1}
                    value={maxDiscount}
                    onChange={(e) => setMaxDiscount(Number(e.target.value))}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    <span>5% (subtle)</span>
                    <span>30% (aggressive)</span>
                  </div>
                </div>

                {/* Tone */}
                <div className="form-group">
                  <label className="form-label">Tone</label>
                  <div className="radio-group">
                    {TONES.map((t) => (
                      <label key={t} className="radio-option" style={{ cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="tone"
                          value={t}
                          checked={tone === t}
                          onChange={() => setTone(t)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        {TONE_EMOJI[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Items */}
                <div className="form-group">
                  <label className="form-label">Available Items</label>
                  <textarea
                    className="form-textarea"
                    value={items}
                    onChange={(e) => setItems(e.target.value)}
                    placeholder="e.g. freshly brewed espresso, croissants, oat milk"
                    rows={3}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Comma-separated. These items can appear in generated offers.
                  </span>
                </div>

                {/* Save */}
                <button className="btn-primary" onClick={handleSave} style={{ width: '100%', marginTop: 8 }}>
                  💾 Save Offer Rules
                </button>
              </div>

              {/* Right: DSL preview + explanation */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* DSL preview */}
                <div className="card">
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                    📜 Generated Rule DSL
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                    This rule is sent to the AI offer engine when generating offers for your merchant.
                  </p>
                  <div className="dsl-box">{dslString}</div>
                </div>

                {/* How it works */}
                <div className="card">
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                    🧠 How This Works
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { step: '1', icon: '🌦️', text: 'City Wallet reads weather + time of day signals in real-time' },
                      { step: '2', icon: '🤖', text: 'Mistral AI reads your rule DSL and generates a personalised offer' },
                      { step: '3', icon: '📱', text: 'Offer is pushed to nearby users via SSE stream' },
                      { step: '4', icon: '📊', text: 'Accept and redemption rates appear on this dashboard' },
                    ].map((item) => (
                      <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: 'rgba(108,99,255,0.15)',
                          border: '1px solid var(--border-accent)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, color: 'var(--accent)',
                          flexShrink: 0,
                        }}>
                          {item.step}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, paddingTop: 4 }}>
                          <span style={{ marginRight: 6 }}>{item.icon}</span>
                          {item.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Privacy note */}
                <div style={{
                  background: 'rgba(78, 205, 196, 0.06)',
                  border: '1px solid rgba(78, 205, 196, 0.2)',
                  borderRadius: 16,
                  padding: 16,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 6 }}>
                    🔐 Privacy by Design
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    No user PII is ever shared with merchants. You see aggregate offer performance only.
                    All offer data auto-expires after 24 hours (GDPR compliant).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Toast */}
      {showToast && (
        <div className="toast">
          ✅ Offer rules saved! New offers will use these settings.
        </div>
      )}
    </>
  );
}

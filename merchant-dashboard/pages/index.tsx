// pages/index.tsx — Merchant Analytics Dashboard

import React, { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';
const MERCHANT_ID = 'cafe_muller';
const REFRESH_INTERVAL_MS = 10000;

interface DashboardData {
  merchant_id: string;
  merchant_name: string;
  total_offers_generated: number;
  total_accepted: number;
  total_redeemed: number;
  accept_rate: number;
  top_context_states: Array<{ state: string; count: number }>;
  recent_events: Array<{
    offer_id: string;
    timestamp: string;
    context_state: string;
    headline: string;
    discount_pct: number;
    status: string;
  }>;
}

interface MetricCardProps {
  icon: string;
  label: string;
  value: string | number;
  color?: string;
  sublabel?: string;
}

function MetricCard({ icon, label, value, color, sublabel }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div className="metric-value" style={color ? { backgroundImage: `linear-gradient(135deg, ${color}, ${color}99)` } as any : {}}>
        {value}
      </div>
      <div className="metric-label">{label}</div>
      {sublabel && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sublabel}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const emoji = status === 'redeemed' ? '✅' : status === 'accepted' ? '🔔' : '📋';
  return (
    <span className={`status-badge status-${status}`}>
      {emoji} {status}
    </span>
  );
}

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ts; }
}

function formatState(state: string) {
  return state.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const resp = await axios.get<DashboardData>(`${API_BASE}/merchant/${MERCHANT_ID}/dashboard`);
      setData(resp.data);
      setLastRefresh(new Date());
      setError('');
    } catch (e: any) {
      setError(`API error: ${e.message}. Make sure FastAPI is running on port 8000.`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(() => fetchData(true), REFRESH_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <>
      <Head>
        <title>City Wallet — Merchant Dashboard</title>
        <meta name="description" content="Real-time offer analytics for Stuttgart merchants" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
          {/* Logo */}
          <div style={{ padding: '8px 14px', marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 28 }}>🏙️</span> CityWallet
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Merchant Portal</div>
          </div>

          <nav>
            <Link href="/">
              <div className="nav-link active">📊 Analytics</div>
            </Link>
            <Link href="/rules">
              <div className="nav-link">⚙️ Offer Rules</div>
            </Link>
          </nav>

          {/* Merchant chip */}
          <div style={{ marginTop: 'auto', padding: '12px 14px', background: 'rgba(108,99,255,0.08)', borderRadius: 12, border: '1px solid var(--border-accent)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ACTIVE MERCHANT</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>Café Müller</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Stuttgart Mitte</div>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: '32px 28px', overflow: 'auto' }}>
          {/* Page header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
                Analytics Dashboard
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
                Real-time offer performance · Stuttgart, Germany
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {lastRefresh && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {refreshing ? '🔄 Refreshing…' : `↺ ${lastRefresh.toLocaleTimeString('de-DE')}`}
                </span>
              )}
              <button className="btn-primary" onClick={() => fetchData(true)}>
                Refresh Now
              </button>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div style={{
              background: 'rgba(255, 71, 87, 0.08)',
              border: '1px solid rgba(255, 71, 87, 0.3)',
              borderRadius: 14,
              padding: 20,
              marginBottom: 24,
              color: '#FF4757',
              fontSize: 14,
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
              <div className="spinner" />
            </div>
          )}

          {data && (
            <>
              {/* Metric cards */}
              <div className="metrics-grid">
                <MetricCard
                  icon="📋"
                  label="Offers Generated"
                  value={data.total_offers_generated}
                  sublabel="Total AI offers created"
                />
                <MetricCard
                  icon="🔔"
                  label="Accepted"
                  value={data.total_accepted}
                  color="#6C63FF"
                  sublabel="Users clicked accept"
                />
                <MetricCard
                  icon="✅"
                  label="Redeemed"
                  value={data.total_redeemed}
                  color="#4ECDC4"
                  sublabel="QR codes scanned"
                />
                <MetricCard
                  icon="📈"
                  label="Accept Rate"
                  value={`${data.accept_rate}%`}
                  color="#FF6B35"
                  sublabel="Accepted / Generated"
                />
              </div>

              {/* Context states + Table */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, marginBottom: 24 }}>
                {/* Top states */}
                <div className="card">
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                    🎯 Top Context States
                  </h2>
                  {data.top_context_states.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data yet. Generate some offers!</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {data.top_context_states.map((s, i) => {
                        const maxCount = data.top_context_states[0]?.count || 1;
                        const pct = (s.count / maxCount) * 100;
                        return (
                          <div key={s.state}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                {formatState(s.state)}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.count}</span>
                            </div>
                            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.5s' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Live feed */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      📡 Recent Offer Events
                    </h2>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Live · refreshes every 10s</span>
                  </div>
                  {data.recent_events.length === 0 ? (
                    <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                      No offers yet. Use the API or mobile app to generate offers.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Context</th>
                            <th>Headline</th>
                            <th>Disc.</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recent_events.map((e) => (
                            <tr key={e.offer_id}>
                              <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12 }}>
                                {formatTime(e.timestamp)}
                              </td>
                              <td>
                                <span style={{
                                  fontSize: 11,
                                  background: 'rgba(108,99,255,0.1)',
                                  color: 'var(--accent)',
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  fontWeight: 600,
                                }}>
                                  {formatState(e.context_state)}
                                </span>
                              </td>
                              <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {e.headline || '—'}
                              </td>
                              <td style={{ color: 'var(--accent)', fontWeight: 700 }}>
                                {e.discount_pct ? `${e.discount_pct}%` : '—'}
                              </td>
                              <td><StatusBadge status={e.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Context state legend */}
              <div className="card">
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                  🌍 Active Context States
                </h2>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[
                    { name: 'RAINY_QUIET_LUNCH', emoji: '🌧️', frame: 'warm', color: '#FF6B35' },
                    { name: 'SUNNY_BUSY_EVENING', emoji: '☀️', frame: 'social', color: '#6C63FF' },
                    { name: 'COLD_ANY_MORNING', emoji: '❄️', frame: 'comfort', color: '#4ECDC4' },
                    { name: 'GENERIC_BROWSE', emoji: '📋', frame: 'factual', color: '#8B8FA8' },
                  ].map((s) => (
                    <div key={s.name} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 14px',
                      background: `${s.color}10`,
                      borderRadius: 12,
                      border: `1px solid ${s.color}30`,
                    }}>
                      <span>{s.emoji}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: s.color }}>
                          {formatState(s.name)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {s.frame}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}

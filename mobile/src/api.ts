// api.ts — Central API client for City Wallet mobile

import axios from 'axios';
import Constants from 'expo-constants';

const BASE_URL = (Constants.expoConfig?.extra?.API_BASE_URL as string) || 'http://localhost:8000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

export interface ContextPayload {
  context_state: string;
  offer_archetype: string;
  emotional_frame: string;
  signals: Record<string, string>;
  intent: { intent: string; urgency: string; confidence: number };
  timestamp: string;
  demo_mode?: boolean;
}

export interface Offer {
  offer_id: string;
  headline: string;
  sub_copy: string;
  discount_pct: number;
  discount_label: string;
  emotional_frame: string;
  expiry_minutes: number;
  category_keyword: string;
  cta_text: string;
  context_state: string;
  merchant: {
    id: string;
    name: string;
    type: string;
    lat: number;
    lon: number;
  };
  intent?: {
    intent: string;
    urgency: string;
    confidence: number;
    source?: string;
  };
}

export interface ClientIntent {
  intent: 'warm_drink' | 'hot_food' | 'browse' | 'commute' | 'dining';
  urgency: 'low' | 'medium' | 'high';
  confidence: number;
}

export interface AcceptResponse {
  offer_id: string;
  token: string;
  qr_data: string;
  merchant_name: string;
  discount_label: string;
  expiry_seconds: number;
}

export interface RedeemResponse {
  success: boolean;
  merchant_name?: string;
  discount_label?: string;
  cashback_message?: string;
  error?: string;
}

export const apiClient = {
  getContext: (demo = false) =>
    api.get<ContextPayload>(`/context${demo ? '?demo=true' : ''}`),

  getMerchants: () => api.get('/merchants'),

  generateOffer: (merchantId: string, sessionId: string, clientIntent?: ClientIntent) =>
    api.post<Offer>('/offers/generate', {
      merchant_id: merchantId,
      session_id: sessionId,
      client_intent: clientIntent,
    }),

  getOffer: (offerId: string) => api.get<Offer>(`/offers/${offerId}`),

  acceptOffer: (offerId: string, sessionId: string) =>
    api.post<AcceptResponse>(`/offers/${offerId}/accept`, {
      session_id: sessionId,
    }),

  redeemToken: (token: string) =>
    api.post<RedeemResponse>(`/redeem/${token}`),
};

export { BASE_URL };

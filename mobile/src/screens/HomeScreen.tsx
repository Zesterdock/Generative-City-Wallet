// HomeScreen.tsx — Main offer feed screen

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { apiClient, Offer, ContextPayload, ClientIntent } from '../api';
import OfferCard from '../components/OfferCard';
import { BASE_URL } from '../api';
import { inferIntentOnDevice } from '../onDeviceSlm';
import Constants from 'expo-constants';

// Simple UUID generator (no crypto needed in RN)
const genSessionId = () =>
  'session-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

const NEARBY_MERCHANTS = ['cafe_muller', 'bistro_central', 'bakery_hoffmann'];

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [sessionId, setSessionId] = useState<string>('');
  const [context, setContext] = useState<ContextPayload | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState('Initialising…');
  const [locationGranted, setLocationGranted] = useState(false);
  const [localIntent, setLocalIntent] = useState<ClientIntent | null>(null);

  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Shimmer loop for loading skeleton
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    bootstrap();
  }, []);

  const bootstrap = async () => {
    // Get or create session ID
    let sid = await AsyncStorage.getItem('session_id');
    if (!sid) {
      sid = genSessionId();
      await AsyncStorage.setItem('session_id', sid);
    }
    setSessionId(sid);

    // Request location
    setStatusText('Requesting location…');
    const { status } = await Location.requestForegroundPermissionsAsync();
    setLocationGranted(status === 'granted');

    // Fetch context (use demo mode for reliability)
    setStatusText('Reading city context…');
    let localIntentResult: ClientIntent | null = null;
    try {
      const ctxResp = await apiClient.getContext(true); // demo=true for hackathon
      setContext(ctxResp.data);

      // On-device SLM intent inference. Only abstract intent is sent upstream.
      localIntentResult = await inferIntentOnDevice({
        weather: String(ctxResp.data.signals?.weather_condition || 'unknown'),
        tod: String(ctxResp.data.signals?.tod_bucket || 'afternoon'),
        movement_speed: 'slow',
        dwell_time_seconds: 75,
      });
      setLocalIntent(localIntentResult);
    } catch (e) {
      console.warn('Context fetch failed', e);
    }

    // Pick a nearby merchant
    const merchantId = NEARBY_MERCHANTS[Math.floor(Math.random() * NEARBY_MERCHANTS.length)];

    // Subscribe to SSE stream BEFORE generating so we don't miss the event
    subscribeToStream(sid);

    // Generate offer
    setStatusText('Generating your offer with AI…');
    try {
      const offerResp = await apiClient.generateOffer(merchantId, sid, localIntentResult || undefined);
      setOffer(offerResp.data);
    } catch (e) {
      console.warn('Offer generation failed', e);
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const subscribeToStream = (sid: string) => {
    // SSE via EventSource polyfill (fetch-based)
    const url = `${BASE_URL}/offers/stream/${sid}`;
    let es: any;
    try {
      // Use native fetch streaming if EventSource not available
      es = new (global as any).EventSource(url);
      es.addEventListener('offer', (e: any) => {
        try {
          const incoming: Offer = JSON.parse(e.data);
          setOffer(incoming);
          setLoading(false);
        } catch {}
      });
      es.onerror = () => es?.close();
    } catch {
      // Fallback: EventSource not available in this environment, rely on direct API call above
    }
  };

  const handleAccept = async () => {
    if (!offer) return;
    try {
      const resp = await apiClient.acceptOffer(offer.offer_id, sessionId);
      navigation.navigate('Redemption', {
        acceptData: resp.data,
        offer,
      });
    } catch (e) {
      Alert.alert('Error', 'Could not accept offer. Please try again.');
    }
  };

  const handleDismiss = () => {
    setOffer(null);
    setLoading(true);
    setStatusText('Finding another offer…');
    setTimeout(() => bootstrap(), 800);
  };

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerGreeting}>
              {new Date().getHours() < 12 ? 'Good morning ☀️' : new Date().getHours() < 18 ? 'Good afternoon 🌤' : 'Good evening 🌙'}
            </Text>
            <Text style={styles.headerTitle}>City Wallet</Text>
          </View>
          <View style={styles.locationBadge}>
            <Text style={styles.locationText}>📍 Stuttgart</Text>
          </View>
        </View>

        {/* Context chip */}
        {context && (
          <View style={styles.contextChip}>
            <Text style={styles.contextChipText}>
              🌍 {context.context_state.replace(/_/g, ' ')}
              {context.demo_mode ? ' · DEMO' : ''}
            </Text>
          </View>
        )}

        {/* Loading skeleton */}
        {loading && (
          <View style={styles.skeletonContainer}>
            <Animated.View style={[styles.skeletonImage, { opacity: shimmerOpacity }]} />
            <View style={styles.skeletonContent}>
              <Animated.View style={[styles.skeletonLine, { width: '80%', opacity: shimmerOpacity }]} />
              <Animated.View style={[styles.skeletonLine, { width: '60%', opacity: shimmerOpacity }]} />
              <Animated.View style={[styles.skeletonLine, { width: '40%', opacity: shimmerOpacity }]} />
            </View>
            <Text style={styles.loadingText}>{statusText}</Text>
            <ActivityIndicator color="#6C63FF" style={{ marginTop: 12 }} />
          </View>
        )}

        {/* Offer card */}
        {!loading && offer && (
          <OfferCard
            offer={offer}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
            distanceMeters={Math.floor(Math.random() * 150) + 50}
          />
        )}

        {/* Intent chip */}
        {context?.intent && !loading && (
          <View style={styles.intentRow}>
            <View style={styles.intentBadge}>
              <Text style={styles.intentText}>
                🧠 Local AI ({Constants.expoConfig?.extra?.SLM_MODEL || 'Heuristic'}): {localIntent?.intent || context.intent.intent} · Urgency: {localIntent?.urgency || context.intent.urgency}
              </Text>
            </View>
          </View>
        )}

        {/* Refresh button */}
        {!loading && (
          <TouchableOpacity style={styles.refreshBtn} onPress={() => {
            setOffer(null);
            setLoading(true);
            bootstrap();
          }}>
            <Text style={styles.refreshText}>🔄 Generate New Offer</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F1A' },
  scroll: { flex: 1 },
  container: { paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  headerGreeting: { color: '#8B8FA8', fontSize: 13, marginBottom: 2 },
  headerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  locationBadge: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
  },
  locationText: { color: '#6C63FF', fontSize: 13, fontWeight: '600' },
  contextChip: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  contextChipText: { color: '#8B8FA8', fontSize: 12 },
  skeletonContainer: {
    marginHorizontal: 16,
    backgroundColor: '#1A1A2E',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingBottom: 24,
  },
  skeletonImage: { width: '100%', height: 200, backgroundColor: '#2A2A3E' },
  skeletonContent: { padding: 20, gap: 12 },
  skeletonLine: { height: 16, backgroundColor: '#2A2A3E', borderRadius: 8 },
  loadingText: { color: '#8B8FA8', textAlign: 'center', fontSize: 14, marginTop: 20 },
  intentRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16, paddingHorizontal: 16 },
  intentBadge: {
    backgroundColor: 'rgba(108, 99, 255, 0.08)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
  },
  intentText: { color: '#6C63FF', fontSize: 12, fontWeight: '600' },
  refreshBtn: {
    margin: 20,
    marginTop: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  refreshText: { color: '#8B8FA8', fontSize: 15 },
});

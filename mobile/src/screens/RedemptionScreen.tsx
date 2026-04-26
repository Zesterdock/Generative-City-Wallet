// RedemptionScreen.tsx — QR code display with 60s countdown

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { apiClient, AcceptResponse, Offer } from '../api';

type Params = {
  Redemption: {
    acceptData: AcceptResponse;
    offer: Offer;
  };
};

const COUNTDOWN_SECONDS = 60;

export default function RedemptionScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<Params, 'Redemption'>>();
  const { acceptData, offer } = route.params;

  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [status, setStatus] = useState<'active' | 'expired' | 'confirmed'>('active');
  const [cashbackMessage, setCashbackMessage] = useState('');

  const progressAnim = useRef(new Animated.Value(1)).current;
  const confirmAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // QR pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // 60s countdown
  useEffect(() => {
    if (status !== 'active') return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1;
        Animated.timing(progressAnim, {
          toValue: next / COUNTDOWN_SECONDS,
          duration: 900,
          useNativeDriver: false,
        }).start();
        if (next <= 0) {
          clearInterval(timer);
          setStatus('expired');
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Auto-redeem after 3s for demo
  useEffect(() => {
    const t = setTimeout(async () => {
      if (status !== 'active') return;
      try {
        const resp = await apiClient.redeemToken(acceptData.token);
        if (resp.data.success) {
          setCashbackMessage(resp.data.cashback_message || '🎉 Cashback confirmed!');
          setStatus('confirmed');
          Animated.spring(confirmAnim, {
            toValue: 1,
            friction: 6,
            tension: 50,
            useNativeDriver: true,
          }).start();
        }
      } catch (e) {
        console.warn('Auto-redeem failed', e);
      }
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  const progressBarColor = secondsLeft < 20 ? '#FF4757' : '#6C63FF';
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  if (status === 'confirmed') {
    return (
      <SafeAreaView style={styles.safe}>
        <Animated.View
          style={[
            styles.confirmedContainer,
            {
              transform: [{ scale: confirmAnim }],
              opacity: confirmAnim,
            },
          ]}
        >
          <Text style={styles.confirmedIcon}>✅</Text>
          <Text style={styles.confirmedTitle}>Cashback Confirmed!</Text>
          <Text style={styles.confirmedMerchant}>{acceptData.merchant_name}</Text>
          <Text style={styles.confirmedDiscount}>{acceptData.discount_label}</Text>
          <Text style={styles.confirmedMessage}>{cashbackMessage}</Text>

          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => navigation.navigate('Home' as never)}
          >
            <Text style={styles.doneText}>Back to Offers</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (status === 'expired') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.expiredContainer}>
          <Text style={styles.expiredIcon}>⏰</Text>
          <Text style={styles.expiredTitle}>Offer Expired</Text>
          <Text style={styles.expiredSub}>This QR code is no longer valid.</Text>
          <TouchableOpacity
            style={styles.newOfferButton}
            onPress={() => navigation.navigate('Home' as never)}
          >
            <Text style={styles.newOfferText}>Generate New Offer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Redeem Offer</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Merchant info */}
        <View style={styles.merchantCard}>
          <Text style={styles.merchantName}>{acceptData.merchant_name}</Text>
          <Text style={styles.discountLabel}>{acceptData.discount_label}</Text>
        </View>

        {/* QR Code */}
        <View style={styles.qrSection}>
          <Text style={styles.qrInstruction}>Show this QR at the counter</Text>
          <Animated.View
            style={[styles.qrContainer, { transform: [{ scale: pulseAnim }] }]}
          >
            <QRCode
              value={acceptData.qr_data}
              size={220}
              color="#1A1A2E"
              backgroundColor="#FFFFFF"
              ecl="H"
            />
          </Animated.View>
        </View>

        {/* Countdown */}
        <View style={styles.countdownSection}>
          <Text style={[styles.countdown, { color: secondsLeft < 20 ? '#FF4757' : '#6C63FF' }]}>
            {secondsLeft}s
          </Text>
          <Text style={styles.countdownLabel}>until this code expires</Text>
          <View style={styles.progressBg}>
            <Animated.View
              style={[styles.progressBar, { width: progressWidth, backgroundColor: progressBarColor }]}
            />
          </View>
        </View>

        {/* Security note */}
        <View style={styles.securityNote}>
          <Text style={styles.securityText}>
            🔐 Signed with JWT · One-time use · Auto-expires in 60s
          </Text>
        </View>

        {/* Offer details */}
        <View style={styles.offerDetails}>
          <Text style={styles.offerDetailTitle}>{offer.headline}</Text>
          <Text style={styles.offerDetailSub}>{offer.sub_copy}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F1A' },
  container: { paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backBtn: { paddingHorizontal: 4, paddingVertical: 8 },
  backText: { color: '#6C63FF', fontSize: 16 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  merchantCard: {
    margin: 16,
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    alignItems: 'center',
  },
  merchantName: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  discountLabel: { color: '#6C63FF', fontSize: 16, fontWeight: '600' },
  qrSection: { alignItems: 'center', paddingVertical: 24 },
  qrInstruction: { color: '#8B8FA8', fontSize: 14, marginBottom: 20 },
  qrContainer: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  countdownSection: { alignItems: 'center', paddingHorizontal: 40, marginBottom: 20 },
  countdown: { fontSize: 56, fontWeight: '900', letterSpacing: -2 },
  countdownLabel: { color: '#8B8FA8', fontSize: 13, marginBottom: 12 },
  progressBg: {
    height: 4,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: { height: '100%', borderRadius: 2 },
  securityNote: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(78, 205, 196, 0.08)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.2)',
    marginBottom: 20,
  },
  securityText: { color: '#4ECDC4', fontSize: 12 },
  offerDetails: { paddingHorizontal: 20 },
  offerDetailTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  offerDetailSub: { color: '#8B8FA8', fontSize: 13 },
  confirmedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  confirmedIcon: { fontSize: 72, marginBottom: 24 },
  confirmedTitle: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  confirmedMerchant: { color: '#8B8FA8', fontSize: 18, marginBottom: 8 },
  confirmedDiscount: { color: '#6C63FF', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  confirmedMessage: { color: '#CCCCDD', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 40 },
  doneButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 40,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  doneText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  expiredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  expiredIcon: { fontSize: 72, marginBottom: 24 },
  expiredTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  expiredSub: { color: '#8B8FA8', fontSize: 15, marginBottom: 40 },
  newOfferButton: {
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderWidth: 1,
    borderColor: '#6C63FF',
  },
  newOfferText: { color: '#6C63FF', fontSize: 16, fontWeight: '700' },
});

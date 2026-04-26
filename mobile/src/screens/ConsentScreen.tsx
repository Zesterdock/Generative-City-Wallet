// consent.tsx — GDPR consent screen shown on first app launch

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  BackHandler,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Props {
  onConsent: () => void;
}

export default function ConsentScreen({ onConsent }: Props) {
  const handleAgree = async () => {
    await AsyncStorage.setItem('gdpr_consent', 'true');
    onConsent();
  };

  const handleDecline = () => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Shield icon placeholder */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🛡️</Text>
        </View>

        <Text style={styles.title}>Your Privacy Matters</Text>
        <Text style={styles.subtitle}>City Wallet is built with privacy by design</Text>

        <View style={styles.card}>
          <View style={styles.point}>
            <Text style={styles.pointIcon}>📍</Text>
            <View style={styles.pointText}>
              <Text style={styles.pointTitle}>Location stays on your device</Text>
              <Text style={styles.pointDesc}>
                Your GPS coordinates are processed locally. We only send a generalised
                intent signal (e.g. "looking for warm drink") — never your exact location.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.point}>
            <Text style={styles.pointIcon}>🔐</Text>
            <View style={styles.pointText}>
              <Text style={styles.pointTitle}>No personal data leaves your device</Text>
              <Text style={styles.pointDesc}>
                No name, no phone number, no purchase history. Your session uses an
                anonymous random ID that changes each day.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.point}>
            <Text style={styles.pointIcon}>🌦️</Text>
            <View style={styles.pointText}>
              <Text style={styles.pointTitle}>Context signals only</Text>
              <Text style={styles.pointDesc}>
                We use weather conditions, time of day, and your movement speed to
                personalise offers. That's it.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.point}>
            <Text style={styles.pointIcon}>🗑️</Text>
            <View style={styles.pointText}>
              <Text style={styles.pointTitle}>Offers expire and are deleted</Text>
              <Text style={styles.pointDesc}>
                All offer data is automatically purged after 24 hours. Nothing is
                stored long-term.
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.legal}>
          By tapping "I Agree" you consent to City Wallet using anonymous contextual
          signals to generate hyper-local offers near you. Compliant with GDPR Article 6(1)(a).
        </Text>

        <TouchableOpacity style={styles.agreeButton} onPress={handleAgree} activeOpacity={0.8}>
          <Text style={styles.agreeText}>I Agree — Show Me Offers</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.declineButton} onPress={handleDecline} activeOpacity={0.7}>
          <Text style={styles.declineText}>Decline & Close App</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0F0F1A',
  },
  container: {
    padding: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 20,
  },
  icon: {
    fontSize: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#8B8FA8',
    textAlign: 'center',
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    marginBottom: 20,
  },
  point: {
    flexDirection: 'row',
    paddingVertical: 12,
    gap: 14,
  },
  pointIcon: {
    fontSize: 22,
    marginTop: 2,
  },
  pointText: {
    flex: 1,
  },
  pointTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  pointDesc: {
    fontSize: 13,
    color: '#8B8FA8',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  legal: {
    fontSize: 12,
    color: '#5A5F7A',
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
    marginBottom: 28,
  },
  agreeButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  agreeText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  declineButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  declineText: {
    color: '#5A5F7A',
    fontSize: 14,
  },
});

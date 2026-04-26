// OfferCard.tsx — The 3-second comprehension offer card

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { Offer } from '../api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  offer: Offer;
  onAccept: () => void;
  onDismiss: () => void;
  distanceMeters?: number;
}

const FRAME_COLORS: Record<string, string> = {
  warm: '#FF6B35',
  social: '#6C63FF',
  comfort: '#4ECDC4',
  factual: '#A8DADC',
};

export default function OfferCard({ offer, onAccept, onDismiss, distanceMeters = 80 }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(offer.expiry_minutes * 60);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const accentColor = FRAME_COLORS[offer.emotional_frame] || '#6C63FF';
  const imageUrl = `https://source.unsplash.com/400x220/?${offer.category_keyword},cafe,food`;
  const totalSeconds = offer.expiry_minutes * 60;

  // Card entrance animation
  useEffect(() => {
    Animated.spring(cardAnim, {
      toValue: 1,
      friction: 8,
      tension: 50,
      useNativeDriver: true,
    }).start();

    // Pulsing glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        Animated.timing(progressAnim, {
          toValue: next / totalSeconds,
          duration: 900,
          useNativeDriver: false,
        }).start();
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const urgencyColor = secondsLeft < 120 ? '#FF4757' : accentColor;

  if (secondsLeft <= 0) {
    return (
      <View style={styles.expiredCard}>
        <Text style={styles.expiredIcon}>⏰</Text>
        <Text style={styles.expiredTitle}>Offer Expired</Text>
        <Text style={styles.expiredSub}>New offers are being generated…</Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.card,
        {
          transform: [
            { scale: cardAnim },
            {
              translateY: cardAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [60, 0],
              }),
            },
          ],
          opacity: cardAnim,
          borderColor: accentColor,
        },
      ]}
    >
      {/* Hero Image */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={[styles.imageOverlay, { backgroundColor: accentColor + '40' }]} />

        {/* Frame badge */}
        <View style={[styles.frameBadge, { backgroundColor: accentColor }]}>
          <Text style={styles.frameBadgeText}>
            {offer.emotional_frame === 'warm' ? '☕ Cosy'
              : offer.emotional_frame === 'social' ? '🎉 Social'
              : offer.emotional_frame === 'comfort' ? '🤗 Comfort'
              : '📋 Deal'}
          </Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Headline */}
        <Text style={styles.headline}>{offer.headline}</Text>
        <Text style={styles.subCopy}>{offer.sub_copy}</Text>

        {/* Discount pill */}
        <View style={[styles.discountPill, { backgroundColor: accentColor + '20', borderColor: accentColor }]}>
          <Text style={[styles.discountText, { color: accentColor }]}>
            🏷️ {offer.discount_label}
          </Text>
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeIcon}>📍</Text>
            <Text style={styles.badgeText}>{distanceMeters}m away</Text>
          </View>
          <View style={[styles.badge, { borderColor: urgencyColor }]}>
            <Text style={styles.badgeIcon}>⏱</Text>
            <Text style={[styles.badgeText, { color: urgencyColor }]}>{formatTime(secondsLeft)}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeIcon}>💳</Text>
            <Text style={styles.badgeText}>Tap to save</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBg}>
          <Animated.View
            style={[styles.progressBar, { width: progressWidth, backgroundColor: urgencyColor }]}
          />
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          style={[styles.acceptButton, { backgroundColor: accentColor }]}
          onPress={onAccept}
          activeOpacity={0.85}
        >
          <Text style={styles.acceptText}>{offer.cta_text || 'Accept Offer'}</Text>
          <Text style={styles.acceptArrow}>→</Text>
        </TouchableOpacity>

        {/* Dismiss */}
        <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
          <Text style={styles.dismissText}>Not interested</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: 16,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  imageContainer: {
    height: 200,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  frameBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  frameBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    padding: 20,
  },
  headline: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 32,
    marginBottom: 8,
  },
  subCopy: {
    fontSize: 15,
    color: '#8B8FA8',
    lineHeight: 21,
    marginBottom: 16,
  },
  discountPill: {
    borderWidth: 1,
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  discountText: {
    fontSize: 14,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 4,
  },
  badgeIcon: {
    fontSize: 11,
  },
  badgeText: {
    color: '#CCCCDD',
    fontSize: 11,
    fontWeight: '600',
  },
  progressBg: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginBottom: 18,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  acceptButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 12,
    gap: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  acceptText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  acceptArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  dismissBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dismissText: {
    color: '#5A5F7A',
    fontSize: 13,
  },
  expiredCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 24,
    padding: 40,
    marginHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  expiredIcon: { fontSize: 44, marginBottom: 16 },
  expiredTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  expiredSub: { color: '#8B8FA8', fontSize: 14 },
});

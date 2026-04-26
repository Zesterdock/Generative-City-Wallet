// App.tsx — Root navigator with consent gate

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';

import ConsentScreen from './src/screens/ConsentScreen';
import HomeScreen from './src/screens/HomeScreen';
import RedemptionScreen from './src/screens/RedemptionScreen';

const Stack = createStackNavigator();

export default function App() {
  const [consentGiven, setConsentGiven] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('gdpr_consent').then((val) => {
      setConsentGiven(val === 'true');
    });
  }, []);

  if (consentGiven === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F0F1A', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#6C63FF" size="large" />
        <StatusBar style="light" />
      </View>
    );
  }

  if (!consentGiven) {
    return (
      <>
        <StatusBar style="light" />
        <ConsentScreen onConsent={() => setConsentGiven(true)} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: '#0F0F1A' },
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="Redemption"
            component={RedemptionScreen}
            options={{
              presentation: 'modal',
              gestureEnabled: true,
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

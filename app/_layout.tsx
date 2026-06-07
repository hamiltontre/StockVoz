import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SesionProvider } from '../src/context/SesionContext';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { getDb } from '../src/database/db';

export default function RootLayout() {
  useEffect(() => {
    getDb().catch(console.error);
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <SesionProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </SesionProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

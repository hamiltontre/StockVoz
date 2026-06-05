import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDb } from '../src/database/db';

export default function RootLayout() {
  useEffect(() => {
    // Inicializar la BD al arrancar la app
    getDb().catch(console.error);
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

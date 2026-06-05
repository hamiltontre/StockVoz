import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>StockVoz</Text>
      <Text style={styles.subtitulo}>Cargando...</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#38bdf8',
    marginBottom: 8,
  },
  subtitulo: {
    fontSize: 16,
    color: '#94a3b8',
  },
});
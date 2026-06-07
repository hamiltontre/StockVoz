import { View, ActivityIndicator } from 'react-native';

// SesionContext se encarga del ruteo inicial.
// Esta pantalla solo muestra un spinner mientras carga la DB.
export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#38bdf8" size="large" />
    </View>
  );
}

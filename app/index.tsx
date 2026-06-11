import { View, ActivityIndicator } from 'react-native';
import { COLORES as C } from '../src/theme/colors';

// SesionContext se encarga del ruteo inicial.
// Esta pantalla solo muestra un spinner mientras carga la DB.
export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: C.fondo, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.acento} size="large" />
    </View>
  );
}

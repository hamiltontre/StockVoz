import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useConectividad } from '../hooks/useConectividad';
import { COLORES as C } from '../theme/colors';

/**
 * Barra fina que aparece solo cuando NO hay internet.
 * En modo offline todo funciona igual — este indicador es solo informativo.
 */
export function IndicadorConectividad() {
  const { conectado } = useConectividad();

  // null = verificando aún, true = online (no mostrar nada)
  if (conectado !== false) return null;

  return (
    <View style={s.barra}>
      <Ionicons name="cloud-offline-outline" size={14} color={C.amarillo} />
      <Text style={s.texto}>Sin internet — modo offline activo</Text>
    </View>
  );
}

const s = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.amarilloClaro,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.amarillo,
  },
  texto: {
    fontSize: 12,
    color: C.amarillo,
    fontWeight: '600',
  },
});

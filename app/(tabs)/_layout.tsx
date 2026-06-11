import { View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { IndicadorConectividad } from '../../src/components/IndicadorConectividad';
import { useAlertas } from '../../src/hooks/useAlertas';
import { COLORES as C } from '../../src/theme/colors';

export default function TabsLayout() {
  const { totalAlertas } = useAlertas();

  return (
    <View style={{ flex: 1, backgroundColor: C.fondo }}>
      <IndicadorConectividad />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: C.tarjeta,
            borderTopColor: C.borde,
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: C.acento,
          tabBarInactiveTintColor: C.textoTenue,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="ventas"
          options={{
            title: 'Ventas',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="cart-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="inventario"
          options={{
            title: 'Inventario',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="cube-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="alertas"
          options={{
            title: 'Alertas',
            tabBarIcon: ({ color, size }) => (
              <View>
                <Ionicons name="notifications-outline" size={size} color={color} />
                {totalAlertas > 0 && (
                  <View style={ts.badge}>
                    <Text style={ts.badgeTexto}>
                      {totalAlertas > 9 ? '9+' : totalAlertas}
                    </Text>
                  </View>
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="reportes"
          options={{
            title: 'Reportes',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="bar-chart-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const ts = StyleSheet.create({
  badge: {
    position: 'absolute', top: -4, right: -6,
    backgroundColor: C.rojo, borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTexto: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
});

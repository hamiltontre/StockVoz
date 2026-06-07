import { View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { IndicadorConectividad } from '../../src/components/IndicadorConectividad';
import { useStockBajo } from '../../src/hooks/useStockBajo';

const COLORES = {
  fondo: '#0f172a',
  tarjeta: '#1e293b',
  activo: '#38bdf8',
  inactivo: '#475569',
};

export default function TabsLayout() {
  const { cantidad: stockBajoCantidad } = useStockBajo();

  return (
    <View style={{ flex: 1, backgroundColor: COLORES.fondo }}>
      <IndicadorConectividad />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORES.tarjeta,
            borderTopColor: '#334155',
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: COLORES.activo,
          tabBarInactiveTintColor: COLORES.inactivo,
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
              <View>
                <Ionicons name="cube-outline" size={size} color={color} />
                {stockBajoCantidad > 0 && (
                  <View style={ts.badge}>
                    <Text style={ts.badgeTexto}>
                      {stockBajoCantidad > 9 ? '9+' : stockBajoCantidad}
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
    backgroundColor: '#f87171', borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTexto: { color: '#0f172a', fontSize: 9, fontWeight: '800' },
});

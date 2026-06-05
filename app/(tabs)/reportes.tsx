import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVentas } from '../../src/hooks/useVentas';
import { VentaRepository } from '../../src/database/repositories/VentaRepository';
import { centavosACordobas } from '../../src/utils/money';
import type { Venta } from '../../src/types';

const C = {
  fondo: '#0f172a',
  tarjeta: '#1e293b',
  borde: '#334155',
  texto: '#f1f5f9',
  subtexto: '#94a3b8',
  acento: '#38bdf8',
  verde: '#4ade80',
  rojo: '#f87171',
};

function formatearFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-NI', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PantallaReportes() {
  const { ventas, cargando, resumenHoy, cargarRecientes, anularVenta } = useVentas();

  useEffect(() => { cargarRecientes(); }, [cargarRecientes]);

  const confirmarAnular = (venta: Venta) => {
    Alert.alert(
      'Anular venta',
      `¿Anular venta #${venta.id} por ${centavosACordobas(venta.total)}? El stock será repuesto.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Anular',
          style: 'destructive',
          onPress: async () => {
            const err = await anularVenta(venta.id);
            if (err) Alert.alert('Error', err);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.pantalla}>
      <View style={s.header}>
        <Text style={s.titulo}>Reportes</Text>
        <TouchableOpacity onPress={cargarRecientes}>
          <Ionicons name="refresh-outline" size={22} color={C.acento} />
        </TouchableOpacity>
      </View>

      {/* Resumen del día */}
      <View style={s.resumenContainer}>
        <View style={s.resumenCard}>
          <Ionicons name="receipt-outline" size={22} color={C.acento} />
          <Text style={s.resumenNumero}>{resumenHoy.total_ventas}</Text>
          <Text style={s.resumenLabel}>Ventas hoy</Text>
        </View>
        <View style={s.resumenCard}>
          <Ionicons name="cash-outline" size={22} color={C.verde} />
          <Text style={[s.resumenNumero, { color: C.verde }]}>
            {centavosACordobas(resumenHoy.total_monto)}
          </Text>
          <Text style={s.resumenLabel}>Ingresos hoy</Text>
        </View>
      </View>

      <Text style={s.seccionTitulo}>Últimas ventas</Text>

      {cargando && !ventas.length ? (
        <View style={s.centrado}>
          <ActivityIndicator color={C.acento} size="large" />
        </View>
      ) : (
        <FlatList
          data={ventas}
          keyExtractor={(v) => String(v.id)}
          contentContainerStyle={s.lista}
          ListEmptyComponent={
            <View style={s.vacio}>
              <Ionicons name="receipt-outline" size={48} color={C.borde} />
              <Text style={s.vacioTexto}>Sin ventas registradas</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[s.ventaCard, item.estado === 'anulada' && s.ventaCardAnulada]}>
              <View style={s.ventaInfo}>
                <Text style={s.ventaId}>Venta #{item.id}</Text>
                <Text style={s.ventaFecha}>{formatearFecha(item.creado_en)}</Text>
                <View style={s.ventaMeta}>
                  <Text style={s.ventaMetodo}>{item.metodo_pago}</Text>
                  {item.estado === 'anulada' && (
                    <View style={s.anulada}>
                      <Text style={s.anuladaTexto}>ANULADA</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={s.ventaDerecha}>
                <Text style={[s.ventaTotal, item.estado === 'anulada' && { color: C.subtexto }]}>
                  {centavosACordobas(item.total)}
                </Text>
                {item.estado === 'completada' && (
                  <TouchableOpacity onPress={() => confirmarAnular(item)} style={s.btnAnular}>
                    <Ionicons name="close-circle-outline" size={20} color={C.rojo} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  titulo: { fontSize: 24, fontWeight: '700', color: C.texto },
  resumenContainer: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginBottom: 20 },
  resumenCard: {
    flex: 1,
    backgroundColor: C.tarjeta,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.borde,
    alignItems: 'center',
    gap: 6,
  },
  resumenNumero: { fontSize: 20, fontWeight: '800', color: C.acento },
  resumenLabel: { fontSize: 12, color: C.subtexto, fontWeight: '600' },
  seccionTitulo: {
    fontSize: 13,
    fontWeight: '700',
    color: C.subtexto,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lista: { paddingHorizontal: 20, paddingBottom: 16, flexGrow: 1 },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  vacioTexto: { fontSize: 16, color: C.subtexto, fontWeight: '600' },
  ventaCard: {
    backgroundColor: C.tarjeta,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.borde,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ventaCardAnulada: { opacity: 0.5 },
  ventaInfo: { flex: 1 },
  ventaId: { fontSize: 15, fontWeight: '700', color: C.texto },
  ventaFecha: { fontSize: 12, color: C.subtexto, marginTop: 2 },
  ventaMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  ventaMetodo: {
    fontSize: 11,
    color: C.acento,
    backgroundColor: '#0c2233',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  anulada: {
    backgroundColor: '#3a0808',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  anuladaTexto: { color: C.rojo, fontSize: 10, fontWeight: '800' },
  ventaDerecha: { alignItems: 'flex-end', gap: 8 },
  ventaTotal: { fontSize: 17, fontWeight: '800', color: C.texto },
  btnAnular: { padding: 2 },
});

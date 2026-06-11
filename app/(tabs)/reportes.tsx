import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useVentas } from '../../src/hooks/useVentas';
import { useSesion } from '../../src/context/SesionContext';
import { VentaRepository } from '../../src/database/repositories/VentaRepository';
import { ProductoRepository } from '../../src/database/repositories/ProductoRepository';
import { centavosACordobas } from '../../src/utils/money';
import type { Venta, Producto } from '../../src/types';

import { COLORES as C } from '../../src/theme/colors';
type Periodo = 7 | 30;

interface Metricas {
  total_ventas: number;
  total_monto: number;
  promedio_venta: number;
  total_anuladas: number;
}

interface ProductoTop {
  nombre_producto: string;
  total_cantidad: number;
  total_monto: number;
}

interface MetodoPago {
  metodo_pago: string;
  total_ventas: number;
  total_monto: number;
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-NI', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function formatearFechaCorta(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00');
  return d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short' });
}

export default function PantallaReportes() {
  const router = useRouter();
  const { sesion } = useSesion();
  const { ventas, cargando: cargandoVentas, resumenHoy, cargarRecientes, anularVenta } = useVentas();

  const [periodo, setPeriodo] = useState<Periodo>(7);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [topProductos, setTopProductos] = useState<ProductoTop[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([]);
  const [stockBajo, setStockBajo] = useState<Producto[]>([]);
  const [rentabilidad, setRentabilidad] = useState<{
    ganancia_total: number;
    margen_promedio: number;
    productos_sin_costo: number;
  } | null>(null);
  const [cargandoMetricas, setCargandoMetricas] = useState(true);
  const [vista, setVista] = useState<'resumen' | 'historial'>('resumen');

  const cargarMetricas = useCallback(async () => {
    setCargandoMetricas(true);
    const [resumenR, topR, metodosR, stockR, rentR] = await Promise.all([
      VentaRepository.resumenPeriodo(periodo),
      VentaRepository.productosMasVendidos(5),
      VentaRepository.ventasPorMetodoPago(),
      ProductoRepository.obtenerStockBajo(),
      ProductoRepository.obtenerRentabilidad(periodo),
    ]);
    if (resumenR.ok) setMetricas(resumenR.data);
    if (topR.ok) setTopProductos(topR.data);
    if (metodosR.ok) setMetodosPago(metodosR.data);
    if (stockR.ok) setStockBajo(stockR.data);
    if (rentR.ok) setRentabilidad(rentR.data);
    setCargandoMetricas(false);
  }, [periodo]);

  useEffect(() => {
    cargarRecientes();
    cargarMetricas();
  }, [cargarRecientes, cargarMetricas]);

  const confirmarAnular = (venta: Venta) => {
    Alert.alert(
      'Anular venta',
      `¿Anular venta #${venta.id} por ${centavosACordobas(venta.total)}? El stock será repuesto.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Anular', style: 'destructive',
          onPress: async () => {
            const err = await anularVenta(venta.id);
            if (err) Alert.alert('Error', err);
            else cargarMetricas();
          },
        },
      ]
    );
  };

  const maxMonto = topProductos.length > 0
    ? Math.max(...topProductos.map((p) => p.total_monto))
    : 1;

  return (
    <SafeAreaView style={s.pantalla}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.titulo}>Reportes</Text>
          {sesion && (
            <Text style={s.sesionTexto}>
              {sesion.usuario.nombre} · {sesion.usuario.rol === 'admin' ? 'Admin' : 'Invitado'}
            </Text>
          )}
        </View>
        <View style={s.headerAcciones}>
          <TouchableOpacity onPress={() => { cargarRecientes(); cargarMetricas(); }}>
            <Ionicons name="refresh-outline" size={22} color={C.acento} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/ajustes')}>
            <Ionicons name="settings-outline" size={22} color={C.acento} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Selector de vista */}
      <View style={s.selectorVista}>
        <TouchableOpacity
          style={[s.btnVista, vista === 'resumen' && s.btnVistaActivo]}
          onPress={() => setVista('resumen')}
        >
          <Text style={[s.btnVistaTexto, vista === 'resumen' && s.btnVistaTextoActivo]}>
            Resumen
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btnVista, vista === 'historial' && s.btnVistaActivo]}
          onPress={() => setVista('historial')}
        >
          <Text style={[s.btnVistaTexto, vista === 'historial' && s.btnVistaTextoActivo]}>
            Historial
          </Text>
        </TouchableOpacity>
      </View>

      {vista === 'resumen' ? (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* Resumen de hoy */}
          <Text style={s.seccionLabel}>HOY</Text>
          <View style={s.tarjetasRow}>
            <View style={s.tarjetaMetrica}>
              <Ionicons name="receipt-outline" size={20} color={C.acento} />
              <Text style={s.tarjetaNumero}>{resumenHoy.total_ventas}</Text>
              <Text style={s.tarjetaLabel}>Ventas</Text>
            </View>
            <View style={s.tarjetaMetrica}>
              <Ionicons name="cash-outline" size={20} color={C.verde} />
              <Text style={[s.tarjetaNumero, { color: C.verde, fontSize: 16 }]}>
                {centavosACordobas(resumenHoy.total_monto)}
              </Text>
              <Text style={s.tarjetaLabel}>Ingresos</Text>
            </View>
          </View>

          {/* Selector de período */}
          <View style={s.periodoSelector}>
            <Text style={s.seccionLabel}>PERÍODO</Text>
            <View style={s.periodoBtns}>
              {([7, 30] as Periodo[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[s.periodoBtn, periodo === p && s.periodoBtnActivo]}
                  onPress={() => setPeriodo(p)}
                >
                  <Text style={[s.periodoBtnTexto, periodo === p && s.periodoBtnTextoActivo]}>
                    {p === 7 ? '7 días' : '30 días'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {cargandoMetricas ? (
            <ActivityIndicator color={C.acento} style={{ marginVertical: 30 }} />
          ) : metricas ? (
            <>
              {/* Métricas del período */}
              <View style={s.metricasGrid}>
                <MetricaCard
                  label="Total ventas" valor={String(metricas.total_ventas)}
                  icono="bag-outline" color={C.acento}
                />
                <MetricaCard
                  label="Ingresos" valor={centavosACordobas(metricas.total_monto)}
                  icono="trending-up-outline" color={C.verde}
                />
                <MetricaCard
                  label="Promedio x venta" valor={centavosACordobas(Math.round(metricas.promedio_venta))}
                  icono="calculator-outline" color={C.amarillo}
                />
                <MetricaCard
                  label="Anuladas" valor={String(metricas.total_anuladas)}
                  icono="close-circle-outline" color={C.rojo}
                />
              </View>

              {/* Rentabilidad */}
              {rentabilidad && (
                <>
                  <Text style={[s.seccionLabel, { marginTop: 16 }]}>
                    RENTABILIDAD ({periodo === 7 ? '7 días' : '30 días'})
                  </Text>
                  <View style={s.card}>
                    <View style={s.rentabilidadFila}>
                      <View style={s.rentabilidadItem}>
                        <Text style={[s.metricaValor, { color: C.verde }]}>
                          {centavosACordobas(rentabilidad.ganancia_total)}
                        </Text>
                        <Text style={s.metricaLabel}>Ganancia bruta</Text>
                      </View>
                      <View style={s.rentabilidadItem}>
                        <Text style={[s.metricaValor, { color: C.acento }]}>
                          {rentabilidad.margen_promedio}%
                        </Text>
                        <Text style={s.metricaLabel}>Margen promedio</Text>
                      </View>
                    </View>
                    {rentabilidad.productos_sin_costo > 0 && (
                      <View style={s.alertaSinCosto}>
                        <Ionicons name="warning-outline" size={14} color={C.amarillo} />
                        <Text style={s.alertaSinCostoTexto}>
                          {rentabilidad.productos_sin_costo} producto{rentabilidad.productos_sin_costo !== 1 ? 's' : ''} sin precio de costo — la ganancia puede ser imprecisa
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Métodos de pago */}
              {metodosPago.length > 0 && (
                <>
                  <Text style={[s.seccionLabel, { marginTop: 16 }]}>MÉTODOS DE PAGO</Text>
                  <View style={s.card}>
                    {metodosPago.map((m, i) => (
                      <View key={m.metodo_pago} style={[s.filaSimple, i < metodosPago.length - 1 && s.filaDivider]}>
                        <Ionicons
                          name={m.metodo_pago === 'efectivo' ? 'cash-outline'
                            : m.metodo_pago === 'tarjeta' ? 'card-outline'
                            : 'swap-horizontal-outline'}
                          size={18} color={C.subtexto}
                        />
                        <Text style={[s.filaLabel, { flex: 1, textTransform: 'capitalize' }]}>
                          {m.metodo_pago}
                        </Text>
                        <Text style={s.filaSub}>{m.total_ventas} ventas</Text>
                        <Text style={[s.filaLabel, { color: C.acento }]}>
                          {centavosACordobas(m.total_monto)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Top productos */}
              {topProductos.length > 0 && (
                <>
                  <Text style={[s.seccionLabel, { marginTop: 16 }]}>PRODUCTOS MÁS VENDIDOS</Text>
                  <View style={s.card}>
                    {topProductos.map((p, i) => {
                      const pct = maxMonto > 0 ? (p.total_monto / maxMonto) * 100 : 0;
                      return (
                        <View key={p.nombre_producto} style={[s.productoTop, i < topProductos.length - 1 && s.filaDivider]}>
                          <View style={s.productoTopHeader}>
                            <Text style={s.productoTopNum}>#{i + 1}</Text>
                            <Text style={[s.filaLabel, { flex: 1 }]} numberOfLines={1}>
                              {p.nombre_producto}
                            </Text>
                            <Text style={s.filaSub}>{p.total_cantidad} uds</Text>
                          </View>
                          <View style={s.barraFondo}>
                            <View style={[s.barraRelleno, { width: `${pct}%` }]} />
                          </View>
                          <Text style={[s.filaSub, { textAlign: 'right' }]}>
                            {centavosACordobas(p.total_monto)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </>
          ) : null}

          {/* Stock bajo */}
          {stockBajo.length > 0 && (
            <>
              <Text style={[s.seccionLabel, { marginTop: 16, color: C.amarillo }]}>
                ⚠ STOCK BAJO ({stockBajo.length})
              </Text>
              <View style={s.card}>
                {stockBajo.map((p, i) => (
                  <View key={p.id} style={[s.filaSimple, i < stockBajo.length - 1 && s.filaDivider]}>
                    <Ionicons name="alert-circle-outline" size={18} color={C.amarillo} />
                    <Text style={[s.filaLabel, { flex: 1 }]} numberOfLines={1}>{p.nombre}</Text>
                    <Text style={{ color: C.amarillo, fontWeight: '700', fontSize: 13 }}>
                      {p.stock} uds
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

        </ScrollView>
      ) : (
        /* Vista historial */
        cargandoVentas && !ventas.length ? (
          <View style={s.centrado}>
            <ActivityIndicator color={C.acento} size="large" />
          </View>
        ) : (
          <FlatList
            data={ventas}
            keyExtractor={(v) => String(v.id)}
            contentContainerStyle={[s.scroll, { flexGrow: 1 }]}
            ListEmptyComponent={
              <View style={s.centrado}>
                <Ionicons name="receipt-outline" size={48} color={C.borde} />
                <Text style={{ color: C.subtexto, marginTop: 8, fontWeight: '600' }}>
                  Sin ventas registradas
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[s.ventaCard, item.estado === 'anulada' && { opacity: 0.5 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.filaLabel}>Venta #{item.id}</Text>
                  <Text style={s.filaSub}>{formatearFecha(item.creado_en)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <View style={s.metodoBadge}>
                      <Text style={s.metodoBadgeTexto}>{item.metodo_pago}</Text>
                    </View>
                    {item.estado === 'anulada' && (
                      <View style={s.anuladaBadge}>
                        <Text style={s.anuladaTexto}>ANULADA</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: C.texto }}>
                    {centavosACordobas(item.total)}
                  </Text>
                  {item.estado === 'completada' && (
                    <TouchableOpacity onPress={() => confirmarAnular(item)}>
                      <Ionicons name="close-circle-outline" size={20} color={C.rojo} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          />
        )
      )}
    </SafeAreaView>
  );
}

function MetricaCard({ label, valor, icono, color }: {
  label: string; valor: string; icono: string; color: string;
}) {
  return (
    <View style={s.metricaCard}>
      <Ionicons name={icono as any} size={18} color={color} />
      <Text style={[s.metricaValor, { color }]}>{valor}</Text>
      <Text style={s.metricaLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  titulo: { fontSize: 24, fontWeight: '700', color: C.texto },
  sesionTexto: { fontSize: 12, color: C.subtexto, marginTop: 2 },
  headerAcciones: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  selectorVista: {
    flexDirection: 'row', marginHorizontal: 20, marginBottom: 16,
    backgroundColor: C.tarjeta, borderRadius: 12, padding: 4,
    borderWidth: 1, borderColor: C.borde,
  },
  btnVista: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  btnVistaActivo: { backgroundColor: C.acento },
  btnVistaTexto: { fontSize: 14, fontWeight: '600', color: C.subtexto },
  btnVistaTextoActivo: { color: C.fondo },
  scroll: { paddingHorizontal: 20, paddingBottom: 30 },
  seccionLabel: {
    fontSize: 11, fontWeight: '700', color: C.subtexto,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  tarjetasRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  tarjetaMetrica: {
    flex: 1, backgroundColor: C.tarjeta, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: C.borde, alignItems: 'center', gap: 4,
  },
  tarjetaNumero: { fontSize: 20, fontWeight: '800', color: C.acento },
  tarjetaLabel: { fontSize: 12, color: C.subtexto, fontWeight: '600' },
  periodoSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  periodoBtns: { flexDirection: 'row', gap: 8 },
  periodoBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: C.borde,
  },
  periodoBtnActivo: { backgroundColor: C.acento, borderColor: C.acento },
  periodoBtnTexto: { fontSize: 13, color: C.subtexto, fontWeight: '600' },
  periodoBtnTextoActivo: { color: C.fondo },
  metricasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  metricaCard: {
    width: '47%', backgroundColor: C.tarjeta, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: C.borde, gap: 4,
  },
  metricaValor: { fontSize: 16, fontWeight: '800' },
  metricaLabel: { fontSize: 11, color: C.subtexto },
  card: {
    backgroundColor: C.tarjeta, borderRadius: 14,
    borderWidth: 1, borderColor: C.borde, overflow: 'hidden', marginBottom: 4,
  },
  filaSimple: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  filaLabel: { fontSize: 14, color: C.texto, fontWeight: '500' },
  filaSub: { fontSize: 12, color: C.subtexto },
  filaDivider: { borderBottomWidth: 1, borderBottomColor: C.borde },
  productoTop: { paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  productoTopHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  productoTopNum: { fontSize: 12, fontWeight: '800', color: C.subtexto, width: 22 },
  barraFondo: {
    height: 4, backgroundColor: C.borde, borderRadius: 2, overflow: 'hidden',
  },
  barraRelleno: { height: 4, backgroundColor: C.acento, borderRadius: 2 },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  ventaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.tarjeta, borderRadius: 12,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.borde,
  },
  metodoBadge: {
    backgroundColor: C.acentoSuave, paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 6,
  },
  metodoBadgeTexto: { color: C.acento, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  anuladaBadge: {
    backgroundColor: C.rojoClaro, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  anuladaTexto: { color: C.rojo, fontSize: 10, fontWeight: '800' },
  rentabilidadFila: { flexDirection: 'row', padding: 14, gap: 12 },
  rentabilidadItem: { flex: 1, gap: 4 },
  alertaSinCosto: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.amarilloClaro, paddingHorizontal: 14, paddingVertical: 8,
  },
  alertaSinCostoTexto: { flex: 1, fontSize: 11, color: C.amarillo, fontWeight: '600' },
});

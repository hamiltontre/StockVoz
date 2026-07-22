import { useCallback, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  ScrollView,
  Modal,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlertas, type AlertaPorVencer } from '../../src/hooks/useAlertas';
import { VentaRepository } from '../../src/database/repositories/VentaRepository';
import { centavosACordobas } from '../../src/utils/money';
import { formatearCantidad, formatearCantidadConUnidad } from '../../src/utils/cantidad';
import type { PeriodoCompras } from '../../src/utils/abastecimiento';
import { COLORES as C } from '../../src/theme/colors';
import type { Producto, FiadorResumen, VentaConDetalle } from '../../src/types';

/** Un fiado con más días que esto se considera deuda vieja (se resalta). */
const DIAS_FIADO_VIEJO = 7;

type TipoAlerta = 'fiado' | 'compra_resumen' | 'vencido' | 'por_vencer' | 'stock_bajo';

interface ItemAlerta {
  tipo: TipoAlerta;
  producto?: Producto;
  dias_para_vencer?: number;
  fiado?: FiadorResumen;
}

/** Fecha legible para el separador del estado de cuenta: "18 de julio". */
function formatearFechaCuenta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-NI', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function formatearVencimiento(iso: string): string {
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

export default function PantallaAlertas() {
  const router = useRouter();
  const {
    porVencer, vencidos, stockBajo, compras, costoCompras,
    periodoCompras, cambiarPeriodoCompras,
    fiados, totalDeudaFiados, totalAlertas, recargar,
  } = useAlertas();

  const [comprasVisible, setComprasVisible] = useState(false);
  // Estado de cuenta abierto: el fiador + todas sus ventas con productos
  const [cuentaFiador, setCuentaFiador] = useState<{
    resumen: FiadorResumen;
    ventas: VentaConDetalle[];
  } | null>(null);

  // Abre el "cuaderno" de esa persona: todos los productos de todas sus
  // cuentas pendientes, de la fecha más vieja a la más nueva.
  const abrirCuentaFiador = useCallback(async (f: FiadorResumen) => {
    const r = await VentaRepository.detalleFiador(f.fiador_nombre);
    if (r.ok) setCuentaFiador({ resumen: f, ventas: r.data });
    else Alert.alert('Error', r.error);
  }, []);

  // "Ya pagó": salda TODAS las ventas fiadas pendientes de la persona.
  const cobrarFiado = useCallback((f: FiadorResumen) => {
    Alert.alert(
      `Cobrar a ${f.fiador_nombre}`,
      `Debe ${centavosACordobas(f.total_deuda)} en ${f.cantidad_ventas} venta${f.cantidad_ventas !== 1 ? 's' : ''}. ¿Marcar todo como pagado?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Ya pagó ✓',
          onPress: async () => {
            const r = await VentaRepository.marcarFiadorPagado(f.fiador_nombre);
            if (!r.ok) Alert.alert('Error', r.error);
            else setCuentaFiador(null);
          },
        },
      ]
    );
  }, []);

  const secciones = [
    fiados.length > 0 && {
      titulo: `FIADOS PENDIENTES · ${centavosACordobas(totalDeudaFiados)}`,
      color: C.amarillo,
      data: fiados.map((f): ItemAlerta => ({ tipo: 'fiado', fiado: f })),
    },
    compras.length > 0 && {
      titulo: 'COMPRAS',
      color: C.acento,
      data: [{ tipo: 'compra_resumen' } as ItemAlerta],
    },
    vencidos.length > 0 && {
      titulo: 'VENCIDOS',
      color: C.rojo,
      data: vencidos.map((p): ItemAlerta => ({ tipo: 'vencido', producto: p })),
    },
    porVencer.length > 0 && {
      titulo: 'POR VENCER (30 DÍAS)',
      color: C.vencimiento,
      data: porVencer.map((p: AlertaPorVencer): ItemAlerta => ({
        tipo: 'por_vencer',
        producto: p,
        dias_para_vencer: p.dias_para_vencer,
      })),
    },
    stockBajo.length > 0 && {
      titulo: 'STOCK BAJO',
      color: C.amarillo,
      data: stockBajo.map((p): ItemAlerta => ({ tipo: 'stock_bajo', producto: p })),
    },
  ].filter(Boolean) as Array<{ titulo: string; color: string; data: ItemAlerta[] }>;

  const renderItem = useCallback(({ item }: { item: ItemAlerta }) => {
    const { producto, tipo, dias_para_vencer, fiado } = item;

    // Tarjeta de fiado: quién debe y cuánto. Tocar = ver su cuenta completa.
    if (tipo === 'fiado' && fiado) {
      const esViejo = fiado.dias_deuda_mas_vieja >= DIAS_FIADO_VIEJO;
      return (
        <TouchableOpacity
          style={[s.card, s.cardFiado, esViejo && s.cardFiadoViejo]}
          onPress={() => abrirCuentaFiador(fiado)}
          activeOpacity={0.8}
        >
          <View style={[s.cardIcono, { backgroundColor: C.amarilloClaro }]}>
            <Ionicons name="person-outline" size={20} color={esViejo ? C.rojo : C.amarillo} />
          </View>
          <View style={s.cardInfo}>
            <Text style={s.cardNombre} numberOfLines={1}>{fiado.fiador_nombre}</Text>
            <Text style={[s.cardDetalle, esViejo && { color: C.rojo, fontWeight: '600' }]}>
              {fiado.cantidad_ventas} venta{fiado.cantidad_ventas !== 1 ? 's' : ''}
              {fiado.dias_deuda_mas_vieja > 0
                ? ` · debe desde hace ${fiado.dias_deuda_mas_vieja} día${fiado.dias_deuda_mas_vieja !== 1 ? 's' : ''}`
                : ' · de hoy'}
              {' · toca para ver la cuenta'}
            </Text>
          </View>
          <Text style={[s.fiadoDeuda, esViejo && { color: C.rojo }]}>
            {centavosACordobas(fiado.total_deuda)}
          </Text>
        </TouchableOpacity>
      );
    }

    // Un solo cuadro para toda la lista de compras — el detalle vive en
    // su propio modal, sin saturar la pantalla de alertas.
    if (tipo === 'compra_resumen') {
      return (
        <TouchableOpacity
          style={[s.card, s.cardCompra]}
          onPress={() => setComprasVisible(true)}
          activeOpacity={0.8}
        >
          <View style={[s.cardIcono, { backgroundColor: C.acentoSuave }]}>
            <Ionicons name="cart-outline" size={20} color={C.acento} />
          </View>
          <View style={s.cardInfo}>
            <Text style={s.cardNombre}>Lista por comprar</Text>
            <Text style={s.cardDetalle}>
              {compras.length} producto{compras.length !== 1 ? 's' : ''} · toca para ver la lista
            </Text>
          </View>
          {costoCompras > 0 && (
            <Text style={s.compraCantidad}>{centavosACordobas(costoCompras)}</Text>
          )}
        </TouchableOpacity>
      );
    }

    if (!producto) return null;
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => router.push('/(tabs)/inventario')}
        activeOpacity={0.8}
      >
        <View
          style={[
            s.cardIcono,
            tipo === 'vencido' && { backgroundColor: C.rojoClaro },
            tipo === 'por_vencer' && { backgroundColor: C.vencimientoClr },
            tipo === 'stock_bajo' && { backgroundColor: C.amarilloClaro },
          ]}
        >
          <Ionicons
            name={tipo === 'stock_bajo' ? 'cube-outline' : 'time-outline'}
            size={20}
            color={
              tipo === 'vencido' ? C.rojo
                : tipo === 'por_vencer' ? C.vencimiento
                : C.amarillo
            }
          />
        </View>
        <View style={s.cardInfo}>
          <Text style={s.cardNombre} numberOfLines={1}>{producto.nombre}</Text>
          <Text style={s.cardDetalle}>
            {tipo === 'vencido' && producto.fecha_vencimiento
              ? `Venció el ${formatearVencimiento(producto.fecha_vencimiento)}`
              : tipo === 'por_vencer' && producto.fecha_vencimiento
              ? (dias_para_vencer === 0
                  ? `¡Vence HOY! (${formatearVencimiento(producto.fecha_vencimiento)})`
                  : `Vence el ${formatearVencimiento(producto.fecha_vencimiento)} · ${dias_para_vencer} día${dias_para_vencer !== 1 ? 's' : ''}`)
              : `Quedan ${producto.stock} · mínimo ${producto.stock_minimo}`}
          </Text>
        </View>
        <Text style={s.cardPrecio}>{centavosACordobas(producto.precio)}</Text>
      </TouchableOpacity>
    );
  }, [router, abrirCuentaFiador, compras.length, costoCompras]);

  return (
    <SafeAreaView style={s.pantalla}>
      <View style={s.header}>
        <Text style={s.titulo}>Alertas</Text>
        {totalAlertas > 0 && (
          <View style={s.totalBadge}>
            <Text style={s.totalBadgeTexto}>{totalAlertas}</Text>
          </View>
        )}
      </View>

      <SectionList
        sections={secciones}
        keyExtractor={(item) =>
          `${item.tipo}-${item.producto?.id ?? item.fiado?.fiador_nombre ?? 'resumen'}`
        }
        contentContainerStyle={s.lista}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={recargar} tintColor={C.acento} />
        }
        renderSectionHeader={({ section }) => (
          <Text style={[s.seccionLabel, { color: section.color }]}>
            {section.titulo} ({section.data.length})
          </Text>
        )}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={s.vacio}>
            <Ionicons name="checkmark-circle-outline" size={56} color={C.verde} />
            <Text style={s.vacioTitulo}>Todo en orden</Text>
            <Text style={s.vacioSub}>
              Sin vencimientos, sin stock bajo y nada pendiente de comprar.
            </Text>
          </View>
        }
      />

      {/* ── Modal: lista de compras completa ── */}
      <Modal
        visible={comprasVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setComprasVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContenido}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitulo}>Lista por comprar</Text>
              <TouchableOpacity onPress={() => setComprasVisible(false)}>
                <Ionicons name="close" size={24} color={C.subtexto} />
              </TouchableOpacity>
            </View>

            {/* ¿Cada cuánto te abasteces? Define cuánto sugiere comprar. */}
            <View style={s.periodoRow}>
              {(['semanal', 'mensual'] as PeriodoCompras[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[s.periodoChip, periodoCompras === p && s.periodoChipActivo]}
                  onPress={() => cambiarPeriodoCompras(p)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.periodoChipTexto, periodoCompras === p && s.periodoChipTextoActivo]}>
                    {p === 'semanal' ? 'Semanal' : 'Mensual'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {compras.map((c) => (
                <View key={c.id} style={s.compraFila}>
                  <Text style={s.compraFilaNombre} numberOfLines={1}>{c.nombre}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.compraFilaCantidad}>
                      {formatearCantidadConUnidad(c.cantidadSugerida, c.unidad)}
                    </Text>
                    {c.costoEstimado > 0 && (
                      <Text style={s.compraFilaCosto}>{centavosACordobas(c.costoEstimado)}</Text>
                    )}
                  </View>
                </View>
              ))}
              {compras.length === 0 && (
                <Text style={s.modalVacio}>Nada pendiente de comprar para este periodo.</Text>
              )}
            </ScrollView>

            {costoCompras > 0 && (
              <View style={s.modalFooterTotal}>
                <Text style={s.modalFooterLabel}>Costo estimado</Text>
                <Text style={s.modalFooterMonto}>{centavosACordobas(costoCompras)}</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal: estado de cuenta del fiador (el "cuaderno" de esa persona) ── */}
      <Modal
        visible={cuentaFiador !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setCuentaFiador(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContenido}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitulo}>Cuenta de {cuentaFiador?.resumen.fiador_nombre}</Text>
                <Text style={s.modalSub}>
                  {cuentaFiador?.ventas.length} venta{cuentaFiador?.ventas.length !== 1 ? 's' : ''} pendiente{cuentaFiador?.ventas.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCuentaFiador(null)}>
                <Ionicons name="close" size={24} color={C.subtexto} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {(() => {
                // De la fecha más vieja a la más nueva, con la fecha como
                // separador — para repasar la cuenta con el cliente enfrente.
                let fechaPrevia = '';
                return cuentaFiador?.ventas.map((v) => {
                  const fecha = formatearFechaCuenta(v.creado_en);
                  const nuevaFecha = fecha !== fechaPrevia;
                  fechaPrevia = fecha;
                  return (
                    <View key={v.id}>
                      {nuevaFecha && (
                        <View style={s.fechaSeparador}>
                          <Text style={s.fechaSeparadorTexto}>{fecha}</Text>
                          <View style={s.fechaSeparadorLinea} />
                        </View>
                      )}
                      {v.items.map((it) => (
                        <View key={it.id} style={s.cuentaFila}>
                          <Text style={s.cuentaFilaNombre} numberOfLines={1}>
                            {formatearCantidad(it.cantidad)}× {it.nombre_producto}
                          </Text>
                          <Text style={s.cuentaFilaMonto}>{centavosACordobas(it.subtotal)}</Text>
                        </View>
                      ))}
                    </View>
                  );
                });
              })()}
            </ScrollView>

            <View style={s.modalFooterTotal}>
              <Text style={s.modalFooterLabel}>Total que debe</Text>
              <Text style={[s.modalFooterMonto, { color: C.amarillo }]}>
                {cuentaFiador ? centavosACordobas(cuentaFiador.resumen.total_deuda) : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={s.btnYaPago}
              onPress={() => cuentaFiador && cobrarFiado(cuentaFiador.resumen)}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
              <Text style={s.btnYaPagoTexto}>Ya pagó todo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  titulo: { fontSize: 24, fontWeight: '700', color: C.texto },
  totalBadge: {
    backgroundColor: C.rojo,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  totalBadgeTexto: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  lista: { paddingHorizontal: 20, paddingBottom: 20, flexGrow: 1 },
  seccionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.tarjeta,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.borde,
  },
  cardIcono: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  cardNombre: { fontSize: 15, fontWeight: '600', color: C.texto },
  cardDetalle: { fontSize: 12, color: C.subtexto, marginTop: 2 },
  cardPrecio: { fontSize: 14, fontWeight: '700', color: C.acento },
  cardCompra: { borderColor: C.acento, borderWidth: 1.5 },
  compraCantidad: { fontSize: 15, fontWeight: '800', color: C.acento },
  cardFiado: { borderColor: C.amarillo, borderWidth: 1.5 },
  cardFiadoViejo: { borderColor: C.rojo },
  fiadoDeuda: { fontSize: 15, fontWeight: '800', color: C.amarillo },
  // ── Modales (compras y cuenta de fiador) ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContenido: {
    backgroundColor: C.fondo, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 30, maxHeight: '85%',
    borderTopWidth: 1, borderColor: C.borde,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalTitulo: { fontSize: 18, fontWeight: '700', color: C.texto },
  modalSub: { fontSize: 12, color: C.subtexto, marginTop: 2 },
  modalVacio: { color: C.subtexto, textAlign: 'center', paddingVertical: 30 },
  periodoRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  periodoChip: {
    flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: C.borde, backgroundColor: C.tarjeta,
  },
  periodoChipActivo: { backgroundColor: C.acento, borderColor: C.acento },
  periodoChipTexto: { fontSize: 13, fontWeight: '700', color: C.subtexto },
  periodoChipTextoActivo: { color: '#FFFFFF' },
  compraFila: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.borde, gap: 10,
  },
  compraFilaNombre: { flex: 1, fontSize: 15, fontWeight: '600', color: C.texto },
  compraFilaCantidad: { fontSize: 15, fontWeight: '800', color: C.acento },
  compraFilaCosto: { fontSize: 11, color: C.subtexto, marginTop: 1 },
  modalFooterTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 14, marginTop: 4, borderTopWidth: 1, borderTopColor: C.borde,
  },
  modalFooterLabel: { fontSize: 14, color: C.subtexto, fontWeight: '600' },
  modalFooterMonto: { fontSize: 20, fontWeight: '800', color: C.texto },
  fechaSeparador: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 14, marginBottom: 6,
  },
  fechaSeparadorTexto: {
    fontSize: 12, fontWeight: '700', color: C.subtexto,
    textTransform: 'capitalize',
  },
  fechaSeparadorLinea: { flex: 1, height: 1, backgroundColor: C.borde },
  cuentaFila: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 7, gap: 10,
  },
  cuentaFilaNombre: { flex: 1, fontSize: 14, fontWeight: '500', color: C.texto },
  cuentaFilaMonto: { fontSize: 14, fontWeight: '700', color: C.texto },
  btnYaPago: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.verde, borderRadius: 14, paddingVertical: 15, marginTop: 12,
  },
  btnYaPagoTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 80 },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: C.texto },
  vacioSub: { fontSize: 13, color: C.subtexto, textAlign: 'center', paddingHorizontal: 50 },
});

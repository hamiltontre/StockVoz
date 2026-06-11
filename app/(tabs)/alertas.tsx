import { useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlertas, type AlertaPorVencer } from '../../src/hooks/useAlertas';
import { centavosACordobas } from '../../src/utils/money';
import { COLORES as C } from '../../src/theme/colors';
import type { Producto } from '../../src/types';

type TipoAlerta = 'vencido' | 'por_vencer' | 'stock_bajo';

interface ItemAlerta {
  tipo: TipoAlerta;
  producto: Producto;
  dias_para_vencer?: number;
}

function formatearVencimiento(iso: string): string {
  const [yyyy, mm] = iso.split('-');
  return `${mm}/${yyyy}`;
}

export default function PantallaAlertas() {
  const router = useRouter();
  const { porVencer, vencidos, stockBajo, totalAlertas, recargar } = useAlertas();

  const secciones = [
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
    const { producto, tipo, dias_para_vencer } = item;
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
              ? `Venció ${formatearVencimiento(producto.fecha_vencimiento)}`
              : tipo === 'por_vencer' && producto.fecha_vencimiento
              ? `Vence ${formatearVencimiento(producto.fecha_vencimiento)} · ${dias_para_vencer} día${dias_para_vencer !== 1 ? 's' : ''}`
              : `Quedan ${producto.stock} · mínimo ${producto.stock_minimo}`}
          </Text>
        </View>
        <Text style={s.cardPrecio}>{centavosACordobas(producto.precio)}</Text>
      </TouchableOpacity>
    );
  }, [router]);

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
        keyExtractor={(item) => `${item.tipo}-${item.producto.id}`}
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
              Sin productos vencidos, por vencer ni con stock bajo.
            </Text>
          </View>
        }
      />
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
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 80 },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: C.texto },
  vacioSub: { fontSize: 13, color: C.subtexto, textAlign: 'center', paddingHorizontal: 50 },
});

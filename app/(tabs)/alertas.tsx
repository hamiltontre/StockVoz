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
import { formatearCantidadConUnidad } from '../../src/utils/cantidad';
import type { SugerenciaCompra } from '../../src/utils/abastecimiento';
import { COLORES as C } from '../../src/theme/colors';
import type { Producto } from '../../src/types';

type TipoAlerta = 'compra' | 'vencido' | 'por_vencer' | 'stock_bajo';

interface ItemAlerta {
  tipo: TipoAlerta;
  producto?: Producto;
  dias_para_vencer?: number;
  compra?: SugerenciaCompra;
}

/** Texto explicativo de POR QUÉ se sugiere la compra — transparencia ante todo. */
function detalleCompra(c: SugerenciaCompra): string {
  const partes: string[] = [];
  if (c.motivo === 'agotado') {
    partes.push('Agotado');
  } else if (c.motivo === 'por_agotarse' && c.diasDeStock !== null) {
    partes.push(`Se agota en ~${c.diasDeStock} día${c.diasDeStock === 1 ? '' : 's'}`);
  } else {
    partes.push('Bajo el stock mínimo');
  }
  if (c.velocidadDiaria > 0) {
    partes.push(`vendés ~${c.velocidadDiaria}/día`);
  }
  if (c.confianza === 'aprendiendo') {
    partes.push('aún aprendiendo tus ventas');
  }
  return partes.join(' · ');
}

function formatearVencimiento(iso: string): string {
  const [yyyy, mm] = iso.split('-');
  return `${mm}/${yyyy}`;
}

export default function PantallaAlertas() {
  const router = useRouter();
  const { porVencer, vencidos, stockBajo, compras, costoCompras, totalAlertas, recargar } = useAlertas();

  const secciones = [
    compras.length > 0 && {
      titulo: costoCompras > 0
        ? `LISTA DE COMPRAS · ~${centavosACordobas(costoCompras)}`
        : 'LISTA DE COMPRAS SUGERIDA',
      color: C.acento,
      data: compras.map((c): ItemAlerta => ({ tipo: 'compra', compra: c })),
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
    const { producto, tipo, dias_para_vencer, compra } = item;

    // Tarjeta de compra sugerida: qué comprar, cuánto, y por qué.
    if (tipo === 'compra' && compra) {
      return (
        <TouchableOpacity
          style={[s.card, s.cardCompra]}
          onPress={() => router.push('/(tabs)/inventario')}
          activeOpacity={0.8}
        >
          <View style={[s.cardIcono, { backgroundColor: C.acentoSuave }]}>
            <Ionicons name="cart-outline" size={20} color={C.acento} />
          </View>
          <View style={s.cardInfo}>
            <Text style={s.cardNombre} numberOfLines={1}>{compra.nombre}</Text>
            <Text style={s.cardDetalle}>{detalleCompra(compra)}</Text>
          </View>
          <View style={s.compraDerecha}>
            <Text style={s.compraCantidad}>
              {formatearCantidadConUnidad(compra.cantidadSugerida, compra.unidad)}
            </Text>
            {compra.costoEstimado > 0 && (
              <Text style={s.compraCosto}>{centavosACordobas(compra.costoEstimado)}</Text>
            )}
          </View>
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
        keyExtractor={(item) => `${item.tipo}-${item.producto?.id ?? item.compra?.id}`}
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
  compraDerecha: { alignItems: 'flex-end', gap: 2 },
  compraCantidad: { fontSize: 15, fontWeight: '800', color: C.acento },
  compraCosto: { fontSize: 12, color: C.subtexto },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 80 },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: C.texto },
  vacioSub: { fontSize: 13, color: C.subtexto, textAlign: 'center', paddingHorizontal: 50 },
});

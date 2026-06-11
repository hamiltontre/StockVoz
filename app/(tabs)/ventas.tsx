import { useState, useEffect, useCallback } from 'react';
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
import { useVoz } from '../../src/hooks/useVoz';
import { useSesion } from '../../src/context/SesionContext';
import { ProductoRepository } from '../../src/database/repositories/ProductoRepository';
import { centavosACordobas, cordobasACentavos } from '../../src/utils/money';
import { ModalRecibo } from '../../src/components/ModalRecibo';
import { ModalBuscarProducto } from '../../src/components/ModalBuscarProducto';
import { COLORES as C } from '../../src/theme/colors';
import type { ItemCarrito, MetodoPago, Producto, VentaConDetalle } from '../../src/types';

export default function PantallaVentas() {
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [procesando, setProcesando] = useState(false);
  const [reciboVisible, setReciboVisible] = useState(false);
  const [ventaRecibo, setVentaRecibo] = useState<VentaConDetalle | null>(null);
  const [buscarVisible, setBuscarVisible] = useState(false);

  const { resumenHoy, registrarVenta, cargarRecientes } = useVentas();
  const { sesion } = useSesion();
  const { estado: estadoVoz, resultado: resultadoVoz, iniciarEscucha, detenerEscucha, limpiar, segundosRestantes } = useVoz();

  useEffect(() => {
    cargarRecientes();
  }, [cargarRecientes]);

  // Cuando el motor de voz devuelve resultado, agregar al carrito
  useEffect(() => {
    if (!resultadoVoz) return;
    if (resultadoVoz.productosEncontrados.length === 1) {
      agregarAlCarrito(resultadoVoz.productosEncontrados[0], resultadoVoz.cantidad);
      limpiar();
    } else if (resultadoVoz.productosEncontrados.length > 1) {
      // Más de un resultado: mostrar opciones
      Alert.alert(
        'Varios productos encontrados',
        `"${resultadoVoz.transcripcion}" coincide con varios productos. ¿Cuál querías?`,
        resultadoVoz.productosEncontrados.slice(0, 3).map((p) => ({
          text: p.nombre,
          onPress: () => { agregarAlCarrito(p, resultadoVoz.cantidad); limpiar(); },
        }))
      );
    } else {
      Alert.alert('No encontrado', `No se encontró "${resultadoVoz.transcripcion}" en el inventario.`);
      limpiar();
    }
  }, [resultadoVoz]);

  const agregarAlCarrito = useCallback((producto: Producto, cantidad = 1) => {
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.producto.id === producto.id);
      if (idx >= 0) {
        const nuevo = [...prev];
        nuevo[idx] = { ...nuevo[idx], cantidad: nuevo[idx].cantidad + cantidad };
        return nuevo;
      }
      return [...prev, { producto, cantidad }];
    });
  }, []);

  const removerDelCarrito = useCallback((productoId: number) => {
    setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId));
  }, []);

  const cambiarCantidad = useCallback((productoId: number, delta: number) => {
    setCarrito((prev) => {
      return prev
        .map((i) =>
          i.producto.id === productoId
            ? { ...i, cantidad: Math.max(0, i.cantidad + delta) }
            : i
        )
        .filter((i) => i.cantidad > 0);
    });
  }, []);

  const totalCarrito = carrito.reduce(
    (acc, i) => acc + i.producto.precio * i.cantidad,
    0
  );

  // Ganancia estimada — solo cuenta productos con precio_costo registrado
  const gananciaCarrito = carrito.reduce(
    (acc, i) => acc + (i.producto.precio - (i.producto.precio_costo ?? 0)) * i.cantidad,
    0
  );
  const hayPreciosCosto = carrito.some((i) => (i.producto.precio_costo ?? 0) > 0);

  const cobrar = useCallback(async () => {
    if (!carrito.length) return;
    setProcesando(true);
    const result = await registrarVenta(carrito, metodoPago);
    setProcesando(false);
    if (result.ok && result.venta) {
      setCarrito([]);
      setVentaRecibo(result.venta);
      setReciboVisible(true);
    } else {
      Alert.alert('Error', result.error ?? 'No se pudo registrar la venta');
    }
  }, [carrito, metodoPago, registrarVenta]);

  const toggleMicrofono = useCallback(() => {
    if (estadoVoz === 'escuchando') {
      detenerEscucha();
    } else {
      iniciarEscucha();
    }
  }, [estadoVoz, iniciarEscucha, detenerEscucha]);

  return (
    <SafeAreaView style={s.pantalla}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitulo}>Ventas</Text>
          <Text style={s.headerSub}>
            Hoy: {resumenHoy.total_ventas} ventas · {centavosACordobas(resumenHoy.total_monto)}
          </Text>
        </View>
        <View style={s.headerBotones}>
          <TouchableOpacity
            style={s.botonBuscar}
            onPress={() => setBuscarVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="search" size={24} color={C.acento} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.botonMic, estadoVoz === 'escuchando' && s.botonMicActivo]}
            onPress={toggleMicrofono}
            activeOpacity={0.8}
          >
            <Ionicons
              name={estadoVoz === 'escuchando' ? 'mic' : 'mic-outline'}
              size={28}
              color={estadoVoz === 'escuchando' ? C.fondo : C.acento}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Indicador de voz */}
      {estadoVoz !== 'inactivo' && (
        <View style={s.bannerVoz}>
          {estadoVoz === 'error'
            ? <Ionicons name="alert-circle-outline" size={18} color={C.rojo} />
            : estadoVoz === 'escuchando'
            ? <Ionicons name="radio-button-on" size={18} color={C.acento} />
            : <ActivityIndicator size="small" color={C.acento} />
          }
          <View style={{ flex: 1 }}>
            <Text style={[s.bannerVozTexto, estadoVoz === 'error' && { color: C.rojo }]}>
              {estadoVoz === 'escuchando' ? 'Escuchando... habla ahora'
                : estadoVoz === 'procesando' ? 'Buscando producto...'
                : 'Voz no disponible en Expo Go'}
            </Text>
            {estadoVoz === 'escuchando' && segundosRestantes > 0 && (
              <Text style={s.bannerVozSub}>{segundosRestantes}s · Di el nombre del producto</Text>
            )}
          </View>
          <TouchableOpacity onPress={() => { detenerEscucha(); limpiar(); }} style={s.bannerBtnStop}>
            <Ionicons name="close-circle" size={20} color={C.subtexto} />
          </TouchableOpacity>
        </View>
      )}

      {/* Carrito */}
      <FlatList
        data={carrito}
        keyExtractor={(i) => String(i.producto.id)}
        contentContainerStyle={s.lista}
        ListEmptyComponent={
          <View style={s.vacio}>
            <Ionicons name="cart-outline" size={48} color={C.borde} />
            <Text style={s.vacioTexto}>Carrito vacío</Text>
            <Text style={s.vacioSub}>Usa el micrófono o ve a Inventario para agregar</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.itemCarrito}>
            <View style={s.itemInfo}>
              <Text style={s.itemNombre}>{item.producto.nombre}</Text>
              <Text style={s.itemPrecio}>{centavosACordobas(item.producto.precio)} c/u</Text>
            </View>
            <View style={s.itemControles}>
              <TouchableOpacity onPress={() => cambiarCantidad(item.producto.id, -1)} style={s.btnControl}>
                <Ionicons name="remove" size={18} color={C.texto} />
              </TouchableOpacity>
              <Text style={s.itemCantidad}>{item.cantidad}</Text>
              <TouchableOpacity onPress={() => cambiarCantidad(item.producto.id, 1)} style={s.btnControl}>
                <Ionicons name="add" size={18} color={C.texto} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removerDelCarrito(item.producto.id)} style={s.btnEliminar}>
                <Ionicons name="trash-outline" size={18} color={C.rojo} />
              </TouchableOpacity>
            </View>
            <Text style={s.itemSubtotal}>
              {centavosACordobas(item.producto.precio * item.cantidad)}
            </Text>
          </View>
        )}
      />

      {/* Footer de cobro */}
      {carrito.length > 0 && (
        <View style={s.footer}>
          <View style={s.metodosPago}>
            {(['efectivo', 'tarjeta', 'transferencia'] as MetodoPago[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[s.chipMetodo, metodoPago === m && s.chipMetodoActivo]}
                onPress={() => setMetodoPago(m)}
              >
                <Text style={[s.chipMetodoTexto, metodoPago === m && s.chipMetodoTextoActivo]}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalMonto}>{centavosACordobas(totalCarrito)}</Text>
          </View>

          {hayPreciosCosto && (
            <View style={s.gananciaRow}>
              <Text style={s.gananciaLabel}>Ganancia estimada</Text>
              <Text style={s.gananciaMonto}>{centavosACordobas(gananciaCarrito)}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.botonCobrar, procesando && s.botonCobrarDeshabilitado]}
            onPress={cobrar}
            disabled={procesando}
            activeOpacity={0.85}
          >
            {procesando ? (
              <ActivityIndicator color={C.fondo} />
            ) : (
              <Text style={s.botonCobrarTexto}>Cobrar</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <ModalBuscarProducto
        visible={buscarVisible}
        onCerrar={() => setBuscarVisible(false)}
        onSeleccionar={(p) => agregarAlCarrito(p, 1)}
      />

      <ModalRecibo
        venta={ventaRecibo}
        visible={reciboVisible}
        onCerrar={() => { setReciboVisible(false); setVentaRecibo(null); }}
        esAdmin={sesion?.usuario.rol === 'admin'}
      />
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
    paddingBottom: 12,
  },
  headerTitulo: { fontSize: 24, fontWeight: '700', color: C.texto },
  headerSub: { fontSize: 13, color: C.subtexto, marginTop: 2 },
  headerBotones: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  botonBuscar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.tarjeta,
    borderWidth: 1,
    borderColor: C.borde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonMic: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.tarjeta,
    borderWidth: 2,
    borderColor: C.acento,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonMicActivo: { backgroundColor: C.acento },
  bannerVoz: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.acentoSuave,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  bannerVozTexto: { color: C.acentoTexto, fontSize: 14, fontWeight: '600' },
  bannerVozSub: { color: C.subtexto, fontSize: 11, marginTop: 2 },
  bannerBtnStop: { padding: 2 },
  gananciaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -6,
  },
  gananciaLabel: { fontSize: 13, color: C.subtexto },
  gananciaMonto: { fontSize: 16, fontWeight: '700', color: C.verde },
  lista: { paddingHorizontal: 20, paddingBottom: 8, flexGrow: 1 },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  vacioTexto: { fontSize: 16, color: C.subtexto, fontWeight: '600' },
  vacioSub: { fontSize: 13, color: C.borde, textAlign: 'center', paddingHorizontal: 40 },
  itemCarrito: {
    backgroundColor: C.tarjeta,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.borde,
  },
  itemInfo: { marginBottom: 8 },
  itemNombre: { fontSize: 15, fontWeight: '600', color: C.texto },
  itemPrecio: { fontSize: 13, color: C.subtexto, marginTop: 2 },
  itemControles: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  btnControl: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.borde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCantidad: { fontSize: 16, fontWeight: '700', color: C.texto, minWidth: 24, textAlign: 'center' },
  btnEliminar: { marginLeft: 'auto' as any, padding: 4 },
  itemSubtotal: { fontSize: 15, fontWeight: '700', color: C.acento, textAlign: 'right' },
  footer: {
    backgroundColor: C.tarjeta,
    borderTopWidth: 1,
    borderTopColor: C.borde,
    padding: 20,
    gap: 12,
  },
  metodosPago: { flexDirection: 'row', gap: 8 },
  chipMetodo: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.borde,
  },
  chipMetodoActivo: { backgroundColor: C.acento, borderColor: C.acento },
  chipMetodoTexto: { fontSize: 13, color: C.subtexto, fontWeight: '600' },
  chipMetodoTextoActivo: { color: C.fondo },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 16, color: C.subtexto },
  totalMonto: { fontSize: 24, fontWeight: '800', color: C.texto },
  botonCobrar: {
    backgroundColor: C.verde,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  botonCobrarDeshabilitado: { opacity: 0.6 },
  botonCobrarTexto: { fontSize: 17, fontWeight: '700', color: C.fondo },
});

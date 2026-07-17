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
import {
  calcularSubtotalLinea,
  pasoCantidad,
  formatearCantidadConUnidad,
  abreviaturaUnidad,
} from '../../src/utils/cantidad';
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
  const { estado: estadoVoz, resultado: resultadoVoz, errorMensaje: errorVoz, iniciarEscucha, detenerEscucha, limpiar, segundos: segundosVoz } = useVoz();

  useEffect(() => {
    cargarRecientes();
  }, [cargarRecientes]);

  // Cuando el motor de voz devuelve la lista, agregar todos los productos
  // reconocidos al carrito de una sola pasada.
  useEffect(() => {
    if (!resultadoVoz) return;
    const noEncontrados: string[] = [];
    let agregados = 0;
    for (const item of resultadoVoz.items) {
      if (item.productosEncontrados.length >= 1) {
        // Si hay varias coincidencias, tomamos la más relevante (primera)
        const producto = item.productosEncontrados[0];
        // "media docena de clavos": si el stock del producto se cuenta por
        // unidad, la docena hablada son 12 unidades (0.5 doc → 6). Si el
        // producto ya se mide en docenas, la cantidad queda tal cual.
        const cantidad = item.enDocenas && producto.unidad !== 'docena'
          ? item.cantidad * 12
          : item.cantidad;
        agregarAlCarrito(producto, cantidad);
        agregados++;
      } else {
        noEncontrados.push(item.palabras.join(' '));
      }
    }
    limpiar();
    if (noEncontrados.length > 0) {
      Alert.alert(
        agregados > 0 ? 'Algunos productos no se encontraron' : 'No se encontraron productos',
        `No encontré: ${noEncontrados.join(', ')}.` +
          (agregados > 0 ? `\nAgregué ${agregados} al carrito.` : '')
      );
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
    (acc, i) => acc + calcularSubtotalLinea(i.producto, i.cantidad),
    0
  );

  // Ganancia estimada — subtotal real (con precio de docena si aplica)
  // menos el costo de la cantidad vendida.
  const gananciaCarrito = carrito.reduce(
    (acc, i) =>
      acc +
      calcularSubtotalLinea(i.producto, i.cantidad) -
      Math.round((i.producto.precio_costo ?? 0) * i.cantidad),
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
              {estadoVoz === 'escuchando' ? 'Escuchando... di tu lista de productos'
                : estadoVoz === 'procesando' ? 'Buscando productos...'
                : (errorVoz ?? 'Voz no disponible')}
            </Text>
            {estadoVoz === 'escuchando' && (
              <Text style={s.bannerVozSub}>
                {segundosVoz}s · Toca el micrófono para terminar
              </Text>
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
            <Text style={s.vacioSub}>Presiona 🔍 para buscar, 🎤 para voz, o ve a Inventario</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.itemCarrito}>
            <View style={s.itemInfo}>
              <Text style={s.itemNombre}>{item.producto.nombre}</Text>
              <Text style={s.itemPrecio}>
                {centavosACordobas(item.producto.precio)} / {abreviaturaUnidad(item.producto.unidad)}
                {item.producto.precio_docena > 0
                  ? `  ·  docena ${centavosACordobas(item.producto.precio_docena)}`
                  : ''}
              </Text>
            </View>
            <View style={s.itemControles}>
              <TouchableOpacity
                onPress={() => cambiarCantidad(item.producto.id, -pasoCantidad(item.producto.unidad))}
                style={s.btnControl}
              >
                <Ionicons name="remove" size={20} color={C.texto} />
              </TouchableOpacity>
              <Text style={s.itemCantidad}>
                {formatearCantidadConUnidad(item.cantidad, item.producto.unidad)}
              </Text>
              <TouchableOpacity
                onPress={() => cambiarCantidad(item.producto.id, pasoCantidad(item.producto.unidad))}
                style={s.btnControl}
              >
                <Ionicons name="add" size={20} color={C.texto} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removerDelCarrito(item.producto.id)} style={s.btnEliminar}>
                <Ionicons name="trash-outline" size={18} color={C.rojo} />
              </TouchableOpacity>
            </View>
            <Text style={s.itemSubtotal}>
              {centavosACordobas(calcularSubtotalLinea(item.producto, item.cantidad))}
            </Text>
          </View>
        )}
      />

      {/* Footer de cobro */}
      {carrito.length > 0 && (
        <View style={s.footer}>
          {/* Plan básico: solo efectivo */}
          <View style={s.metodosPago}>
            <Text style={s.metodoLabel}>Método de pago: Efectivo</Text>
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
              <Text style={s.botonCobrarTexto}>Cobrar {centavosACordobas(totalCarrito)}</Text>
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
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.tarjeta,
    borderWidth: 2,
    borderColor: C.acento,
    alignItems: 'center',
    justifyContent: 'center',
    // Sombra sutil para que el mic —la acción estrella— resalte
    elevation: 3,
    shadowColor: C.acento,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  botonMicActivo: { backgroundColor: C.acento, elevation: 6 },
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
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.borde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCantidad: { fontSize: 16, fontWeight: '700', color: C.texto, minWidth: 56, textAlign: 'center' },
  btnEliminar: { marginLeft: 'auto' as any, padding: 4 },
  itemSubtotal: { fontSize: 15, fontWeight: '700', color: C.acento, textAlign: 'right' },
  footer: {
    backgroundColor: C.tarjeta,
    borderTopWidth: 1,
    borderTopColor: C.borde,
    padding: 20,
    gap: 12,
  },
  metodosPago: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  metodoLabel: { fontSize: 14, color: C.subtexto, fontWeight: '600' },
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
    paddingVertical: 18,
    alignItems: 'center',
    elevation: 2,
  },
  botonCobrarDeshabilitado: { opacity: 0.6 },
  botonCobrarTexto: { fontSize: 18, fontWeight: '800', color: C.fondo },
});

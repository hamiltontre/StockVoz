import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, Modal,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import { COLORES as C } from '../theme/colors';
import { centavosACordobas } from '../utils/money';
import { formatearCantidadConUnidad } from '../utils/cantidad';
import type { Producto } from '../types';

interface Props {
  visible: boolean;
  onCerrar: () => void;
  onSeleccionar: (producto: Producto) => void;
}

/**
 * Búsqueda manual de productos para agregar al carrito sin voz.
 * Útil cuando el ambiente es muy ruidoso o la voz no está disponible.
 */
export function ModalBuscarProducto({ visible, onCerrar, onSeleccionar }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(false);

  const buscar = useCallback(async (termino: string) => {
    setCargando(true);
    const result = termino.trim()
      ? await ProductoRepository.buscarPorNombre(termino)
      : await ProductoRepository.obtenerTodos();
    if (result.ok) setProductos(result.data);
    setCargando(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setBusqueda('');
      buscar('');
    }
  }, [visible, buscar]);

  const seleccionar = (p: Producto) => {
    if (p.stock === 0) return; // No agregar productos sin stock
    onSeleccionar(p);
    onCerrar();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.overlay}
      >
        <View style={s.contenedor}>
          <View style={s.header}>
            <Text style={s.titulo}>Agregar producto</Text>
            <TouchableOpacity onPress={onCerrar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={26} color={C.subtexto} />
            </TouchableOpacity>
          </View>

          <View style={s.busquedaContainer}>
            <Ionicons name="search-outline" size={18} color={C.subtexto} />
            <TextInput
              style={s.busquedaInput}
              placeholder="Buscar por nombre..."
              placeholderTextColor={C.subtexto}
              value={busqueda}
              onChangeText={(v) => { setBusqueda(v); buscar(v); }}
              autoFocus
              autoCorrect={false}
            />
            {busqueda.length > 0 && (
              <TouchableOpacity onPress={() => { setBusqueda(''); buscar(''); }}>
                <Ionicons name="close-circle" size={18} color={C.subtexto} />
              </TouchableOpacity>
            )}
          </View>

          {cargando ? (
            <ActivityIndicator color={C.acento} style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={productos}
              keyExtractor={(p) => String(p.id)}
              contentContainerStyle={s.lista}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={s.vacio}>
                  <Ionicons name="cube-outline" size={40} color={C.borde} />
                  <Text style={s.vacioTexto}>
                    {busqueda ? `Sin resultados para "${busqueda}"` : 'Sin productos'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.item, item.stock === 0 && s.itemAgotado]}
                  onPress={() => seleccionar(item)}
                  disabled={item.stock === 0}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemNombre}>{item.nombre}</Text>
                    <Text style={s.itemPrecio}>{centavosACordobas(item.precio)}</Text>
                  </View>
                  <View style={[s.stockBadge, item.stock <= item.stock_minimo && s.stockBajo]}>
                    <Text style={[s.stockTexto, item.stock === 0 && { color: C.rojo }]}>
                      {item.stock === 0 ? 'Agotado' : formatearCantidadConUnidad(item.stock, item.unidad)}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  contenedor: {
    backgroundColor: C.fondo, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    height: '85%', borderTopWidth: 1, borderColor: C.borde,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: C.borde,
  },
  titulo: { fontSize: 18, fontWeight: '700', color: C.texto },
  busquedaContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 16, marginBottom: 10,
    backgroundColor: C.tarjeta, borderRadius: 12,
    borderWidth: 1, borderColor: C.borde,
    paddingHorizontal: 12, height: 46,
  },
  busquedaInput: { flex: 1, color: C.texto, fontSize: 15 },
  lista: { paddingHorizontal: 20, paddingBottom: 20, flexGrow: 1 },
  vacio: { alignItems: 'center', paddingTop: 60, gap: 8 },
  vacioTexto: { fontSize: 14, color: C.subtexto, fontWeight: '600' },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, backgroundColor: C.tarjeta, borderRadius: 12,
    borderWidth: 1, borderColor: C.borde, marginBottom: 8,
  },
  itemAgotado: { opacity: 0.45 },
  itemNombre: { fontSize: 15, fontWeight: '600', color: C.texto },
  itemPrecio: { fontSize: 13, color: C.acento, marginTop: 2 },
  stockBadge: {
    backgroundColor: C.verdeClaro, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  stockBajo: { backgroundColor: C.amarilloClaro },
  stockTexto: { color: C.texto, fontSize: 12, fontWeight: '600' },
});

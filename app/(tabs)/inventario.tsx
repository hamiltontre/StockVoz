import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useInventario } from '../../src/hooks/useInventario';
import { centavosACordobas, cordobasACentavos } from '../../src/utils/money';
import type { Producto, CrearProductoDTO } from '../../src/types';

const C = {
  fondo: '#0f172a',
  tarjeta: '#1e293b',
  borde: '#334155',
  texto: '#f1f5f9',
  subtexto: '#94a3b8',
  acento: '#38bdf8',
  rojo: '#f87171',
  amarillo: '#fbbf24',
};

const VACIO_DTO: CrearProductoDTO = {
  nombre: '',
  codigo_barras: null,
  precio: 0,
  stock: 0,
  stock_minimo: 1,
  categoria_id: null,
};

export default function PantallaInventario() {
  const router = useRouter();
  const { productos, cargando, error, cargar, buscar, crear, actualizar, eliminar } = useInventario();
  const [busqueda, setBusqueda] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [form, setForm] = useState<CrearProductoDTO>(VACIO_DTO);
  const [precioTexto, setPrecioTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { cargar(); }, [cargar]);

  const handleBusqueda = useCallback(
    (texto: string) => {
      setBusqueda(texto);
      buscar(texto);
    },
    [buscar]
  );

  const abrirCrear = () => {
    setEditando(null);
    setForm(VACIO_DTO);
    setPrecioTexto('');
    setModalVisible(true);
  };

  const abrirEditar = (producto: Producto) => {
    setEditando(producto);
    setForm({
      nombre: producto.nombre,
      codigo_barras: producto.codigo_barras,
      precio: producto.precio,
      stock: producto.stock,
      stock_minimo: producto.stock_minimo,
      categoria_id: producto.categoria_id,
    });
    setPrecioTexto((producto.precio / 100).toFixed(2));
    setModalVisible(true);
  };

  const confirmarEliminar = (producto: Producto) => {
    Alert.alert(
      'Desactivar producto',
      `¿Desactivar "${producto.nombre}"? No aparecerá en ventas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: async () => {
            const err = await eliminar(producto.id);
            if (err) Alert.alert('Error', err);
          },
        },
      ]
    );
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      Alert.alert('Error', 'El nombre del producto es requerido');
      return;
    }
    const precio = cordobasACentavos(parseFloat(precioTexto) || 0);
    const dto = { ...form, precio };

    setGuardando(true);
    let err: string | null;
    if (editando) {
      err = await actualizar(editando.id, dto);
    } else {
      err = await crear(dto);
    }
    setGuardando(false);

    if (err) {
      Alert.alert('Error', err);
    } else {
      setModalVisible(false);
    }
  };

  return (
    <SafeAreaView style={s.pantalla}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.titulo}>Inventario</Text>
        <TouchableOpacity style={s.botonAgregar} onPress={abrirCrear} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color={C.fondo} />
          <Text style={s.botonAgregarTexto}>Agregar</Text>
        </TouchableOpacity>
      </View>

      {/* Búsqueda */}
      <View style={s.busquedaContainer}>
        <Ionicons name="search-outline" size={18} color={C.subtexto} style={s.busquedaIcon} />
        <TextInput
          style={s.busquedaInput}
          placeholder="Buscar producto..."
          placeholderTextColor={C.subtexto}
          value={busqueda}
          onChangeText={handleBusqueda}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => handleBusqueda('')}>
            <Ionicons name="close-circle" size={18} color={C.subtexto} />
          </TouchableOpacity>
        )}
      </View>

      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorTexto}>{error}</Text>
        </View>
      )}

      {cargando && !productos.length ? (
        <View style={s.centrado}>
          <ActivityIndicator color={C.acento} size="large" />
        </View>
      ) : (
        <FlatList
          data={productos}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={s.lista}
          ListEmptyComponent={
            <View style={s.vacio}>
              <Ionicons name="cube-outline" size={48} color={C.borde} />
              <Text style={s.vacioTexto}>
                {busqueda ? 'Sin resultados' : 'Sin productos aún'}
              </Text>
              {!busqueda && (
                <TouchableOpacity onPress={abrirCrear}>
                  <Text style={s.vacioAccion}>+ Agregar primer producto</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.tarjeta} onPress={() => abrirEditar(item)} activeOpacity={0.8}>
              <View style={s.tarjetaInfo}>
                <Text style={s.tarjetaNombre}>{item.nombre}</Text>
                <Text style={s.tarjetaPrecio}>{centavosACordobas(item.precio)}</Text>
              </View>
              <View style={s.tarjetaDerecha}>
                <View style={[s.stockBadge, item.stock <= item.stock_minimo && s.stockBadgeBajo]}>
                  <Text style={s.stockTexto}>{item.stock} uds</Text>
                </View>
                <View style={s.tarjetaAcciones}>
                  <TouchableOpacity
                    onPress={() => router.push(`/palabras-clave/${item.id}`)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="mic-outline" size={18} color={C.acento} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmarEliminar(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={C.rojo} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Modal crear/editar */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.modalOverlay}
        >
          <View style={s.modalContenido}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitulo}>{editando ? 'Editar producto' : 'Nuevo producto'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={C.subtexto} />
              </TouchableOpacity>
            </View>

            <Campo label="Nombre *" >
              <TextInput
                style={s.input}
                placeholder="Ej: Coca-Cola 350ml"
                placeholderTextColor={C.subtexto}
                value={form.nombre}
                onChangeText={(v) => setForm((f) => ({ ...f, nombre: v }))}
              />
            </Campo>

            <Campo label="Precio (C$) *">
              <TextInput
                style={s.input}
                placeholder="0.00"
                placeholderTextColor={C.subtexto}
                keyboardType="decimal-pad"
                value={precioTexto}
                onChangeText={setPrecioTexto}
              />
            </Campo>

            <View style={s.fila}>
              <View style={{ flex: 1 }}>
                <Campo label="Stock inicial">
                  <TextInput
                    style={s.input}
                    keyboardType="number-pad"
                    value={String(form.stock)}
                    onChangeText={(v) => setForm((f) => ({ ...f, stock: parseInt(v) || 0 }))}
                  />
                </Campo>
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Campo label="Stock mínimo">
                  <TextInput
                    style={s.input}
                    keyboardType="number-pad"
                    value={String(form.stock_minimo)}
                    onChangeText={(v) => setForm((f) => ({ ...f, stock_minimo: parseInt(v) || 0 }))}
                  />
                </Campo>
              </View>
            </View>

            <Campo label="Código de barras (opcional)">
              <TextInput
                style={s.input}
                placeholder="Escanear o ingresar"
                placeholderTextColor={C.subtexto}
                value={form.codigo_barras ?? ''}
                onChangeText={(v) => setForm((f) => ({ ...f, codigo_barras: v || null }))}
              />
            </Campo>

            <TouchableOpacity
              style={[s.botonGuardar, guardando && { opacity: 0.6 }]}
              onPress={guardar}
              disabled={guardando}
              activeOpacity={0.85}
            >
              {guardando ? (
                <ActivityIndicator color={C.fondo} />
              ) : (
                <Text style={s.botonGuardarTexto}>
                  {editando ? 'Guardar cambios' : 'Crear producto'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
      {children}
    </View>
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
  botonAgregar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.acento,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 4,
  },
  botonAgregarTexto: { color: C.fondo, fontWeight: '700', fontSize: 14 },
  busquedaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.tarjeta,
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.borde,
    paddingHorizontal: 12,
    height: 44,
  },
  busquedaIcon: { marginRight: 8 },
  busquedaInput: { flex: 1, color: C.texto, fontSize: 15 },
  errorBanner: { backgroundColor: '#450a0a', marginHorizontal: 20, borderRadius: 10, padding: 12, marginBottom: 10 },
  errorTexto: { color: C.rojo, fontSize: 13 },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lista: { paddingHorizontal: 20, paddingBottom: 16, flexGrow: 1 },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  vacioTexto: { fontSize: 16, color: C.subtexto, fontWeight: '600' },
  vacioAccion: { color: C.acento, fontSize: 14, marginTop: 4 },
  tarjeta: {
    backgroundColor: C.tarjeta,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.borde,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tarjetaInfo: { flex: 1 },
  tarjetaNombre: { fontSize: 15, fontWeight: '600', color: C.texto },
  tarjetaPrecio: { fontSize: 14, color: C.acento, marginTop: 2 },
  tarjetaDerecha: { alignItems: 'flex-end', gap: 8 },
  tarjetaAcciones: { flexDirection: 'row', gap: 14 },
  stockBadge: { backgroundColor: '#1a3a1a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  stockBadgeBajo: { backgroundColor: '#3a1a00' },
  stockTexto: { color: C.texto, fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContenido: {
    backgroundColor: C.tarjeta,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitulo: { fontSize: 18, fontWeight: '700', color: C.texto },
  input: {
    backgroundColor: C.fondo,
    borderWidth: 1,
    borderColor: C.borde,
    borderRadius: 10,
    padding: 12,
    color: C.texto,
    fontSize: 15,
  },
  fila: { flexDirection: 'row' },
  botonGuardar: {
    backgroundColor: C.acento,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  botonGuardarTexto: { color: C.fondo, fontWeight: '700', fontSize: 16 },
});

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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useInventario } from '../../src/hooks/useInventario';
import { centavosACordobas, cordobasACentavos } from '../../src/utils/money';
import type { Producto, CrearProductoDTO } from '../../src/types';

import { COLORES as C } from '../../src/theme/colors';
const VACIO_DTO: CrearProductoDTO = {
  nombre: '',
  codigo_barras: null,
  precio: 0,
  precio_costo: 0,
  stock: 0,
  stock_minimo: 1,
  categoria_id: null,
  fecha_vencimiento: null,
  unidad: 'unidad',
};

const UNIDADES: Array<{ valor: 'unidad' | 'caja' | 'docena' | 'libra' | 'litro' | 'paquete'; label: string }> = [
  { valor: 'unidad', label: 'Unidad' },
  { valor: 'caja', label: 'Caja' },
  { valor: 'docena', label: 'Docena' },
  { valor: 'libra', label: 'Libra' },
  { valor: 'litro', label: 'Litro' },
  { valor: 'paquete', label: 'Paquete' },
];

export default function PantallaInventario() {
  const router = useRouter();
  const { productos, cargando, error, cargar, buscar, crear, actualizar, eliminar } = useInventario();
  const [busqueda, setBusqueda] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [form, setForm] = useState<CrearProductoDTO>(VACIO_DTO);
  const [precioTexto, setPrecioTexto] = useState('');
  const [precioCostoTexto, setPrecioCostoTexto] = useState('');
  const [fechaVencTexto, setFechaVencTexto] = useState(''); // formato DD/MM/AAAA
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
    setPrecioCostoTexto('');
    setFechaVencTexto('');
    setModalVisible(true);
  };

  const abrirEditar = (producto: Producto) => {
    setEditando(producto);
    setForm({
      nombre: producto.nombre,
      codigo_barras: producto.codigo_barras,
      precio: producto.precio,
      precio_costo: producto.precio_costo ?? 0,
      stock: producto.stock,
      stock_minimo: producto.stock_minimo,
      categoria_id: producto.categoria_id,
      fecha_vencimiento: producto.fecha_vencimiento ?? null,
      unidad: producto.unidad ?? 'unidad',
    });
    setPrecioTexto((producto.precio / 100).toFixed(2));
    setPrecioCostoTexto(producto.precio_costo > 0 ? (producto.precio_costo / 100).toFixed(2) : '');
    // ISO yyyy-mm-dd → DD/MM/AAAA
    if (producto.fecha_vencimiento) {
      const [yyyy, mm, dd] = producto.fecha_vencimiento.split('-');
      setFechaVencTexto(`${dd}/${mm}/${yyyy}`);
    } else {
      setFechaVencTexto('');
    }
    setModalVisible(true);
  };

  /**
   * DD/MM/AAAA → ISO yyyy-mm-dd.
   * Devuelve null si el formato no es válido.
   */
  const parseFechaVenc = (texto: string): string | null => {
    const limpio = texto.trim();
    if (!limpio) return null;
    const match = limpio.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const dd = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    const yyyy = parseInt(match[3], 10);
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yyyy < 2020 || yyyy > 2099) return null;
    // Validar que el día existe en ese mes
    const fecha = new Date(yyyy, mm - 1, dd);
    if (fecha.getMonth() !== mm - 1 || fecha.getDate() !== dd) return null;
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
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
    if (!precioTexto.trim()) {
      Alert.alert('Error', 'El precio de venta es requerido');
      return;
    }
    const precioNum = parseFloat(precioTexto);
    if (isNaN(precioNum)) {
      Alert.alert('Error', 'El precio debe ser un número válido');
      return;
    }
    const precioCostoNum = precioCostoTexto.trim() ? parseFloat(precioCostoTexto) : 0;
    if (isNaN(precioCostoNum)) {
      Alert.alert('Error', 'El precio de costo debe ser un número válido');
      return;
    }
    const precio = cordobasACentavos(precioNum);
    const precio_costo = cordobasACentavos(precioCostoNum);
    const fecha_vencimiento = parseFechaVenc(fechaVencTexto);
    if (fechaVencTexto.trim() && !fecha_vencimiento) {
      Alert.alert('Fecha inválida', 'Usa el formato DD/MM/AAAA, ej: 11/06/2027');
      return;
    }
    if (precio_costo > 0 && precio > 0 && precio < precio_costo) {
      Alert.alert(
        'Precio menor al costo',
        'El precio de venta es menor al precio de costo. ¿Continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', onPress: () => guardarConfirmado({ precio, precio_costo, fecha_vencimiento }) },
        ]
      );
      return;
    }
    await guardarConfirmado({ precio, precio_costo, fecha_vencimiento });
  };

  const guardarConfirmado = async (
    extra: { precio: number; precio_costo: number; fecha_vencimiento: string | null }
  ) => {
    const dto = { ...form, ...extra };

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

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Campo label="Nombre *" >
              <TextInput
                style={s.input}
                placeholder="Ej: Coca-Cola 350ml"
                placeholderTextColor={C.subtexto}
                value={form.nombre}
                onChangeText={(v) => setForm((f) => ({ ...f, nombre: v }))}
              />
            </Campo>

            <View style={s.fila}>
              <View style={{ flex: 1 }}>
                <Campo label="Precio venta (C$) *">
                  <TextInput
                    style={s.input}
                    placeholder="0.00"
                    placeholderTextColor={C.subtexto}
                    keyboardType="decimal-pad"
                    value={precioTexto}
                    onChangeText={setPrecioTexto}
                  />
                </Campo>
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Campo label="Precio costo (C$)">
                  <TextInput
                    style={s.input}
                    placeholder="0.00"
                    placeholderTextColor={C.subtexto}
                    keyboardType="decimal-pad"
                    value={precioCostoTexto}
                    onChangeText={setPrecioCostoTexto}
                  />
                </Campo>
              </View>
            </View>

            {parseFloat(precioTexto) > 0 && parseFloat(precioCostoTexto) > 0 && (
              <Text style={s.margenTexto}>
                Ganancia: C$ {(parseFloat(precioTexto) - parseFloat(precioCostoTexto)).toFixed(2)}
                {'  '}({(((parseFloat(precioTexto) - parseFloat(precioCostoTexto)) / parseFloat(precioTexto)) * 100).toFixed(0)}%)
              </Text>
            )}

            <Campo label="Unidad de medida">
              <View style={s.chipRow}>
                {UNIDADES.map(({ valor, label }) => (
                  <TouchableOpacity
                    key={valor}
                    style={[s.chipUnidad, form.unidad === valor && s.chipUnidadActivo]}
                    onPress={() => setForm((f) => ({ ...f, unidad: valor }))}
                  >
                    <Text style={[s.chipUnidadTexto, form.unidad === valor && s.chipUnidadTextoActivo]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Campo>

            <Campo label="Vencimiento (opcional)">
              <TextInput
                style={s.input}
                placeholder="DD/MM/AAAA — ej: 11/06/2027"
                placeholderTextColor={C.subtexto}
                keyboardType="number-pad"
                maxLength={10}
                value={fechaVencTexto}
                onChangeText={(v) => {
                  // Solo números
                  const cleaned = v.replace(/\D/g, '');
                  let formatted = '';
                  if (cleaned.length >= 1) formatted = cleaned.slice(0, 2);
                  if (cleaned.length >= 3) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
                  if (cleaned.length >= 5) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4) + '/' + cleaned.slice(4, 8);
                  setFechaVencTexto(formatted);
                }}
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: C.subtexto, fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
  errorBanner: { backgroundColor: C.rojoClaro, marginHorizontal: 20, borderRadius: 10, padding: 12, marginBottom: 10 },
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
  stockBadge: { backgroundColor: C.verdeClaro, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  stockBadgeBajo: { backgroundColor: C.amarilloClaro },
  stockTexto: { color: C.texto, fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContenido: {
    backgroundColor: C.tarjeta,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '88%',
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
  margenTexto: { color: C.verde, fontSize: 13, fontWeight: '600', marginTop: -8, marginBottom: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipUnidad: {
    borderWidth: 1,
    borderColor: C.borde,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: C.fondo,
  },
  chipUnidadActivo: { backgroundColor: C.acento, borderColor: C.acento },
  chipUnidadTexto: { color: C.subtexto, fontSize: 13, fontWeight: '600' },
  chipUnidadTextoActivo: { color: C.fondo },
});

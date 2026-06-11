import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProductoRepository } from '../../src/database/repositories/ProductoRepository';
import { COLORES as C } from '../../src/theme/colors';
import type { Producto, PalabraClave } from '../../src/types';

export default function PantallaKeywords() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const productoId = parseInt(id, 10);

  const [producto, setProducto] = useState<Producto | null>(null);
  const [palabras, setPalabras] = useState<PalabraClave[]>([]);
  const [nuevaPalabra, setNuevaPalabra] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const [prodResult, kwResult] = await Promise.all([
      ProductoRepository.obtenerPorId(productoId),
      ProductoRepository.obtenerPalabrasClave(productoId),
    ]);
    if (prodResult.ok) setProducto(prodResult.data);
    if (kwResult.ok) setPalabras(kwResult.data);
    setCargando(false);
  }, [productoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const agregar = useCallback(async () => {
    const palabra = nuevaPalabra.trim().toLowerCase();
    if (!palabra) return;

    if (palabras.some((p) => p.palabra === palabra)) {
      Alert.alert('Duplicada', `"${palabra}" ya está registrada para este producto.`);
      return;
    }

    setGuardando(true);
    const result = await ProductoRepository.agregarPalabraClave(productoId, palabra);
    setGuardando(false);

    if (result.ok) {
      setNuevaPalabra('');
      await cargar();
    } else {
      Alert.alert('Error', result.error);
    }
  }, [nuevaPalabra, palabras, productoId, cargar]);

  const eliminar = useCallback((kw: PalabraClave) => {
    Alert.alert(
      'Eliminar palabra',
      `¿Eliminar "${kw.palabra}"? El motor de voz dejará de reconocerla.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const result = await ProductoRepository.eliminarPalabraClave(kw.id);
            if (result.ok) await cargar();
            else Alert.alert('Error', result.error);
          },
        },
      ]
    );
  }, [cargar]);

  if (cargando) {
    return (
      <View style={[s.pantalla, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.acento} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.pantalla}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.btnVolver}>
          <Ionicons name="arrow-back" size={22} color={C.texto} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerTitulo} numberOfLines={1}>
            {producto?.nombre ?? 'Producto'}
          </Text>
          <Text style={s.headerSub}>Palabras clave para reconocimiento de voz</Text>
        </View>
      </View>

      {/* Explicación */}
      <View style={s.infoBanner}>
        <Ionicons name="mic-outline" size={18} color={C.acento} />
        <Text style={s.infoTexto}>
          El motor de voz reconocerá este producto cuando el usuario diga alguna de estas palabras.
        </Text>
      </View>

      {/* Palabras existentes */}
      <FlatList
        data={palabras}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={s.lista}
        ListEmptyComponent={
          <View style={s.vacio}>
            <Ionicons name="chatbubble-ellipses-outline" size={40} color={C.borde} />
            <Text style={s.vacioTexto}>Sin palabras clave aún</Text>
            <Text style={s.vacioSub}>
              Agrega términos como el nombre del producto, abreviaciones o como lo llaman tus clientes.
            </Text>
          </View>
        }
        ListHeaderComponent={
          palabras.length > 0 ? (
            <Text style={s.seccionLabel}>
              {palabras.length} palabra{palabras.length !== 1 ? 's' : ''} configurada{palabras.length !== 1 ? 's' : ''}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={s.chipRow}>
            <View style={s.chip}>
              <Ionicons name="mic" size={14} color={C.acento} style={{ marginRight: 6 }} />
              <Text style={s.chipTexto}>{item.palabra}</Text>
            </View>
            <TouchableOpacity
              onPress={() => eliminar(item)}
              style={s.btnEliminar}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={22} color={C.rojo} />
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Input para agregar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.inputArea}
      >
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Ej: clavo, tornillo, puntilla…"
            placeholderTextColor={C.subtexto}
            value={nuevaPalabra}
            onChangeText={setNuevaPalabra}
            onSubmitEditing={agregar}
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[s.btnAgregar, (!nuevaPalabra.trim() || guardando) && s.btnDeshabilitado]}
            onPress={agregar}
            disabled={!nuevaPalabra.trim() || guardando}
            activeOpacity={0.8}
          >
            {guardando ? (
              <ActivityIndicator color={C.fondo} size="small" />
            ) : (
              <Ionicons name="add" size={24} color={C.fondo} />
            )}
          </TouchableOpacity>
        </View>

        <Text style={s.inputHint}>
          Escribe en minúsculas como lo diría un cliente. Puedes agregar tantas como quieras.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
  },
  btnVolver: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.tarjeta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitulo: { fontSize: 18, fontWeight: '700', color: C.texto },
  headerSub: { fontSize: 12, color: C.subtexto, marginTop: 2 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.acentoSuave,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.acento,
  },
  infoTexto: { flex: 1, fontSize: 13, color: C.acentoTexto, lineHeight: 18 },
  lista: { paddingHorizontal: 20, paddingBottom: 16, flexGrow: 1 },
  seccionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.subtexto,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  vacio: { alignItems: 'center', paddingTop: 60, gap: 10 },
  vacioTexto: { fontSize: 15, fontWeight: '600', color: C.subtexto },
  vacioSub: {
    fontSize: 13,
    color: C.borde,
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.tarjeta,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borde,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chipTexto: { fontSize: 15, color: C.texto, fontWeight: '500' },
  btnEliminar: { padding: 2 },
  inputArea: {
    backgroundColor: C.tarjeta,
    borderTopWidth: 1,
    borderTopColor: C.borde,
    padding: 16,
    paddingBottom: 24,
  },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  input: {
    flex: 1,
    backgroundColor: C.fondo,
    borderWidth: 1,
    borderColor: C.borde,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: C.texto,
  },
  btnAgregar: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: C.acento,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeshabilitado: { opacity: 0.4 },
  inputHint: { fontSize: 12, color: C.subtexto, lineHeight: 16 },
});

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { UsuarioRepository } from '../../src/database/repositories/UsuarioRepository';
import { useSesion } from '../../src/context/SesionContext';
import type { Usuario, RolUsuario } from '../../src/types';

const C = {
  fondo: '#0f172a', tarjeta: '#1e293b', borde: '#334155',
  texto: '#f1f5f9', subtexto: '#94a3b8', acento: '#38bdf8',
  verde: '#4ade80', rojo: '#f87171', amarillo: '#fbbf24',
};

export default function PantallaUsuarios() {
  const router = useRouter();
  const { esAdmin, cerrarSesion, sesion } = useSesion();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<RolUsuario>('invitado');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await UsuarioRepository.obtenerTodos();
    if (r.ok) setUsuarios(r.data);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Solo admins pueden acceder
  useEffect(() => {
    if (!esAdmin) router.back();
  }, [esAdmin]);

  const abrirModal = () => {
    setNombre(''); setRol('invitado'); setPin(''); setPinConfirm('');
    setModalVisible(true);
  };

  const guardar = async () => {
    if (!nombre.trim()) { Alert.alert('Error', 'El nombre es requerido'); return; }
    if (pin.length !== 4) { Alert.alert('Error', 'El PIN debe tener 4 dígitos'); return; }
    if (pin !== pinConfirm) { Alert.alert('Error', 'Los PINs no coinciden'); return; }

    setGuardando(true);
    const result = await UsuarioRepository.crear({ nombre: nombre.trim(), rol, pin });
    setGuardando(false);

    if (result.ok) {
      setModalVisible(false);
      await cargar();
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const confirmarEliminar = (u: Usuario) => {
    if (u.id === sesion?.usuario.id) {
      Alert.alert('No permitido', 'No puedes eliminar tu propio usuario');
      return;
    }
    Alert.alert(
      'Eliminar usuario',
      `¿Eliminar a "${u.nombre}"? Ya no podrá acceder al sistema.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            const r = await UsuarioRepository.desactivar(u.id);
            if (r.ok) await cargar();
            else Alert.alert('Error', r.error);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.pantalla}>
      <View style={s.header}>
        <TouchableOpacity style={s.btnVolver} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={C.texto} />
        </TouchableOpacity>
        <Text style={s.titulo}>Usuarios</Text>
        <TouchableOpacity style={s.btnAgregar} onPress={abrirModal} activeOpacity={0.8}>
          <Ionicons name="add" size={20} color={C.fondo} />
          <Text style={s.btnAgregarTexto}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {cargando ? (
        <View style={s.centrado}><ActivityIndicator color={C.acento} size="large" /></View>
      ) : (
        <FlatList
          data={usuarios}
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={s.lista}
          ListEmptyComponent={
            <View style={s.vacio}>
              <Ionicons name="people-outline" size={48} color={C.borde} />
              <Text style={s.vacioTexto}>Sin usuarios</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[s.card, !item.activo && s.cardInactivo]}>
              <View style={[s.avatar, item.rol === 'admin' && s.avatarAdmin]}>
                <Text style={s.avatarTexto}>{item.nombre.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.cardHeader}>
                  <Text style={s.cardNombre}>{item.nombre}</Text>
                  {item.id === sesion?.usuario.id && (
                    <View style={s.tuBadge}><Text style={s.tuBadgeTexto}>Tú</Text></View>
                  )}
                </View>
                <Text style={s.cardRol}>
                  {item.rol === 'admin' ? '👑 Administrador' : '👤 Invitado'}
                </Text>
                {item.ultimo_acceso && (
                  <Text style={s.cardAcceso}>
                    Último acceso: {new Date(item.ultimo_acceso).toLocaleDateString('es-NI')}
                  </Text>
                )}
              </View>
              {item.id !== sesion?.usuario.id && item.activo && (
                <TouchableOpacity
                  onPress={() => confirmarEliminar(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color={C.rojo} />
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {/* Botón cerrar sesión */}
      <TouchableOpacity style={s.btnCerrarSesion} onPress={cerrarSesion} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={18} color={C.rojo} />
        <Text style={s.btnCerrarSesionTexto}>Cerrar sesión</Text>
      </TouchableOpacity>

      {/* Modal nuevo usuario */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContenido}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitulo}>Nuevo usuario</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={C.subtexto} />
              </TouchableOpacity>
            </View>

            <Campo label="Nombre">
              <TextInput
                style={s.input}
                placeholder="Ej: María López"
                placeholderTextColor={C.subtexto}
                value={nombre}
                onChangeText={setNombre}
                autoCapitalize="words"
              />
            </Campo>

            <Campo label="Rol">
              <View style={s.rolSelector}>
                {(['invitado', 'admin'] as RolUsuario[]).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[s.rolChip, rol === r && s.rolChipActivo]}
                    onPress={() => setRol(r)}
                  >
                    <Text style={[s.rolChipTexto, rol === r && s.rolChipTextoActivo]}>
                      {r === 'admin' ? '👑 Admin' : '👤 Invitado'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Campo>

            <Campo label="PIN (4 dígitos)">
              <TextInput
                style={[s.input, s.inputPin]}
                placeholder="••••"
                placeholderTextColor={C.subtexto}
                value={pin}
                onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
            </Campo>

            <Campo label="Confirmar PIN">
              <TextInput
                style={[s.input, s.inputPin]}
                placeholder="••••"
                placeholderTextColor={C.subtexto}
                value={pinConfirm}
                onChangeText={(v) => setPinConfirm(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
            </Campo>

            <TouchableOpacity
              style={[s.btnGuardar, guardando && { opacity: 0.6 }]}
              onPress={guardar}
              disabled={guardando}
              activeOpacity={0.85}
            >
              {guardando
                ? <ActivityIndicator color={C.fondo} />
                : <Text style={s.btnGuardarTexto}>Crear usuario</Text>}
            </TouchableOpacity>
          </View>
        </View>
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12,
  },
  btnVolver: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: C.tarjeta, alignItems: 'center', justifyContent: 'center',
  },
  titulo: { flex: 1, fontSize: 20, fontWeight: '700', color: C.texto },
  btnAgregar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.acento, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  btnAgregarTexto: { color: C.fondo, fontWeight: '700', fontSize: 13 },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lista: { paddingHorizontal: 20, paddingBottom: 16, flexGrow: 1, gap: 10 },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  vacioTexto: { fontSize: 15, color: C.subtexto, fontWeight: '600' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.tarjeta, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: C.borde, gap: 12,
  },
  cardInactivo: { opacity: 0.5 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: C.borde, alignItems: 'center', justifyContent: 'center',
  },
  avatarAdmin: { backgroundColor: C.acento },
  avatarTexto: { fontSize: 20, fontWeight: '700', color: C.fondo },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardNombre: { fontSize: 15, fontWeight: '600', color: C.texto },
  tuBadge: { backgroundColor: '#1a3a1a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tuBadgeTexto: { color: C.verde, fontSize: 10, fontWeight: '700' },
  cardRol: { fontSize: 12, color: C.subtexto, marginTop: 2 },
  cardAcceso: { fontSize: 11, color: C.borde, marginTop: 2 },
  btnCerrarSesion: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, margin: 20, padding: 14,
    backgroundColor: '#3a0808', borderRadius: 14,
    borderWidth: 1, borderColor: '#5a1010',
  },
  btnCerrarSesionTexto: { color: C.rojo, fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContenido: {
    backgroundColor: C.tarjeta, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  modalTitulo: { fontSize: 18, fontWeight: '700', color: C.texto },
  input: {
    backgroundColor: C.fondo, borderWidth: 1, borderColor: C.borde,
    borderRadius: 10, padding: 12, color: C.texto, fontSize: 15,
  },
  inputPin: { fontSize: 22, textAlign: 'center', letterSpacing: 8 },
  rolSelector: { flexDirection: 'row', gap: 10 },
  rolChip: {
    flex: 1, padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: C.borde, alignItems: 'center',
  },
  rolChipActivo: { borderColor: C.acento, backgroundColor: '#0c2233' },
  rolChipTexto: { color: C.subtexto, fontWeight: '600', fontSize: 13 },
  rolChipTextoActivo: { color: C.acento },
  btnGuardar: {
    backgroundColor: C.acento, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  btnGuardarTexto: { color: C.fondo, fontWeight: '700', fontSize: 16 },
});

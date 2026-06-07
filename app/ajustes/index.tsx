import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getDb } from '../../src/database/db';
import { useSesion } from '../../src/context/SesionContext';
import { useConectividad } from '../../src/hooks/useConectividad';
import { UsuarioRepository } from '../../src/database/repositories/UsuarioRepository';
import type { Negocio } from '../../src/types';

const C = {
  fondo: '#0f172a', tarjeta: '#1e293b', borde: '#334155',
  texto: '#f1f5f9', subtexto: '#94a3b8', acento: '#38bdf8',
  verde: '#4ade80', rojo: '#f87171', amarillo: '#fbbf24',
};

const PLANES: Record<string, string> = {
  basico: '⭐ Plan Básico — $4/mes',
  premium: '🚀 Plan Premium — $8/mes',
  empresarial: '🏢 Plan Empresarial — $12/mes',
};

export default function PantallaAjustes() {
  const router = useRouter();
  const { sesion, esAdmin, cerrarSesion } = useSesion();
  const { conectado } = useConectividad();
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [nombreEditable, setNombreEditable] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [cambiandoPin, setCambiandoPin] = useState(false);

  const cargar = useCallback(async () => {
    const db = await getDb();
    const row = await db.getFirstAsync<Negocio>('SELECT * FROM negocios WHERE id = 1');
    if (row) {
      setNegocio(row);
      setNombreEditable(row.nombre);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardarNombre = async () => {
    if (!nombreEditable.trim()) {
      Alert.alert('Error', 'El nombre del negocio no puede estar vacío');
      return;
    }
    setGuardando(true);
    const db = await getDb();
    await db.runAsync(
      "UPDATE negocios SET nombre = ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 1",
      [nombreEditable.trim()]
    );
    await cargar();
    setGuardando(false);
    setEditando(false);
    Alert.alert('✓ Guardado', 'Nombre del negocio actualizado');
  };

  const cambiarPin = async () => {
    if (pinNuevo.length !== 4) {
      Alert.alert('Error', 'El PIN nuevo debe tener 4 dígitos'); return;
    }
    if (pinNuevo !== pinConfirm) {
      Alert.alert('Error', 'Los PINs no coinciden'); return;
    }
    if (!sesion) return;

    setCambiandoPin(true);
    const result = await UsuarioRepository.cambiarPin(
      sesion.usuario.id, pinActual, pinNuevo
    );
    setCambiandoPin(false);

    if (result.ok) {
      setPinActual(''); setPinNuevo(''); setPinConfirm('');
      Alert.alert('✓ PIN actualizado', 'Tu nuevo PIN está activo');
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const confirmarCerrarSesion = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: cerrarSesion },
    ]);
  };

  return (
    <SafeAreaView style={s.pantalla}>
      <View style={s.header}>
        <TouchableOpacity style={s.btnVolver} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={C.texto} />
        </TouchableOpacity>
        <Text style={s.titulo}>Ajustes</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Sesión activa */}
        <Seccion titulo="MI CUENTA">
          <View style={s.fila}>
            <View style={s.filaIcono}>
              <Ionicons name="person-circle-outline" size={20} color={C.acento} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.filaLabel}>{sesion?.usuario.nombre}</Text>
              <Text style={s.filaSub}>
                {sesion?.usuario.rol === 'admin' ? '👑 Administrador' : '👤 Invitado'}
              </Text>
            </View>
          </View>

          <View style={s.fila}>
            <View style={s.filaIcono}>
              <Ionicons
                name={conectado ? 'wifi' : 'cloud-offline-outline'}
                size={20}
                color={conectado ? C.verde : C.amarillo}
              />
            </View>
            <Text style={s.filaLabel}>
              {conectado === null ? 'Verificando conexión...'
                : conectado ? 'Online — sincronización disponible'
                : 'Offline — funcionando sin internet'}
            </Text>
          </View>
        </Seccion>

        {/* Negocio — solo admin */}
        {esAdmin && negocio && (
          <Seccion titulo="MI NEGOCIO">
            <View style={s.fila}>
              <View style={s.filaIcono}>
                <Ionicons name="storefront-outline" size={20} color={C.acento} />
              </View>
              <View style={{ flex: 1 }}>
                {editando ? (
                  <TextInput
                    style={s.inputNombre}
                    value={nombreEditable}
                    onChangeText={setNombreEditable}
                    autoFocus
                    autoCapitalize="words"
                  />
                ) : (
                  <Text style={s.filaLabel}>{negocio.nombre}</Text>
                )}
                <Text style={s.filaSub}>Nombre del negocio</Text>
              </View>
              {esAdmin && (
                editando ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => { setEditando(false); setNombreEditable(negocio.nombre); }}>
                      <Ionicons name="close" size={20} color={C.rojo} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={guardarNombre} disabled={guardando}>
                      {guardando
                        ? <ActivityIndicator size="small" color={C.verde} />
                        : <Ionicons name="checkmark" size={20} color={C.verde} />}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setEditando(true)}>
                    <Ionicons name="pencil-outline" size={18} color={C.subtexto} />
                  </TouchableOpacity>
                )
              )}
            </View>

            <View style={s.fila}>
              <View style={s.filaIcono}>
                <Ionicons name="star-outline" size={20} color={C.amarillo} />
              </View>
              <Text style={s.filaLabel}>{PLANES[negocio.plan] ?? negocio.plan}</Text>
            </View>

            <TouchableOpacity
              style={s.fila}
              onPress={() => router.push('/usuarios')}
              activeOpacity={0.7}
            >
              <View style={s.filaIcono}>
                <Ionicons name="people-outline" size={20} color={C.acento} />
              </View>
              <Text style={[s.filaLabel, { flex: 1 }]}>Gestionar usuarios</Text>
              <Ionicons name="chevron-forward" size={16} color={C.subtexto} />
            </TouchableOpacity>
          </Seccion>
        )}

        {/* Seguridad */}
        <Seccion titulo="SEGURIDAD">
          <View style={{ gap: 12 }}>
            <Campo label="PIN actual">
              <TextInput
                style={s.input}
                placeholder="••••"
                placeholderTextColor={C.subtexto}
                value={pinActual}
                onChangeText={(v) => setPinActual(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
            </Campo>
            <Campo label="PIN nuevo">
              <TextInput
                style={s.input}
                placeholder="••••"
                placeholderTextColor={C.subtexto}
                value={pinNuevo}
                onChangeText={(v) => setPinNuevo(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
            </Campo>
            <Campo label="Confirmar PIN nuevo">
              <TextInput
                style={s.input}
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
              style={[s.btnCambiarPin, cambiandoPin && { opacity: 0.6 }]}
              onPress={cambiarPin}
              disabled={cambiandoPin}
              activeOpacity={0.85}
            >
              {cambiandoPin
                ? <ActivityIndicator color={C.fondo} size="small" />
                : <Text style={s.btnCambiarPinTexto}>Cambiar PIN</Text>}
            </TouchableOpacity>
          </View>
        </Seccion>

        {/* Acerca de */}
        <Seccion titulo="ACERCA DE">
          <View style={s.fila}>
            <View style={s.filaIcono}>
              <Ionicons name="information-circle-outline" size={20} color={C.subtexto} />
            </View>
            <View>
              <Text style={s.filaLabel}>StockVoz</Text>
              <Text style={s.filaSub}>Versión 1.0.0 · Nicaragua 2026</Text>
            </View>
          </View>
        </Seccion>

        {/* Cerrar sesión */}
        <TouchableOpacity style={s.btnCerrarSesion} onPress={confirmarCerrarSesion} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={C.rojo} />
          <Text style={s.btnCerrarTexto}>Cerrar sesión</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={s.seccionTitulo}>{titulo}</Text>
      <View style={s.seccionContenido}>{children}</View>
    </View>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' }}>
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
  titulo: { fontSize: 20, fontWeight: '700', color: C.texto },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  seccionTitulo: {
    fontSize: 11, fontWeight: '700', color: C.subtexto,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  seccionContenido: {
    backgroundColor: C.tarjeta, borderRadius: 14,
    borderWidth: 1, borderColor: C.borde, overflow: 'hidden',
  },
  fila: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.borde,
    gap: 12,
  },
  filaIcono: { width: 28, alignItems: 'center' },
  filaLabel: { fontSize: 15, color: C.texto, fontWeight: '500' },
  filaSub: { fontSize: 12, color: C.subtexto, marginTop: 2 },
  inputNombre: {
    fontSize: 15, color: C.texto, fontWeight: '500',
    borderBottomWidth: 1, borderBottomColor: C.acento, paddingBottom: 2,
  },
  input: {
    backgroundColor: C.fondo, borderWidth: 1, borderColor: C.borde,
    borderRadius: 10, padding: 12, color: C.texto,
    fontSize: 18, textAlign: 'center', letterSpacing: 8,
  },
  btnCambiarPin: {
    backgroundColor: C.acento, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  btnCambiarPinTexto: { color: C.fondo, fontWeight: '700', fontSize: 15 },
  btnCerrarSesion: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, backgroundColor: '#3a0808',
    borderRadius: 14, borderWidth: 1, borderColor: '#5a1010', marginTop: 8,
  },
  btnCerrarTexto: { color: C.rojo, fontWeight: '700', fontSize: 15 },
});

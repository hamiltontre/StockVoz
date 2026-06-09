/**
 * Pantalla de configuración inicial — solo aparece la primera vez.
 * El usuario crea el nombre del negocio y el PIN del administrador.
 */
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { UsuarioRepository } from '../../src/database/repositories/UsuarioRepository';
import { useSesion } from '../../src/context/SesionContext';
import { getDb } from '../../src/database/db';

import { COLORES as C } from '../../src/theme/colors';
export default function PantallaSetup() {
  const router = useRouter();
  const { iniciarSesion } = useSesion();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [nombreAdmin, setNombreAdmin] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [guardando, setGuardando] = useState(false);

  const continuarPaso1 = () => {
    if (!nombreNegocio.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el nombre de tu negocio');
      return;
    }
    if (!nombreAdmin.trim()) {
      Alert.alert('Campo requerido', 'Ingresa tu nombre');
      return;
    }
    setPaso(2);
  };

  const finalizar = async () => {
    if (pin.length !== 4) {
      Alert.alert('PIN inválido', 'El PIN debe tener exactamente 4 dígitos');
      return;
    }
    if (pin !== pinConfirm) {
      Alert.alert('PIN no coincide', 'Los PINs ingresados son diferentes');
      return;
    }

    setGuardando(true);
    try {
      // Guardar nombre del negocio
      const db = await getDb();
      await db.runAsync(
        "UPDATE negocios SET nombre = ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 1",
        [nombreNegocio.trim()]
      );

      // Crear usuario administrador
      const result = await UsuarioRepository.crear({
        nombre: nombreAdmin.trim(),
        rol: 'admin',
        pin,
      });

      if (!result.ok) {
        Alert.alert('Error', result.error);
        setGuardando(false);
        return;
      }

      // Loguear directamente — no tiene sentido pedir PIN recién creado
      iniciarSesion(result.data);
    } catch (e) {
      Alert.alert('Error', String(e));
      setGuardando(false);
    }
  };

  return (
    <SafeAreaView style={s.pantalla}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={s.logoArea}>
            <View style={s.logoCircle}>
              <Ionicons name="storefront" size={40} color={C.acento} />
            </View>
            <Text style={s.appNombre}>StockVoz</Text>
            <Text style={s.bienvenida}>Bienvenido. Configura tu negocio para comenzar.</Text>
          </View>

          {/* Indicador de pasos */}
          <View style={s.pasos}>
            <View style={[s.paso, paso >= 1 && s.pasoActivo]}>
              <Text style={[s.pasoNum, paso >= 1 && s.pasoNumActivo]}>1</Text>
            </View>
            <View style={s.pasoLinea} />
            <View style={[s.paso, paso >= 2 && s.pasoActivo]}>
              <Text style={[s.pasoNum, paso >= 2 && s.pasoNumActivo]}>2</Text>
            </View>
          </View>

          {paso === 1 ? (
            <View style={s.form}>
              <Text style={s.stepTitulo}>Datos del negocio</Text>

              <Campo label="Nombre de tu negocio">
                <TextInput
                  style={s.input}
                  placeholder="Ej: Ferretería Los Ángeles"
                  placeholderTextColor={C.subtexto}
                  value={nombreNegocio}
                  onChangeText={setNombreNegocio}
                  autoCapitalize="words"
                />
              </Campo>

              <Campo label="Tu nombre (administrador)">
                <TextInput
                  style={s.input}
                  placeholder="Ej: Juan Pérez"
                  placeholderTextColor={C.subtexto}
                  value={nombreAdmin}
                  onChangeText={setNombreAdmin}
                  autoCapitalize="words"
                />
              </Campo>

              <TouchableOpacity style={s.btnPrimario} onPress={continuarPaso1} activeOpacity={0.85}>
                <Text style={s.btnPrimarioTexto}>Continuar</Text>
                <Ionicons name="arrow-forward" size={18} color={C.fondo} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.form}>
              <Text style={s.stepTitulo}>Crea tu PIN de seguridad</Text>
              <Text style={s.stepSub}>
                El PIN protege el acceso al sistema. Solo tú lo sabrás.
              </Text>

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

              <View style={s.filaBotones}>
                <TouchableOpacity style={s.btnSecundario} onPress={() => setPaso(1)}>
                  <Ionicons name="arrow-back" size={18} color={C.subtexto} />
                  <Text style={s.btnSecundarioTexto}>Atrás</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.btnPrimario, { flex: 1 }, guardando && { opacity: 0.6 }]}
                  onPress={finalizar}
                  disabled={guardando}
                  activeOpacity={0.85}
                >
                  {guardando ? (
                    <ActivityIndicator color={C.fondo} />
                  ) : (
                    <>
                      <Text style={s.btnPrimarioTexto}>Comenzar</Text>
                      <Ionicons name="checkmark" size={18} color={C.fondo} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  scroll: { flexGrow: 1, padding: 24 },
  logoArea: { alignItems: 'center', paddingTop: 20, paddingBottom: 32 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.tarjeta, borderWidth: 2, borderColor: C.acento,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  appNombre: { fontSize: 28, fontWeight: '800', color: C.texto, marginBottom: 6 },
  bienvenida: { fontSize: 14, color: C.subtexto, textAlign: 'center', lineHeight: 20 },
  pasos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  paso: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.tarjeta, borderWidth: 2, borderColor: C.borde,
    alignItems: 'center', justifyContent: 'center',
  },
  pasoActivo: { borderColor: C.acento, backgroundColor: C.acento },
  pasoNum: { fontSize: 14, fontWeight: '700', color: C.subtexto },
  pasoNumActivo: { color: C.fondo },
  pasoLinea: { width: 40, height: 2, backgroundColor: C.borde, marginHorizontal: 8 },
  form: { gap: 4 },
  stepTitulo: { fontSize: 20, fontWeight: '700', color: C.texto, marginBottom: 6 },
  stepSub: { fontSize: 13, color: C.subtexto, marginBottom: 20, lineHeight: 18 },
  input: {
    backgroundColor: C.tarjeta, borderWidth: 1, borderColor: C.borde,
    borderRadius: 12, padding: 14, color: C.texto, fontSize: 15,
  },
  inputPin: { fontSize: 24, textAlign: 'center', letterSpacing: 8 },
  btnPrimario: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.acento, borderRadius: 14, paddingVertical: 15,
    gap: 8, marginTop: 8,
  },
  btnPrimarioTexto: { fontSize: 16, fontWeight: '700', color: C.fondo },
  filaBotones: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btnSecundario: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.tarjeta, borderRadius: 14, paddingVertical: 15,
    paddingHorizontal: 16, gap: 6, borderWidth: 1, borderColor: C.borde,
  },
  btnSecundarioTexto: { fontSize: 15, color: C.subtexto, fontWeight: '600' },
});

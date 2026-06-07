import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { UsuarioRepository } from '../../src/database/repositories/UsuarioRepository';
import { useSesion } from '../../src/context/SesionContext';
import type { Usuario } from '../../src/types';

const C = {
  fondo: '#0f172a', tarjeta: '#1e293b', borde: '#334155',
  texto: '#f1f5f9', subtexto: '#94a3b8', acento: '#38bdf8',
  verde: '#4ade80', rojo: '#f87171', amarillo: '#fbbf24',
};

const TECLAS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export default function PantallaLogin() {
  const { iniciarSesion } = useSesion();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [seleccionado, setSeleccionado] = useState<Usuario | null>(null);
  const [pin, setPin] = useState('');
  const [intentosFallidos, setIntentosFallidos] = useState(0);
  const [bloqueadoHasta, setBloqueadoHasta] = useState<number | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    UsuarioRepository.obtenerTodos().then((r) => {
      if (r.ok) setUsuarios(r.data.filter((u) => u.activo));
      setCargando(false);
    });
  }, []);

  const estaBloqueado = bloqueadoHasta !== null && Date.now() < bloqueadoHasta;
  const segundosBloqueo = bloqueadoHasta
    ? Math.ceil((bloqueadoHasta - Date.now()) / 1000)
    : 0;

  const presionarTecla = async (tecla: string) => {
    if (estaBloqueado || verificando) return;

    if (tecla === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (tecla === '') return;

    const nuevoPin = pin + tecla;
    setPin(nuevoPin);

    if (nuevoPin.length === 4) {
      setVerificando(true);
      const result = await UsuarioRepository.autenticar(seleccionado!.nombre, nuevoPin);
      setVerificando(false);
      setPin('');

      if (result.ok) {
        setIntentosFallidos(0);
        iniciarSesion(result.data);
      } else {
        const nuevosIntentos = intentosFallidos + 1;
        setIntentosFallidos(nuevosIntentos);

        if (nuevosIntentos >= 5) {
          // Bloqueo de 30 segundos tras 5 intentos fallidos
          setBloqueadoHasta(Date.now() + 30_000);
          setIntentosFallidos(0);
          Alert.alert(
            'Demasiados intentos',
            'Por seguridad, el sistema está bloqueado 30 segundos.'
          );
        } else {
          Alert.alert('PIN incorrecto', `Intentos restantes: ${5 - nuevosIntentos}`);
        }
      }
    }
  };

  if (cargando) {
    return (
      <View style={[s.pantalla, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.acento} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.pantalla}>
      {/* Logo */}
      <View style={s.logoArea}>
        <View style={s.logoCircle}>
          <Ionicons name="storefront" size={32} color={C.acento} />
        </View>
        <Text style={s.appNombre}>StockVoz</Text>
      </View>

      {!seleccionado ? (
        // Selector de usuario
        <View style={s.contenido}>
          <Text style={s.titulo}>¿Quién eres?</Text>
          <FlatList
            data={usuarios}
            keyExtractor={(u) => String(u.id)}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.usuarioCard}
                onPress={() => setSeleccionado(item)}
                activeOpacity={0.8}
              >
                <View style={s.usuarioAvatar}>
                  <Text style={s.usuarioAvatarTexto}>
                    {item.nombre.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.usuarioNombre}>{item.nombre}</Text>
                  <Text style={s.usuarioRol}>
                    {item.rol === 'admin' ? '👑 Administrador' : '👤 Invitado'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.subtexto} />
              </TouchableOpacity>
            )}
          />
        </View>
      ) : (
        // Teclado PIN
        <View style={s.contenido}>
          <TouchableOpacity style={s.btnCambiarUsuario} onPress={() => { setSeleccionado(null); setPin(''); }}>
            <Ionicons name="arrow-back" size={16} color={C.subtexto} />
            <Text style={s.btnCambiarTexto}>Cambiar usuario</Text>
          </TouchableOpacity>

          <Text style={s.titulo}>{seleccionado.nombre}</Text>
          <Text style={s.subtitulo}>Ingresa tu PIN de 4 dígitos</Text>

          {/* Indicadores de PIN */}
          <View style={s.pinIndicadores}>
            {[0,1,2,3].map((i) => (
              <View
                key={i}
                style={[s.pinDot, i < pin.length && s.pinDotLleno]}
              />
            ))}
          </View>

          {estaBloqueado && (
            <View style={s.bloqueoAviso}>
              <Ionicons name="lock-closed" size={16} color={C.rojo} />
              <Text style={s.bloqueoTexto}>Bloqueado {segundosBloqueo}s</Text>
            </View>
          )}

          {verificando && (
            <ActivityIndicator color={C.acento} style={{ marginVertical: 8 }} />
          )}

          {/* Teclado numérico */}
          <View style={s.teclado}>
            {TECLAS.map((tecla, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  s.tecla,
                  tecla === '' && { opacity: 0 },
                  tecla === '⌫' && s.teclaDelete,
                  estaBloqueado && { opacity: 0.3 },
                ]}
                onPress={() => presionarTecla(tecla)}
                disabled={tecla === '' || estaBloqueado || verificando}
                activeOpacity={0.7}
              >
                <Text style={[s.teclaTexto, tecla === '⌫' && { fontSize: 20 }]}>
                  {tecla}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  logoArea: { alignItems: 'center', paddingTop: 24, paddingBottom: 16 },
  logoCircle: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: C.tarjeta, borderWidth: 2, borderColor: C.acento,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  appNombre: { fontSize: 22, fontWeight: '800', color: C.texto },
  contenido: { flex: 1, paddingHorizontal: 32 },
  titulo: { fontSize: 22, fontWeight: '700', color: C.texto, textAlign: 'center', marginBottom: 6 },
  subtitulo: { fontSize: 14, color: C.subtexto, textAlign: 'center', marginBottom: 24 },
  usuarioCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.tarjeta, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: C.borde, gap: 14,
  },
  usuarioAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.acento, alignItems: 'center', justifyContent: 'center',
  },
  usuarioAvatarTexto: { fontSize: 20, fontWeight: '700', color: C.fondo },
  usuarioNombre: { fontSize: 16, fontWeight: '600', color: C.texto },
  usuarioRol: { fontSize: 12, color: C.subtexto, marginTop: 2 },
  btnCambiarUsuario: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginBottom: 20, marginTop: 4,
  },
  btnCambiarTexto: { fontSize: 13, color: C.subtexto },
  pinIndicadores: {
    flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 20,
  },
  pinDot: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: C.borde, backgroundColor: 'transparent',
  },
  pinDotLleno: { backgroundColor: C.acento, borderColor: C.acento },
  bloqueoAviso: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginBottom: 12,
  },
  bloqueoTexto: { color: C.rojo, fontSize: 13, fontWeight: '600' },
  teclado: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 12, marginTop: 8,
  },
  tecla: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.tarjeta, borderWidth: 1, borderColor: C.borde,
    alignItems: 'center', justifyContent: 'center',
  },
  teclaDelete: { backgroundColor: 'transparent', borderColor: 'transparent' },
  teclaTexto: { fontSize: 24, fontWeight: '600', color: C.texto },
});

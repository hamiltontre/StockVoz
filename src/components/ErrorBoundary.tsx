import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * RNF-07 — Error Boundary global de la app.
 * Captura cualquier excepción de renderizado y muestra una pantalla
 * de recuperación en lugar de la pantalla negra fatal de React Native.
 * En producción se podría enviar el error al backend para auditoría.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Log para desarrollo — en producción se sincroniza al servidor
    console.error('StockVoz ErrorBoundary:', error, errorInfo);
  }

  reintentar = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={s.contenedor}>
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={s.iconoArea}>
            <View style={s.iconoCirculo}>
              <Ionicons name="warning-outline" size={48} color="#fbbf24" />
            </View>
          </View>

          <Text style={s.titulo}>Algo no salió bien</Text>
          <Text style={s.subtitulo}>
            La aplicación tuvo un error inesperado. Tu información sigue guardada de forma segura.
          </Text>

          <TouchableOpacity style={s.botonReintentar} onPress={this.reintentar} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color="#0f172a" />
            <Text style={s.botonReintentarTexto}>Reintentar</Text>
          </TouchableOpacity>

          {__DEV__ && this.state.error && (
            <View style={s.detalleDev}>
              <Text style={s.detalleLabel}>Detalle técnico (solo en desarrollo)</Text>
              <Text style={s.detalleTexto}>{this.state.error.toString()}</Text>
              {this.state.errorInfo && (
                <Text style={s.stackTexto} numberOfLines={10}>
                  {this.state.errorInfo.componentStack}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }
}

const s = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  iconoArea: { alignItems: 'center', marginBottom: 24 },
  iconoCirculo: {
    width: 96, height: 96, borderRadius: 28,
    backgroundColor: '#1c1708', borderWidth: 2, borderColor: '#78350f',
    alignItems: 'center', justifyContent: 'center',
  },
  titulo: {
    fontSize: 24, fontWeight: '800', color: '#f1f5f9',
    textAlign: 'center', marginBottom: 8,
  },
  subtitulo: {
    fontSize: 14, color: '#94a3b8',
    textAlign: 'center', lineHeight: 20, marginBottom: 32, paddingHorizontal: 16,
  },
  botonReintentar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#38bdf8', borderRadius: 14, paddingVertical: 14, marginHorizontal: 32,
  },
  botonReintentarTexto: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  detalleDev: {
    backgroundColor: '#1e293b', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155', padding: 12, marginTop: 32,
  },
  detalleLabel: {
    fontSize: 10, fontWeight: '700', color: '#fbbf24',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  },
  detalleTexto: { fontSize: 12, color: '#f87171', fontFamily: 'monospace', marginBottom: 8 },
  stackTexto: { fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' },
});

import { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { centavosACordobas } from '../utils/money';
import { formatearCantidad } from '../utils/cantidad';
import { getDb } from '../database/db';
import type { VentaConDetalle } from '../types';

import { COLORES as C } from '../theme/colors';
interface Props {
  venta: VentaConDetalle | null;
  visible: boolean;
  onCerrar: () => void;
  /** Si es admin, muestra la ganancia de la venta (nunca se comparte al cliente) */
  esAdmin?: boolean;
}

function formatearFechaHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-NI', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function ModalRecibo({ venta, visible, onCerrar, esAdmin = false }: Props) {
  const [nombreNegocio, setNombreNegocio] = useState('Mi Negocio');
  // null = sin datos de costo (no se muestra la sección)
  const [ganancia, setGanancia] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      getDb().then(async (db) => {
        const row = await db.getFirstAsync<{ nombre: string }>(
          'SELECT nombre FROM negocios WHERE id = 1'
        );
        if (row) setNombreNegocio(row.nombre);
      });
    }
  }, [visible]);

  // M-07: ganancia de la venta para el dueño. Usa el costo actual del
  // producto (mismo criterio que el reporte de rentabilidad).
  useEffect(() => {
    if (!visible || !esAdmin || !venta) {
      setGanancia(null);
      return;
    }
    getDb().then(async (db) => {
      const row = await db.getFirstAsync<{ ganancia: number; con_costo: number }>(
        `SELECT
           COALESCE(SUM((dv.precio_unitario - COALESCE(p.precio_costo, 0)) * dv.cantidad), 0) AS ganancia,
           COALESCE(SUM(CASE WHEN p.precio_costo > 0 THEN 1 ELSE 0 END), 0) AS con_costo
         FROM detalle_ventas dv
         LEFT JOIN productos p ON p.id = dv.producto_id
         WHERE dv.venta_id = ?`,
        [venta.id]
      );
      setGanancia(row && row.con_costo > 0 ? row.ganancia : null);
    }).catch(() => setGanancia(null));
  }, [visible, esAdmin, venta]);

  if (!venta) return null;

  const subtotalBruto = venta.items.reduce((acc, i) => acc + i.subtotal, 0);

  const generarTextoRecibo = (): string => {
    const linea = '─'.repeat(30);
    const items = venta.items
      .map((i) => `${formatearCantidad(i.cantidad)}x ${i.nombre_producto}\n   ${centavosACordobas(i.subtotal)}`)
      .join('\n');
    return `
${nombreNegocio}
${linea}
Venta #${venta.id}
${formatearFechaHora(venta.creado_en)}
${linea}
${items}
${linea}
Subtotal:  ${centavosACordobas(subtotalBruto)}
Descuento: ${centavosACordobas(venta.descuento)}
TOTAL:     ${centavosACordobas(venta.total)}
${linea}
Método: ${venta.metodo_pago}

¡Gracias por su compra!
StockVoz
`.trim();
  };

  const compartir = async () => {
    try {
      await Share.share({ message: generarTextoRecibo() });
    } catch {
      // Usuario canceló — ok
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <View style={s.overlay}>
        <View style={s.contenedor}>
          {/* Header del modal */}
          <View style={s.header}>
            <View style={s.exitoBadge}>
              <Ionicons name="checkmark-circle" size={20} color={C.verde} />
              <Text style={s.exitoTexto}>Venta registrada</Text>
            </View>
            <TouchableOpacity onPress={onCerrar}>
              <Ionicons name="close" size={26} color={C.subtexto} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            {/* Recibo simulado */}
            <View style={s.recibo}>
              <Text style={s.negocioNombre}>{nombreNegocio}</Text>
              <Text style={s.divider}>{'─'.repeat(28)}</Text>

              <View style={s.metaFila}>
                <Text style={s.metaLabel}>Venta #</Text>
                <Text style={s.metaValor}>{venta.id}</Text>
              </View>
              <View style={s.metaFila}>
                <Text style={s.metaLabel}>Fecha</Text>
                <Text style={s.metaValor}>{formatearFechaHora(venta.creado_en)}</Text>
              </View>
              <View style={s.metaFila}>
                <Text style={s.metaLabel}>Pago</Text>
                <Text style={[s.metaValor, { textTransform: 'capitalize' }]}>
                  {venta.es_fiado ? 'Fiado' : venta.metodo_pago}
                </Text>
              </View>
              {venta.es_fiado && venta.fiador_nombre && (
                <View style={s.metaFila}>
                  <Text style={s.metaLabel}>A nombre de</Text>
                  <Text style={s.metaValor}>{venta.fiador_nombre}</Text>
                </View>
              )}

              <Text style={s.divider}>{'─'.repeat(28)}</Text>

              {venta.items.map((item, i) => (
                <View key={i} style={s.itemBloque}>
                  <View style={s.itemFila}>
                    <Text style={s.itemNombre} numberOfLines={2}>
                      {formatearCantidad(item.cantidad)}× {item.nombre_producto}
                    </Text>
                    <Text style={s.itemSubtotal}>{centavosACordobas(item.subtotal)}</Text>
                  </View>
                  <Text style={s.itemPrecio}>
                    {centavosACordobas(item.precio_unitario)} c/u
                  </Text>
                </View>
              ))}

              <Text style={s.divider}>{'─'.repeat(28)}</Text>

              <View style={s.totalFila}>
                <Text style={s.totalLabel}>Subtotal</Text>
                <Text style={s.totalValor}>{centavosACordobas(subtotalBruto)}</Text>
              </View>
              {venta.descuento > 0 && (
                <View style={s.totalFila}>
                  <Text style={s.totalLabel}>Descuento</Text>
                  <Text style={[s.totalValor, { color: C.rojo }]}>
                    -{centavosACordobas(venta.descuento)}
                  </Text>
                </View>
              )}
              <View style={[s.totalFila, s.totalFinal]}>
                <Text style={s.totalFinalLabel}>TOTAL</Text>
                <Text style={s.totalFinalValor}>{centavosACordobas(venta.total)}</Text>
              </View>

              <Text style={s.gracias}>¡Gracias por su compra!</Text>
              <Text style={s.poweredBy}>StockVoz</Text>
            </View>

            {/* Ganancia — solo visible para el admin, fuera del recibo
                que se comparte al cliente */}
            {esAdmin && ganancia !== null && (
              <View style={s.gananciaBox}>
                <View style={s.gananciaHeader}>
                  <Ionicons name="lock-closed-outline" size={13} color={C.verde} />
                  <Text style={s.gananciaTitulo}>Solo para el dueño</Text>
                </View>
                <View style={s.gananciaFila}>
                  <Text style={s.gananciaLabel}>Ganancia de esta venta</Text>
                  <Text style={s.gananciaValor}>{centavosACordobas(ganancia)}</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Acciones */}
          <View style={s.acciones}>
            <TouchableOpacity style={s.btnSecundario} onPress={compartir} activeOpacity={0.85}>
              <Ionicons name="share-outline" size={18} color={C.acento} />
              <Text style={s.btnSecundarioTexto}>Compartir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnPrimario} onPress={onCerrar} activeOpacity={0.85}>
              <Ionicons name="checkmark" size={18} color={C.fondo} />
              <Text style={s.btnPrimarioTexto}>Listo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  contenedor: {
    backgroundColor: C.fondo, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '92%', borderTopWidth: 1, borderColor: C.borde,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: C.borde,
  },
  exitoBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exitoTexto: { color: C.verde, fontWeight: '700', fontSize: 15 },
  scroll: { padding: 20, paddingBottom: 8 },
  recibo: {
    backgroundColor: C.tarjeta, borderRadius: 16,
    borderWidth: 1, borderColor: C.borde, padding: 20,
  },
  negocioNombre: {
    fontSize: 20, fontWeight: '800', color: C.texto,
    textAlign: 'center', marginBottom: 8, letterSpacing: 0.5,
  },
  divider: {
    color: C.borde, textAlign: 'center', marginVertical: 8,
    fontFamily: 'monospace', fontSize: 12,
  },
  metaFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  metaLabel: { color: C.subtexto, fontSize: 13 },
  metaValor: { color: C.texto, fontSize: 13, fontWeight: '600' },
  itemBloque: { paddingVertical: 6 },
  itemFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemNombre: { flex: 1, color: C.texto, fontSize: 14, fontWeight: '600', marginRight: 8 },
  itemSubtotal: { color: C.texto, fontSize: 14, fontWeight: '700' },
  itemPrecio: { color: C.subtexto, fontSize: 11, marginTop: 2 },
  totalFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { color: C.subtexto, fontSize: 14 },
  totalValor: { color: C.texto, fontSize: 14, fontWeight: '600' },
  totalFinal: { marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.borde },
  totalFinalLabel: { color: C.texto, fontSize: 16, fontWeight: '800' },
  totalFinalValor: { color: C.acento, fontSize: 20, fontWeight: '800' },
  gracias: {
    color: C.subtexto, fontSize: 13, textAlign: 'center',
    marginTop: 16, fontStyle: 'italic',
  },
  poweredBy: {
    color: C.borde, fontSize: 10, textAlign: 'center',
    marginTop: 4, letterSpacing: 2,
  },
  acciones: {
    flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 30,
    borderTopWidth: 1, borderTopColor: C.borde,
  },
  btnSecundario: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.tarjeta, borderRadius: 14, paddingVertical: 14, gap: 6,
    borderWidth: 1, borderColor: C.borde,
  },
  btnSecundarioTexto: { color: C.acento, fontSize: 15, fontWeight: '700' },
  btnPrimario: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.acento, borderRadius: 14, paddingVertical: 14, gap: 6,
  },
  btnPrimarioTexto: { color: C.fondo, fontSize: 15, fontWeight: '700' },
  gananciaBox: {
    backgroundColor: C.verdeClaro, borderRadius: 12,
    borderWidth: 1, borderColor: C.verde,
    padding: 14, marginTop: 12,
  },
  gananciaHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  gananciaTitulo: {
    color: C.verde, fontSize: 10, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  gananciaFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gananciaLabel: { color: C.texto, fontSize: 13, fontWeight: '500' },
  gananciaValor: { color: C.verde, fontSize: 18, fontWeight: '800' },
});

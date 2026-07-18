import { useState, useEffect, useCallback } from 'react';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import { bus, EVENTOS } from '../utils/eventos';
import {
  generarListaCompras,
  VENTANA_DIAS,
  type SugerenciaCompra,
  type DatosAbastecimiento,
} from '../utils/abastecimiento';
import type { Producto, UnidadProducto } from '../types';

export interface AlertaPorVencer extends Producto {
  dias_para_vencer: number;
}

/**
 * Centraliza las alertas de inventario y la lista de compras sugerida.
 * Reacciona automáticamente a cambios de productos / stock (cada venta
 * emite STOCK_CAMBIO, así que la lista se recalcula sola).
 */
export function useAlertas() {
  const [porVencer, setPorVencer] = useState<AlertaPorVencer[]>([]);
  const [vencidos, setVencidos] = useState<Producto[]>([]);
  const [stockBajo, setStockBajo] = useState<Producto[]>([]);
  const [compras, setCompras] = useState<SugerenciaCompra[]>([]);
  const [costoCompras, setCostoCompras] = useState(0);

  const cargar = useCallback(async () => {
    const [vencerR, vencidosR, stockR, abastR] = await Promise.all([
      ProductoRepository.obtenerPorVencer(30),
      ProductoRepository.obtenerVencidos(),
      ProductoRepository.obtenerStockBajo(),
      ProductoRepository.obtenerDatosAbastecimiento(VENTANA_DIAS),
    ]);
    if (vencerR.ok) setPorVencer(vencerR.data);
    if (vencidosR.ok) setVencidos(vencidosR.data);
    if (stockR.ok) setStockBajo(stockR.data);
    if (abastR.ok) {
      const datos: DatosAbastecimiento[] = abastR.data.map((d) => ({
        ...d,
        unidad: d.unidad as UnidadProducto,
      }));
      const { sugerencias, costoTotal } = generarListaCompras(datos);
      setCompras(sugerencias);
      setCostoCompras(costoTotal);
    }
  }, []);

  useEffect(() => {
    cargar();
    const unsubStock = bus.on(EVENTOS.STOCK_CAMBIO, cargar);
    const unsubProd = bus.on(EVENTOS.PRODUCTO_CAMBIO, cargar);
    return () => { unsubStock(); unsubProd(); };
  }, [cargar]);

  const totalAlertas = porVencer.length + vencidos.length + stockBajo.length;

  return { porVencer, vencidos, stockBajo, compras, costoCompras, totalAlertas, recargar: cargar };
}

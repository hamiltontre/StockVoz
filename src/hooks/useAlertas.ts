import { useState, useEffect, useCallback } from 'react';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import { VentaRepository } from '../database/repositories/VentaRepository';
import { ConfigRepository, CLAVES } from '../database/repositories/ConfigRepository';
import { bus, EVENTOS } from '../utils/eventos';
import {
  generarListaCompras,
  VENTANA_DIAS,
  DIAS_PERIODO,
  type PeriodoCompras,
  type SugerenciaCompra,
  type DatosAbastecimiento,
} from '../utils/abastecimiento';
import type { Producto, UnidadProducto, FiadorResumen } from '../types';

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
  const [fiados, setFiados] = useState<FiadorResumen[]>([]);
  const [periodoCompras, setPeriodoCompras] = useState<PeriodoCompras>('semanal');

  const cargar = useCallback(async () => {
    const [vencerR, vencidosR, stockR, abastR, fiadosR, periodoGuardado] = await Promise.all([
      ProductoRepository.obtenerPorVencer(30),
      ProductoRepository.obtenerVencidos(),
      ProductoRepository.obtenerStockBajo(),
      ProductoRepository.obtenerDatosAbastecimiento(VENTANA_DIAS),
      VentaRepository.fiadosPendientes(),
      ConfigRepository.obtener(CLAVES.COMPRAS_PERIODO),
    ]);
    const periodo: PeriodoCompras = periodoGuardado === 'mensual' ? 'mensual' : 'semanal';
    setPeriodoCompras(periodo);
    if (vencerR.ok) setPorVencer(vencerR.data);
    if (vencidosR.ok) setVencidos(vencidosR.data);
    if (stockR.ok) setStockBajo(stockR.data);
    if (abastR.ok) {
      const datos: DatosAbastecimiento[] = abastR.data.map((d) => ({
        ...d,
        unidad: d.unidad as UnidadProducto,
      }));
      const { sugerencias, costoTotal } = generarListaCompras(datos, DIAS_PERIODO[periodo]);
      setCompras(sugerencias);
      setCostoCompras(costoTotal);
    }
    if (fiadosR.ok) setFiados(fiadosR.data);
  }, []);

  /** Cambia el periodo de abastecimiento (semanal/mensual) y recalcula. */
  const cambiarPeriodoCompras = useCallback(async (p: PeriodoCompras) => {
    await ConfigRepository.guardar(CLAVES.COMPRAS_PERIODO, p);
    await cargar();
  }, [cargar]);

  useEffect(() => {
    cargar();
    const unsubStock = bus.on(EVENTOS.STOCK_CAMBIO, cargar);
    const unsubProd = bus.on(EVENTOS.PRODUCTO_CAMBIO, cargar);
    const unsubFiado = bus.on(EVENTOS.FIADO_CAMBIO, cargar);
    return () => { unsubStock(); unsubProd(); unsubFiado(); };
  }, [cargar]);

  const totalDeudaFiados = fiados.reduce((acc, f) => acc + f.total_deuda, 0);
  const totalAlertas =
    porVencer.length + vencidos.length + stockBajo.length + fiados.length;

  return {
    porVencer, vencidos, stockBajo, compras, costoCompras,
    periodoCompras, cambiarPeriodoCompras,
    fiados, totalDeudaFiados, totalAlertas, recargar: cargar,
  };
}

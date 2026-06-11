import { useState, useEffect, useCallback } from 'react';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import { bus, EVENTOS } from '../utils/eventos';
import type { Producto } from '../types';

export interface AlertaPorVencer extends Producto {
  dias_para_vencer: number;
}

/**
 * Centraliza las tres categorías de alertas para inventario.
 * Reacciona automáticamente a cambios de productos / stock.
 */
export function useAlertas() {
  const [porVencer, setPorVencer] = useState<AlertaPorVencer[]>([]);
  const [vencidos, setVencidos] = useState<Producto[]>([]);
  const [stockBajo, setStockBajo] = useState<Producto[]>([]);

  const cargar = useCallback(async () => {
    const [vencerR, vencidosR, stockR] = await Promise.all([
      ProductoRepository.obtenerPorVencer(30),
      ProductoRepository.obtenerVencidos(),
      ProductoRepository.obtenerStockBajo(),
    ]);
    if (vencerR.ok) setPorVencer(vencerR.data);
    if (vencidosR.ok) setVencidos(vencidosR.data);
    if (stockR.ok) setStockBajo(stockR.data);
  }, []);

  useEffect(() => {
    cargar();
    const unsubStock = bus.on(EVENTOS.STOCK_CAMBIO, cargar);
    const unsubProd = bus.on(EVENTOS.PRODUCTO_CAMBIO, cargar);
    return () => { unsubStock(); unsubProd(); };
  }, [cargar]);

  const totalAlertas = porVencer.length + vencidos.length + stockBajo.length;

  return { porVencer, vencidos, stockBajo, totalAlertas, recargar: cargar };
}

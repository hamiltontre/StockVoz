import { useState, useEffect, useCallback } from 'react';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import { bus, EVENTOS } from '../utils/eventos';

/** Conteo reactivo de productos con stock <= stock_minimo */
export function useStockBajo() {
  const [cantidad, setCantidad] = useState(0);

  const verificar = useCallback(async () => {
    const result = await ProductoRepository.obtenerStockBajo();
    if (result.ok) setCantidad(result.data.length);
  }, []);

  useEffect(() => {
    verificar();

    // Suscribirse a eventos que pueden afectar el stock
    const unsubStock = bus.on(EVENTOS.STOCK_CAMBIO, verificar);
    const unsubVenta = bus.on(EVENTOS.VENTA_CREADA, verificar);
    const unsubProd = bus.on(EVENTOS.PRODUCTO_CAMBIO, verificar);

    return () => {
      unsubStock();
      unsubVenta();
      unsubProd();
    };
  }, [verificar]);

  return { cantidad, verificar };
}

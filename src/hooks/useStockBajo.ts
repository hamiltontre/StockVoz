import { useState, useEffect, useCallback } from 'react';
import { ProductoRepository } from '../database/repositories/ProductoRepository';

/** Retorna el conteo de productos con stock <= stock_minimo */
export function useStockBajo() {
  const [cantidad, setCantidad] = useState(0);

  const verificar = useCallback(async () => {
    const result = await ProductoRepository.obtenerStockBajo();
    if (result.ok) setCantidad(result.data.length);
  }, []);

  useEffect(() => {
    verificar();
  }, [verificar]);

  return { cantidad, verificar };
}

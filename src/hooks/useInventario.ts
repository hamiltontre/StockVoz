import { useState, useCallback, useEffect } from 'react';
import { ProductoRepository } from '../database/repositories/ProductoRepository';
import { bus, EVENTOS } from '../utils/eventos';
import type { Producto, CrearProductoDTO, ActualizarProductoDTO } from '../types';

export function useInventario() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const result = await ProductoRepository.obtenerTodos();
    if (result.ok) {
      setProductos(result.data);
    } else {
      setError(result.error);
    }
    setCargando(false);
  }, []);

  // Recargar inventario cuando hay cambios de stock (ej: después de una venta)
  useEffect(() => {
    const unsubscribe = bus.on(EVENTOS.STOCK_CAMBIO, cargar);
    return unsubscribe;
  }, [cargar]);

  const buscar = useCallback(async (termino: string) => {
    if (!termino.trim()) {
      await cargar();
      return;
    }
    setCargando(true);
    const result = await ProductoRepository.buscarPorNombre(termino);
    if (result.ok) setProductos(result.data);
    else setError(result.error);
    setCargando(false);
  }, [cargar]);

  const crear = useCallback(async (dto: CrearProductoDTO): Promise<string | null> => {
    const result = await ProductoRepository.crear(dto);
    if (result.ok) {
      await cargar();
      return null;
    }
    return result.error;
  }, [cargar]);

  const actualizar = useCallback(
    async (id: number, dto: ActualizarProductoDTO): Promise<string | null> => {
      const result = await ProductoRepository.actualizar(id, dto);
      if (result.ok) {
        await cargar();
        return null;
      }
      return result.error;
    },
    [cargar]
  );

  const eliminar = useCallback(async (id: number): Promise<string | null> => {
    const result = await ProductoRepository.desactivar(id);
    if (result.ok) {
      await cargar();
      return null;
    }
    return result.error;
  }, [cargar]);

  return { productos, cargando, error, cargar, buscar, crear, actualizar, eliminar };
}

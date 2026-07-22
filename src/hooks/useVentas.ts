import { useState, useCallback } from 'react';
import { VentaRepository } from '../database/repositories/VentaRepository';
import type { Venta, ItemCarrito, MetodoPago, VentaConDetalle } from '../types';

export function useVentas() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumenHoy, setResumenHoy] = useState({ total_ventas: 0, total_monto: 0, total_fiado: 0 });

  const cargarRecientes = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [ventasResult, resumenResult] = await Promise.all([
      VentaRepository.obtenerRecientes(),
      VentaRepository.resumenHoy(),
    ]);
    if (ventasResult.ok) setVentas(ventasResult.data);
    else setError(ventasResult.error);
    if (resumenResult.ok) setResumenHoy(resumenResult.data);
    setCargando(false);
  }, []);

  const registrarVenta = useCallback(
    async (
      items: ItemCarrito[],
      metodoPago: MetodoPago,
      descuento = 0,
      notas?: string,
      fiador?: string
    ): Promise<{ ok: boolean; error?: string; venta?: VentaConDetalle }> => {
      setCargando(true);
      const result = await VentaRepository.crear({ items, metodo_pago: metodoPago, descuento, notas, fiador });
      setCargando(false);
      if (result.ok) {
        await cargarRecientes();
        return { ok: true, venta: result.data };
      }
      return { ok: false, error: result.error };
    },
    [cargarRecientes]
  );

  const anularVenta = useCallback(
    async (id: number): Promise<string | null> => {
      const result = await VentaRepository.anular(id);
      if (result.ok) {
        await cargarRecientes();
        return null;
      }
      return result.error;
    },
    [cargarRecientes]
  );

  return { ventas, cargando, error, resumenHoy, cargarRecientes, registrarVenta, anularVenta };
}

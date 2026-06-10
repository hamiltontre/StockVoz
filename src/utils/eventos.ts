/**
 * Mini bus de eventos para comunicar cambios entre hooks sin acoplarlos.
 * Sin dependencias externas — solo callbacks tipados.
 */

type Listener = () => void;

class EventBus {
  private listeners: Map<string, Set<Listener>> = new Map();

  on(evento: string, cb: Listener): () => void {
    if (!this.listeners.has(evento)) this.listeners.set(evento, new Set());
    this.listeners.get(evento)!.add(cb);
    return () => this.listeners.get(evento)?.delete(cb);
  }

  emit(evento: string): void {
    this.listeners.get(evento)?.forEach((cb) => cb());
  }
}

export const bus = new EventBus();

// Eventos del dominio
export const EVENTOS = {
  STOCK_CAMBIO: 'stock:cambio',
  VENTA_CREADA: 'venta:creada',
  PRODUCTO_CAMBIO: 'producto:cambio',
} as const;

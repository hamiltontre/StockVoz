/**
 * Paleta StockVoz — Diseñada para Nicaragua
 *
 * Inspiración: los mercados nicaragüenses, la bandera, el lago Cocibolca,
 * la cerámica de San Juan de Oriente.
 *
 * MODO CLARO (por defecto): fondo blanco cálido, excelente legibilidad al sol.
 * Las pantallas LCD (Redmi A2, Tecno Spark) se ven mejor con fondos claros y
 * los usuarios de 40+ años leen mejor texto oscuro sobre fondo claro.
 */
export const COLORES_CLARO = {
  // Fondos
  fondo:           '#FAFAF8',  // blanco cálido — no cansa la vista
  fondoSecundario: '#F0EFE9',  // crema suave para secciones
  tarjeta:         '#FFFFFF',  // blanco puro para tarjetas
  borde:           '#E2DDD5',  // borde suave tierra

  // Texto
  texto:           '#1C1917',  // negro cálido (no frío)
  subtexto:        '#78716C',  // café medio — legible
  textoTenue:      '#A8A29E',  // hints / placeholders

  // Marca — Azul bandera de Nicaragua
  acento:          '#1D4ED8',  // azul bandera nicaragüense
  acentoSuave:     '#DBEAFE',  // azul muy claro para fondos de badges
  acentoTexto:     '#1E40AF',  // azul más oscuro para texto sobre fondo claro

  // Texto sobre superficies de acento (botones azules, chips activos)
  sobreAcento:     '#FFFFFF',

  // Semánticos
  verde:           '#15803D',  // éxito, confirmación
  verdeClaro:      '#DCFCE7',  // fondo de badge verde
  rojo:            '#DC2626',  // error, alerta, anular
  rojoClaro:       '#FEE2E2',  // fondo de badge rojo
  amarillo:        '#D97706',  // advertencia, stock bajo
  amarilloClaro:   '#FEF3C7',  // fondo de badge amarillo

  // Especiales
  vencimiento:     '#9333EA',  // morado — fecha de vencimiento
  vencimientoClr:  '#F3E8FF',  // fondo badge vencimiento
} as const;

/**
 * MODO OSCURO OPCIONAL — para cuando el usuario lo active manualmente.
 * No es el modo por defecto.
 */
export const COLORES_OSCURO = {
  fondo:           '#0F172A',
  fondoSecundario: '#1E293B',
  tarjeta:         '#1E293B',
  borde:           '#334155',
  texto:           '#F1F5F9',
  subtexto:        '#94A3B8',
  textoTenue:      '#64748B',
  acento:          '#3B82F6',
  acentoSuave:     '#1E3A5F',
  acentoTexto:     '#93C5FD',
  sobreAcento:     '#FFFFFF',
  verde:           '#4ADE80',
  verdeClaro:      '#14532D',
  rojo:            '#F87171',
  rojoClaro:       '#450A0A',
  amarillo:        '#FBBF24',
  amarilloClaro:   '#451A03',
  vencimiento:     '#A855F7',
  vencimientoClr:  '#3B0764',
} as const;

// Por defecto: modo claro (mejor al sol, mejor para usuarios de 40+)
export const COLORES = COLORES_CLARO;

export type ColorToken = keyof typeof COLORES_CLARO;

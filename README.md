# StockVoz

> Sistema POS móvil offline-first con reconocimiento de voz para pequeños comercios en Nicaragua.

[![Estado](https://img.shields.io/badge/estado-MVP-blue)](#)
[![React Native](https://img.shields.io/badge/React%20Native-Expo%20SDK%2056-38bdf8)](#)
[![Laravel](https://img.shields.io/badge/Laravel-12-f87171)](#)
[![Licencia](https://img.shields.io/badge/licencia-Privada-94a3b8)](#)

---

## 🎯 Problema que resuelve

Los pequeños comercios del Distrito III de Managua (ferreterías, farmacias, pulperías) registran ventas a mano, con errores frecuentes, inventario descontrolado y atención lenta. Los sistemas POS tradicionales:

- Requieren PC Windows y conexión permanente
- Cuestan $50–$200 únicos o $14–$60/mes
- No están diseñados para usuarios sin formación técnica
- No funcionan en lugares con internet intermitente

**StockVoz** corre en cualquier smartphone Android de gama baja ($50–$120) que el propietario ya tiene, funciona **100% sin internet**, y permite registrar ventas por voz.

## 🏗 Arquitectura

```
┌─────────────────────────────────────┐
│  App React Native (Expo SDK 56)     │
│  - SQLite local (fuente de verdad)  │
│  - Reconocimiento de voz es-419     │
│  - Cola offline de sincronización   │
└─────────────────┬───────────────────┘
                  │ HTTPS + Bearer token
                  ↓
┌─────────────────────────────────────┐
│  Laravel 12 API (Hostinger VPS)     │
│  - Sanctum auth                      │
│  - Endpoint /api/sync                │
│  - Endpoints /api/reportes/*        │
└─────────────────┬───────────────────┘
                  ↓
┌─────────────────────────────────────┐
│  MySQL / PostgreSQL                  │
│  - Espejo del esquema SQLite local  │
│  - Auditoría de sync                 │
└─────────────────┬───────────────────┘
                  ↓
┌─────────────────────────────────────┐
│  Dashboard Web (Blade + Chart.js)   │
│  - Plan Premium $8/mes               │
│  - Login con email + password       │
└─────────────────────────────────────┘
```

## 💰 Modelo de negocio (SaaS)

| Plan | Precio | Características |
|------|--------|----------------|
| **Básico** | $4/mes | App + voz + inventario ≤500 productos |
| **Premium** | $8/mes | + Dashboard web + reportes avanzados |
| **Empresarial** | $12/mes | + Multi-usuario + API + exportación |

- BEP: **3 clientes activos**
- VAN proyectado: **$1,836 USD**
- Inversión inicial real: **$52.89 USD**

## 📁 Estructura del repositorio

```
StockVoz/                       ← este repo (app móvil)
├── app/                        ← Pantallas con Expo Router
│   ├── (auth)/                 ← Setup inicial + Login PIN
│   ├── (tabs)/                 ← Ventas, Inventario, Reportes
│   ├── ajustes/                ← Config negocio, sync, PIN
│   ├── usuarios/               ← Gestión admin/invitados
│   └── palabras-clave/[id]     ← Diccionario voz por producto
├── src/
│   ├── config/api.ts           ← URL del backend
│   ├── components/             ← UI reutilizable
│   ├── context/SesionContext   ← Auth state global
│   ├── database/
│   │   ├── db.ts               ← Migraciones SQLite
│   │   ├── schema.ts
│   │   └── repositories/       ← CRUD por entidad
│   ├── hooks/                  ← useVoz, useVentas, useSync...
│   ├── services/apiCliente.ts  ← Llamadas al backend
│   ├── theme/colors.ts         ← Paleta única
│   ├── types/                  ← TypeScript types
│   └── utils/                  ← Hash, dinero, eventos
```

> El backend Laravel vive en un repositorio paralelo `StockVozApi/`.

## 🚀 Quick start

### Requisitos previos

- Node.js 22 LTS
- Android Studio + emulador Android 13+
- XAMPP (PHP 8.2+, MySQL) — solo si vas a correr el backend

### App móvil

```powershell
cd StockVoz
npm install
npx expo start --android --clear
```

La primera vez te pedirá **Setup**: nombre del negocio + PIN de 4 dígitos.

### Backend (opcional para sincronizar)

```powershell
cd StockVozApi
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate:fresh
php artisan serve
```

Luego en la app: **Ajustes → Cuenta en la nube → Conectar** con tu email y password.

## ✅ Estado del proyecto

| Sprint | Funcionalidad | Estado |
|--------|---------------|--------|
| S1–S2 | Plan, Visión, Setup React Native | ✅ |
| S3 | RF-01 Reconocimiento de voz | ✅ (requiere dev build) |
| S4 | RF-03 Inventario CRUD | ✅ |
| S5 | CU-03 Gestionar inventario | ✅ |
| S6 | CU-01 Venta por voz · RF-04 venta manual · RF-07 UI accesible | ✅ |
| S7 | RF-02 Palabras clave múltiples | ✅ |
| S8 | RF-08 Usuarios + PIN SHA-256 con salt | ✅ |
| S9 | RF-05 Indicador offline + Ajustes | ✅ |
| S10–S11 | RF-09 Reportes avanzados + stock bajo | ✅ |
| S12 | RF-06 Sincronización diferida + ErrorBoundary | ✅ |
| S13 | Recibo de venta + Backend Laravel + Dashboard | ✅ |

## 🔐 Seguridad

- **PIN nunca en texto plano** — SHA-256 + salt único por usuario (128 bits)
- **Rainbow tables imposibles** — cada usuario tiene su propio salt
- **Lockout** — bloqueo 30s tras 5 intentos fallidos
- **SQL injection imposible** — todas las queries con parámetros enlazados
- **Transacciones atómicas** — `withTransactionAsync` para multi-tabla
- **HTTPS only** en producción (Hostinger VPS con Let's Encrypt)
- **Tokens Sanctum** con expiración de 1 año, revocables

## 🧪 Testing manual rápido

```bash
# Health check del backend
curl http://127.0.0.1:8000/api/health

# Login
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@stockvoz.app","password":"demo1234"}'

# Dashboard web
# http://127.0.0.1:8000/login → demo@stockvoz.app / demo1234
```

## 📋 Riesgos identificados

| ID | Riesgo | Mitigación |
|----|--------|-----------|
| R-01 | Precisión de voz en ambientes ruidosos | Palabras clave personalizables + búsqueda manual fallback |
| R-02 | Conectividad intermitente | Offline-first absoluto, sync cuando haya red |
| R-03 | Resistencia al cambio | UI accesible para baja alfabetización digital |
| R-04 | Hardware de gama baja | Sin dependencias pesadas, FlatList virtualizado |
| R-05 | Equipo unipersonal | Repositorio versionado, código autodocumentado |
| R-06 | Vocabulario por tipo de negocio | Palabras clave configurables por producto |

## 👤 Autor

**Hamilton Gabriel Treminio Carazo**  
Estudiante de Ingeniería en Sistemas de Información — Universidad Americana (UAM)  
Proyecto académico Ingeniería de Software I · Entrega 01/07/2026

## 📜 Licencia

Propietaria. © 2026 Hamilton Treminio · Todos los derechos reservados.

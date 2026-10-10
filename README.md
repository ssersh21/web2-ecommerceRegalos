# web2-ecommerceRegalos

E-commerce de regalos y detalles para ocasiones especiales.

- `front/`: Astro (paginas .astro, layout, estilos). Puerto 4321.
- `back/`: servidor GraphQL (Apollo + PostgreSQL). Puerto 4000, ruta `/graphql`. Imagenes locales en `back/img/`, servidas mediante `/img/<archivo>`.
- El catálogo de prueba usa las 7 imágenes incluidas en `back/img/`; cada producto tiene nombre y descripción según lo que aparece en su fotografía.

## Requisitos

- Node.js 22.12 o superior
- PostgreSQL 14 o superior (o Docker)

## Uso

```sh
docker compose up -d        # levanta PostgreSQL en localhost:5433 (usuario/clave/base: tienda)
npm run install:todo
cp back/.env.example back/.env   # ajusta DATABASE_URL si usas otro Postgres
npm run seed                # crea tablas y datos demo (borra los existentes)
npm run dev:back            # terminal 1
npm run dev:front           # terminal 2
```

Sin Docker, crea la base a mano:

```sh
psql -U postgres -c "CREATE USER tienda WITH PASSWORD 'tienda';"
psql -U postgres -c "CREATE DATABASE tienda OWNER tienda;"
```

El front lee la URL de la API desde `front/.env` (`PUBLIC_API_URL`).
El back lee `back/.env` (`DATABASE_URL`, `PORT`, `FRONT_URL`, `AUTH_SECRET`).

## Pagos y administración

Los botones de checkout usan Mercado Pago Checkout Pro y PayPal Checkout Orders. Para probarlos en sandbox, agrega las credenciales de prueba a `back/.env`:

```dotenv
MERCADO_PAGO_ACCESS_TOKEN=tu_access_token_de_prueba
MERCADO_PAGO_ENVIRONMENT=sandbox
PAYPAL_CLIENT_ID=tu_client_id_de_sandbox
PAYPAL_CLIENT_SECRET=tu_client_secret_de_sandbox
PAYPAL_ENVIRONMENT=sandbox
```

Para cobros reales, configura el access token de producción de Mercado Pago y establece `MERCADO_PAGO_ENVIRONMENT=live`; configura también las credenciales live de PayPal y `PAYPAL_ENVIRONMENT=live`. No pongas estas credenciales en `front/.env` ni las compartas en el repositorio. El proveedor confirma cada transacción en el servidor antes de marcar el pedido como pagado.

El usuario demo `admin@demo.com` puede iniciar sesión para acceder a `/admin`. El dashboard presenta ventas de los últimos 30 días, pedidos pendientes, productos más vendidos, alertas de inventario y pedidos recientes; también permite ajustar stock y avanzar el estado logístico de pedidos ya pagados.

Usuarios demo: `cliente@demo.com` / `demo1234` y `admin@demo.com` / `admin1234`.

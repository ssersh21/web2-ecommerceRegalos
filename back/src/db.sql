-- ============================================================
-- db.sql -- E-commerce de arreglos y regalos personalizados
-- Checkout verificado + seguimiento + pagos DEMO/SANDBOX locales
-- PostgreSQL 14+. Correr: npm run seed
-- ============================================================

DROP TABLE IF EXISTS pagos CASCADE;
DROP TABLE IF EXISTS detalle_pedido CASCADE;
DROP TABLE IF EXISTS pedidos CASCADE;
DROP TABLE IF EXISTS productos CASCADE;
DROP TABLE IF EXISTS categorias CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

CREATE TABLE categorias (
  id      SERIAL PRIMARY KEY,
  nombre  TEXT NOT NULL
);

CREATE TABLE productos (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  descripcion   TEXT NOT NULL DEFAULT '',
  precio        NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  imagen        TEXT,
  stock         INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  categoria_id  INTEGER NOT NULL,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

CREATE TABLE usuarios (
  id        SERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL,
  email     TEXT NOT NULL UNIQUE,
  password  TEXT NOT NULL,
  rol       TEXT NOT NULL DEFAULT 'CLIENTE' CHECK (rol IN ('CLIENTE', 'ADMIN'))
);

CREATE TABLE pedidos (
  id               SERIAL PRIMARY KEY,
  usuario_id       INTEGER NOT NULL,
  fecha            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total            NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  status           TEXT NOT NULL DEFAULT 'PENDIENTE_PAGO'
                   CHECK (status IN (
                     'PENDIENTE_PAGO',
                     'PAGO_FALLIDO',
                     'PAGADO',
                     'EN_PREPARACION',
                     'LISTO',
                     'ENVIADO',
                     'ENTREGADO',
                     'CANCELADO'
                   )),
  destinatario     TEXT NOT NULL,
  telefono         TEXT NOT NULL,
  direccion        TEXT NOT NULL,
  fecha_entrega    DATE NOT NULL,
  horario_entrega  TEXT,
  mensaje_tarjeta  TEXT,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE detalle_pedido (
  id                SERIAL PRIMARY KEY,
  pedido_id         INTEGER NOT NULL,
  producto_id       INTEGER NOT NULL,
  cantidad          INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario   NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (producto_id) REFERENCES productos(id)
);

CREATE TABLE pagos (
  id          SERIAL PRIMARY KEY,
  pedido_id   INTEGER NOT NULL,
  proveedor   TEXT NOT NULL CHECK (proveedor IN ('MERCADO_PAGO','PAYPAL')),
  status      TEXT NOT NULL CHECK (status IN ('APROBADO','RECHAZADO','CANCELADO')),
  monto       NUMERIC(10,2) NOT NULL CHECK (monto >= 0),
  referencia  TEXT NOT NULL,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
);

CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_pedidos_usuario ON pedidos(usuario_id);
CREATE INDEX idx_pagos_pedido ON pagos(pedido_id);

-- ---------------- Datos de ejemplo ----------------

INSERT INTO categorias (nombre) VALUES
  ('Cumpleaños'),
  ('Aniversario'),
  ('Fechas especiales'),
  ('Arma tu regalo');

INSERT INTO productos (nombre, descripcion, precio, imagen, stock, categoria_id) VALUES
  (
    'Caja de regalo dulce',
    'Caja de regalo en tono kraft con bebidas y botanas seleccionadas, presentada de forma ordenada y decorada para sorprender en un cumpleaños o una ocasión especial.',
    420.00, '/img/Cumple.jpeg', 10, 1
  ),
  (
    'Arreglo para aficionado del Atlas',
    'Arreglo temático para fans del Atlas, con globo rojo y negro, balón decorativo y una selección de dulces y botanas. Ideal para celebrar a quien disfruta el fútbol.',
    650.00, '/img/atlas.jpeg', 8, 1
  ),
  (
    'Bolsa sorpresa de dulces',
    'Bolsa transparente con asas y un gran moño verde, rellena con chocolates, golosinas y pequeños detalles. Una opción colorida para regalar en cumpleaños o agradecimientos.',
    320.00, '/img/bolsa_dulces.jpeg', 15, 4
  ),
  (
    'Regalo con termo, flores y chocolates',
    'Presentación en caja con termo decorativo, flores de colores, chocolates y un detalle de peluche. Un regalo alegre para cumpleaños, felicitaciones o para consentir a alguien especial.',
    480.00, '/img/cumple_termo.jpeg', 9, 1
  ),
  (
    'Kit de cumpleaños con bolsa y botanas',
    'Kit de regalo con bolsa decorativa, peluche y variedad de dulces y botanas. Su presentación divertida lo hace adecuado para cumpleaños y celebraciones juveniles.',
    390.00, '/img/cumpleanos.jpeg', 12, 1
  ),
  (
    'Arreglo de conejo de peluche',
    'Arreglo decorativo con un conejo de peluche como protagonista, acompañado de dulces y detalles en tonos suaves. Una alternativa tierna para cumpleaños y ocasiones especiales.',
    520.00, '/img/conejo.jpeg', 7, 3
  ),
  (
    'Canasta de botanas en tonos naranja',
    'Canasta decorada con listones naranjas y una selección variada de botanas, chocolates y golosinas. Perfecta para compartir, celebrar o entregar como detalle personalizado.',
    430.00, '/img/colores.jpeg', 11, 4
  );

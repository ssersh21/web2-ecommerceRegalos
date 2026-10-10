import { fila, filas, consulta, transaccion } from './db.js';
import {
  crearToken,
  hashPassword,
  requireAdmin,
  requireUser,
  verificarPassword,
} from './auth.js';
import {
  capturarOrdenPayPal,
  crearOrdenPayPal,
  crearPreferenciaMercadoPago,
  verificarPagoMercadoPago,
} from './payments.js';

const usuarioPublico = (usuario) => usuario && ({
  id: usuario.id,
  nombre: usuario.nombre,
  email: usuario.email,
  rol: usuario.rol,
});

// Convierte un ID de GraphQL a entero o falla con mensaje claro.
function idEntero(valor, etiqueta = 'ID') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${etiqueta} no válido`);
  return n;
}

const aIso = (valor) => (valor instanceof Date ? valor.toISOString() : valor);

const getPedido = (id, cliente) =>
  (cliente ?? { query: consulta })
    .query('SELECT * FROM pedidos WHERE id = $1', [id])
    .then((r) => r.rows[0] ?? null);

async function requirePedidoPropio(context, pedidoId) {
  const user = requireUser(context);
  const pedido = await getPedido(idEntero(pedidoId, 'Pedido'));
  if (!pedido) throw new Error('Pedido no encontrado');
  if (user.rol !== 'ADMIN' && Number(pedido.usuario_id) !== Number(user.id)) {
    throw new Error('FORBIDDEN: No tienes permiso para consultar o modificar este pedido');
  }
  return { user, pedido };
}

function limpiarTexto(value, label, min = 1, max = 240) {
  const clean = String(value ?? '').trim();
  if (clean.length < min) throw new Error(`${label} es obligatorio`);
  if (clean.length > max) throw new Error(`${label} es demasiado largo`);
  return clean;
}

function normalizarEntrega(entrega = {}) {
  const fechaEntrega = limpiarTexto(entrega.fechaEntrega, 'La fecha de entrega', 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEntrega) || Number.isNaN(Date.parse(fechaEntrega))) {
    throw new Error('La fecha de entrega no tiene un formato válido');
  }

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const hoy = `${yyyy}-${mm}-${dd}`;
  if (fechaEntrega < hoy) throw new Error('La fecha de entrega no puede estar en el pasado');

  return {
    destinatario: limpiarTexto(entrega.destinatario, 'El nombre del destinatario', 2, 100),
    telefono: limpiarTexto(entrega.telefono, 'El teléfono', 7, 30),
    direccion: limpiarTexto(entrega.direccion, 'La dirección', 8, 240),
    fechaEntrega,
    horarioEntrega: String(entrega.horarioEntrega ?? '').trim().slice(0, 80) || null,
    mensajeTarjeta: String(entrega.mensajeTarjeta ?? '').trim().slice(0, 300) || null,
  };
}

async function cargarDetallesValidos(detalles) {
  if (!detalles || detalles.length === 0) {
    throw new Error('El pedido necesita al menos un producto');
  }

  // Une líneas repetidas del mismo producto para validar el stock total.
  const porProducto = new Map();
  for (const d of detalles) {
    const productoId = idEntero(d.productoId, 'Producto');
    const cantidad = Number(d.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new Error('La cantidad de cada producto debe ser mayor a cero');
    }
    porProducto.set(productoId, (porProducto.get(productoId) || 0) + cantidad);
  }

  const resultado = [];
  for (const [productoId, cantidad] of porProducto) {
    const producto = await fila('SELECT * FROM productos WHERE id = $1', [productoId]);
    if (!producto) throw new Error(`Producto ${productoId} no existe`);
    if (producto.stock < cantidad) {
      throw new Error(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}`);
    }
    resultado.push({
      productoId,
      cantidad,
      precioUnitario: Number(producto.precio),
      nombre: producto.nombre,
    });
  }
  return resultado;
}

export const resolvers = {
  Query: {
    categorias: () => filas('SELECT * FROM categorias ORDER BY id'),

    categoria: (_, { id }) =>
      fila('SELECT * FROM categorias WHERE id = $1', [idEntero(id, 'Categoría')]),

    productos: async (_, { limit = 20, offset = 0 }) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const items = await filas(
        'SELECT * FROM productos ORDER BY id LIMIT $1 OFFSET $2',
        [safeLimit, safeOffset]
      );
      const { total } = await fila('SELECT COUNT(*) AS total FROM productos');
      return { items, total };
    },

    producto: (_, { id }) =>
      fila('SELECT * FROM productos WHERE id = $1', [idEntero(id, 'Producto')]),

    buscarProductos: async (_, { texto, categoriaId, limit = 30, offset = 0 }) => {
      const term = `%${String(texto || '').trim()}%`;
      const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
      const safeOffset = Math.max(Number(offset) || 0, 0);

      const params = [term];
      let where = 'WHERE nombre ILIKE $1';
      if (categoriaId) {
        params.push(idEntero(categoriaId, 'Categoría'));
        where += ` AND categoria_id = $${params.length}`;
      }

      const items = await filas(
        `SELECT * FROM productos ${where}
         ORDER BY LOWER(nombre)
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, safeLimit, safeOffset]
      );
      const { total } = await fila(`SELECT COUNT(*) AS total FROM productos ${where}`, params);
      return { items, total };
    },

    me: (_, __, context) => context.user || null,

    pedidos: (_, __, context) => {
      const user = requireUser(context);
      if (user.rol === 'ADMIN') {
        return filas('SELECT * FROM pedidos ORDER BY fecha DESC, id DESC');
      }
      return filas(
        'SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY fecha DESC, id DESC',
        [user.id]
      );
    },

    pedido: async (_, { id }, context) => (await requirePedidoPropio(context, id)).pedido,

    adminDashboard: async (_, __, context) => {
      requireAdmin(context);
      const [ventas, pendientes, totalProductos, productosBajoStock, masVendidos, pedidosRecientes] =
        await Promise.all([
          fila(
            `SELECT COALESCE(SUM(total), 0) AS ingresos,
                    COUNT(*) AS pedidos
             FROM pedidos
             WHERE status IN ('PAGADO', 'EN_PREPARACION', 'LISTO', 'ENVIADO', 'ENTREGADO')
               AND fecha >= NOW() - INTERVAL '30 days'`
          ),
          fila("SELECT COUNT(*) AS total FROM pedidos WHERE status IN ('PENDIENTE_PAGO', 'PAGO_FALLIDO')"),
          fila('SELECT COUNT(*) AS total FROM productos'),
          filas('SELECT * FROM productos WHERE stock <= 5 ORDER BY stock ASC, nombre LIMIT 10'),
          filas(
            `SELECT p.id, p.nombre, SUM(d.cantidad)::INTEGER AS cantidad,
                    SUM(d.cantidad * d.precio_unitario) AS ingresos
             FROM detalle_pedido d
             JOIN productos p ON p.id = d.producto_id
             JOIN pedidos pe ON pe.id = d.pedido_id
             WHERE pe.status IN ('PAGADO', 'EN_PREPARACION', 'LISTO', 'ENVIADO', 'ENTREGADO')
             GROUP BY p.id, p.nombre
             ORDER BY cantidad DESC, ingresos DESC
             LIMIT 5`
          ),
          filas('SELECT * FROM pedidos ORDER BY fecha DESC, id DESC LIMIT 8'),
        ]);

      return {
        ingresosMes: Number(ventas.ingresos),
        pedidosMes: Number(ventas.pedidos),
        pedidosPendientes: Number(pendientes.total),
        totalProductos: Number(totalProductos.total),
        productosBajoStock,
        masVendidos,
        pedidosRecientes,
      };
    },
  },

  Mutation: {
    login: async (_, { email, password }) => {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const usuario = await fila('SELECT * FROM usuarios WHERE LOWER(email) = $1', [normalizedEmail]);

      if (!usuario || !verificarPassword(password, usuario.password)) {
        throw new Error('AUTH_INVALID: Correo o contraseña incorrectos');
      }

      if (!String(usuario.password).startsWith('scrypt$')) {
        await consulta('UPDATE usuarios SET password = $1 WHERE id = $2', [
          hashPassword(password),
          usuario.id,
        ]);
      }

      const publicUser = usuarioPublico(usuario);
      return { token: crearToken(publicUser), usuario: publicUser };
    },

    registro: async (_, { nombre, email, password }) => {
      const cleanName = String(nombre || '').trim();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const cleanPassword = String(password || '');

      if (cleanName.length < 2) throw new Error('El nombre debe tener al menos 2 caracteres');
      if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Ingresa un correo válido');
      if (cleanPassword.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');

      try {
        const usuario = await fila(
          `INSERT INTO usuarios (nombre, email, password, rol)
           VALUES ($1, $2, $3, 'CLIENTE')
           RETURNING id, nombre, email, rol`,
          [cleanName, normalizedEmail, hashPassword(cleanPassword)]
        );
        return { token: crearToken(usuario), usuario };
      } catch (err) {
        if (err.code === '23505') throw new Error('Ya existe una cuenta con ese correo');
        throw err;
      }
    },

    crearProducto: async (_, { input }, context) => {
      requireAdmin(context);
      const { nombre, descripcion, precio, imagen, stock, categoriaId } = input;
      try {
        return await fila(
          `INSERT INTO productos (nombre, descripcion, precio, imagen, stock, categoria_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [nombre, descripcion ?? '', precio, imagen ?? null, stock, idEntero(categoriaId, 'Categoría')]
        );
      } catch (err) {
        if (err.code === '23503') throw new Error('La categoría no existe');
        if (err.code === '23514') throw new Error('Precio o stock no válidos');
        throw err;
      }
    },

    actualizarProducto: async (_, { id, input }, context) => {
      requireAdmin(context);
      const productoId = idEntero(id, 'Producto');
      const actual = await fila('SELECT * FROM productos WHERE id = $1', [productoId]);
      if (!actual) throw new Error('Producto no encontrado');

      const nuevo = {
        nombre: input.nombre ?? actual.nombre,
        descripcion: input.descripcion ?? actual.descripcion,
        precio: input.precio ?? actual.precio,
        imagen: input.imagen ?? actual.imagen,
        stock: input.stock ?? actual.stock,
        categoria_id: input.categoriaId ? idEntero(input.categoriaId, 'Categoría') : actual.categoria_id,
      };

      try {
        return await fila(
          `UPDATE productos
           SET nombre = $1, descripcion = $2, precio = $3, imagen = $4, stock = $5, categoria_id = $6
           WHERE id = $7 RETURNING *`,
          [nuevo.nombre, nuevo.descripcion, nuevo.precio, nuevo.imagen, nuevo.stock, nuevo.categoria_id, productoId]
        );
      } catch (err) {
        if (err.code === '23503') throw new Error('La categoría no existe');
        if (err.code === '23514') throw new Error('Precio o stock no válidos');
        throw err;
      }
    },

    eliminarProducto: async (_, { id }, context) => {
      requireAdmin(context);
      try {
        const r = await consulta('DELETE FROM productos WHERE id = $1', [idEntero(id, 'Producto')]);
        return r.rowCount > 0;
      } catch (err) {
        if (err.code === '23503') {
          throw new Error('No se puede eliminar: el producto ya aparece en pedidos');
        }
        throw err;
      }
    },

    // Paso 1 del checkout: registra el pedido DESPUÉS de la pantalla de verificación.
    // Todavía NO cobra ni descuenta stock. El pedido queda PENDIENTE_PAGO.
    crearPedido: async (_, { detalles, entrega }, context) => {
      const user = requireUser(context);
      const productos = await cargarDetallesValidos(detalles);
      const datosEntrega = normalizarEntrega(entrega);
      const total = productos.reduce((acc, d) => acc + d.precioUnitario * d.cantidad, 0);

      return transaccion(async (cliente) => {
        const { rows } = await cliente.query(
          `INSERT INTO pedidos (
             usuario_id, total, status, destinatario, telefono, direccion,
             fecha_entrega, horario_entrega, mensaje_tarjeta
           ) VALUES ($1, $2, 'PENDIENTE_PAGO', $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            user.id,
            total,
            datosEntrega.destinatario,
            datosEntrega.telefono,
            datosEntrega.direccion,
            datosEntrega.fechaEntrega,
            datosEntrega.horarioEntrega,
            datosEntrega.mensajeTarjeta,
          ]
        );
        const pedido = rows[0];
        for (const d of productos) {
          await cliente.query(
            `INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario)
             VALUES ($1, $2, $3, $4)`,
            [pedido.id, d.productoId, d.cantidad, d.precioUnitario]
          );
        }
        return pedido;
      });
    },

    // Paso 2 del checkout: simulador local de Mercado Pago / PayPal.
    // No cobra dinero real. Al aprobar, vuelve a validar stock y recién ahí lo descuenta.
    procesarPagoDemo: async (_, { pedidoId, proveedor, resultado = 'APROBADO' }, context) => {
      const { pedido: pedidoInicial } = await requirePedidoPropio(context, pedidoId);

      if (!['MERCADO_PAGO', 'PAYPAL'].includes(proveedor)) {
        throw new Error('Proveedor de pago no válido');
      }
      if (!['APROBADO', 'RECHAZADO', 'CANCELADO'].includes(resultado)) {
        throw new Error('Resultado de pago no válido');
      }

      return transaccion(async (cliente) => {
        // Bloquea el pedido para evitar doble pago por solicitudes simultáneas.
        const { rows } = await cliente.query(
          'SELECT * FROM pedidos WHERE id = $1 FOR UPDATE',
          [pedidoInicial.id]
        );
        const pedido = rows[0];

        if (pedido.status === 'CANCELADO') throw new Error('El pedido está cancelado');
        if (['PAGADO', 'EN_PREPARACION', 'LISTO', 'ENVIADO', 'ENTREGADO'].includes(pedido.status)) {
          throw new Error('Este pedido ya fue pagado');
        }

        const referencia = `DEMO-${proveedor}-${pedido.id}-${Date.now()}`;

        if (resultado !== 'APROBADO') {
          const nuevoEstado = resultado === 'RECHAZADO' ? 'PAGO_FALLIDO' : 'PENDIENTE_PAGO';
          await cliente.query(
            `INSERT INTO pagos (pedido_id, proveedor, status, monto, referencia)
             VALUES ($1, $2, $3, $4, $5)`,
            [pedido.id, proveedor, resultado, pedido.total, referencia]
          );
          await cliente.query('UPDATE pedidos SET status = $1 WHERE id = $2', [nuevoEstado, pedido.id]);
          return getPedido(pedido.id, cliente);
        }

        const { rows: detalles } = await cliente.query(
          `SELECT d.producto_id, d.cantidad, p.nombre
           FROM detalle_pedido d
           JOIN productos p ON p.id = d.producto_id
           WHERE d.pedido_id = $1
           ORDER BY d.producto_id`,
          [pedido.id]
        );

        for (const d of detalles) {
          const r = await cliente.query(
            'UPDATE productos SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
            [d.cantidad, d.producto_id]
          );
          if (r.rowCount !== 1) {
            throw new Error(`Stock insuficiente para ${d.nombre}`);
          }
        }

        await cliente.query(
          `INSERT INTO pagos (pedido_id, proveedor, status, monto, referencia)
           VALUES ($1, $2, 'APROBADO', $3, $4)`,
          [pedido.id, proveedor, pedido.total, referencia]
        );
        await cliente.query("UPDATE pedidos SET status = 'PAGADO' WHERE id = $1", [pedido.id]);
        return getPedido(pedido.id, cliente);
      });
    },

    iniciarPagoExterno: async (_, { pedidoId, proveedor }, context) => {
      const { pedido } = await requirePedidoPropio(context, pedidoId);
      if (!['MERCADO_PAGO', 'PAYPAL'].includes(proveedor)) {
        throw new Error('Proveedor de pago no válido');
      }
      if (!['PENDIENTE_PAGO', 'PAGO_FALLIDO'].includes(pedido.status)) {
        throw new Error('Este pedido no está disponible para pago');
      }

      const pago = proveedor === 'MERCADO_PAGO'
        ? await crearPreferenciaMercadoPago(pedido)
        : await crearOrdenPayPal(pedido);
      return { url: pago.url };
    },

    confirmarPagoExterno: async (_, { pedidoId, proveedor, referencia }, context) => {
      const { pedido: pedidoInicial } = await requirePedidoPropio(context, pedidoId);
      if (!['MERCADO_PAGO', 'PAYPAL'].includes(proveedor)) {
        throw new Error('Proveedor de pago no válido');
      }
      if (!['PENDIENTE_PAGO', 'PAGO_FALLIDO'].includes(pedidoInicial.status)) {
        if (['PAGADO', 'EN_PREPARACION', 'LISTO', 'ENVIADO', 'ENTREGADO'].includes(pedidoInicial.status)) {
          return pedidoInicial;
        }
        throw new Error('Este pedido no está disponible para pago');
      }

      const referenciaVerificada = proveedor === 'MERCADO_PAGO'
        ? await verificarPagoMercadoPago(referencia, pedidoInicial)
        : await capturarOrdenPayPal(referencia, pedidoInicial);

      return transaccion(async (cliente) => {
        const { rows } = await cliente.query(
          'SELECT * FROM pedidos WHERE id = $1 FOR UPDATE',
          [pedidoInicial.id]
        );
        const pedido = rows[0];
        if (['PAGADO', 'EN_PREPARACION', 'LISTO', 'ENVIADO', 'ENTREGADO'].includes(pedido.status)) {
          return pedido;
        }
        if (!['PENDIENTE_PAGO', 'PAGO_FALLIDO'].includes(pedido.status)) {
          throw new Error('Este pedido no está disponible para pago');
        }

        const { rows: detalles } = await cliente.query(
          `SELECT d.producto_id, d.cantidad, p.nombre
           FROM detalle_pedido d
           JOIN productos p ON p.id = d.producto_id
           WHERE d.pedido_id = $1
           ORDER BY d.producto_id`,
          [pedido.id]
        );

        for (const detalle of detalles) {
          const actualizado = await cliente.query(
            'UPDATE productos SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
            [detalle.cantidad, detalle.producto_id]
          );
          if (actualizado.rowCount !== 1) {
            throw new Error(`Stock insuficiente para ${detalle.nombre}`);
          }
        }

        await cliente.query(
          `INSERT INTO pagos (pedido_id, proveedor, status, monto, referencia)
           VALUES ($1, $2, 'APROBADO', $3, $4)`,
          [pedido.id, proveedor, pedido.total, referenciaVerificada]
        );
        await cliente.query("UPDATE pedidos SET status = 'PAGADO' WHERE id = $1", [pedido.id]);
        return getPedido(pedido.id, cliente);
      });
    },

    cancelarPedido: async (_, { pedidoId }, context) => {
      const { pedido } = await requirePedidoPropio(context, pedidoId);
      if (!['PENDIENTE_PAGO', 'PAGO_FALLIDO'].includes(pedido.status)) {
        throw new Error('Solo puedes cancelar un pedido que todavía no ha sido pagado');
      }
      await consulta("UPDATE pedidos SET status = 'CANCELADO' WHERE id = $1", [pedido.id]);
      return getPedido(pedido.id);
    },

    actualizarEstadoPedido: async (_, { pedidoId, status }, context) => {
      requireAdmin(context);
      const pedido = await getPedido(idEntero(pedidoId, 'Pedido'));
      if (!pedido) throw new Error('Pedido no encontrado');

      const permitidos = ['PAGADO', 'EN_PREPARACION', 'LISTO', 'ENVIADO', 'ENTREGADO'];
      if (!permitidos.includes(status)) {
        throw new Error('El administrador no puede asignar ese estado manualmente');
      }
      if (['PENDIENTE_PAGO', 'PAGO_FALLIDO', 'CANCELADO'].includes(pedido.status)) {
        throw new Error('No se puede avanzar un pedido sin pago aprobado');
      }
      await consulta('UPDATE pedidos SET status = $1 WHERE id = $2', [status, pedido.id]);
      return getPedido(pedido.id);
    },
  },

  Categoria: {
    productos: (categoria) =>
      filas('SELECT * FROM productos WHERE categoria_id = $1 ORDER BY LOWER(nombre)', [categoria.id]),
  },

  Producto: {
    categoria: (producto) =>
      fila('SELECT * FROM categorias WHERE id = $1', [producto.categoria_id]),
  },

  Pedido: {
    fecha: (pedido) => aIso(pedido.fecha),
    usuario: (pedido) =>
      pedido.usuario_id
        ? fila('SELECT id, nombre, email, rol FROM usuarios WHERE id = $1', [pedido.usuario_id])
        : null,
    fechaEntrega: (pedido) => pedido.fecha_entrega,
    horarioEntrega: (pedido) => pedido.horario_entrega,
    mensajeTarjeta: (pedido) => pedido.mensaje_tarjeta,
    detalles: (pedido) =>
      filas('SELECT * FROM detalle_pedido WHERE pedido_id = $1 ORDER BY id', [pedido.id]),
    pagos: (pedido) =>
      filas('SELECT * FROM pagos WHERE pedido_id = $1 ORDER BY fecha DESC, id DESC', [pedido.id]),
  },

  Pago: {
    fecha: (pago) => aIso(pago.fecha),
  },

  DetallePedido: {
    producto: (detalle) =>
      fila('SELECT * FROM productos WHERE id = $1', [detalle.producto_id]),
    precioUnitario: (detalle) => detalle.precio_unitario,
  },
};

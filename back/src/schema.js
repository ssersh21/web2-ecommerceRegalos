// Schema GraphQL - e-commerce de arreglos y regalos.
// Incluye auth Bearer, checkout verificado, pagos demo y seguimiento de pedidos.
export const typeDefs = `#graphql
  enum Rol {
    CLIENTE
    ADMIN
  }

  enum EstadoPedido {
    PENDIENTE_PAGO
    PAGO_FALLIDO
    PAGADO
    EN_PREPARACION
    LISTO
    ENVIADO
    ENTREGADO
    CANCELADO
  }

  enum ProveedorPago {
    MERCADO_PAGO
    PAYPAL
  }

  enum EstadoPago {
    APROBADO
    RECHAZADO
    CANCELADO
  }

  type Categoria {
    id: ID!
    nombre: String!
    productos: [Producto!]!
  }

  type Producto {
    id: ID!
    nombre: String!
    descripcion: String!
    precio: Float!
    imagen: String
    stock: Int!
    categoria: Categoria!
  }

  type Usuario {
    id: ID!
    nombre: String!
    email: String!
    rol: Rol!
  }

  type AuthPayload {
    token: String!
    usuario: Usuario!
  }

  type DetallePedido {
    id: ID!
    producto: Producto!
    cantidad: Int!
    precioUnitario: Float!
  }

  type Pago {
    id: ID!
    proveedor: ProveedorPago!
    status: EstadoPago!
    monto: Float!
    referencia: String!
    fecha: String!
  }

  type Pedido {
    id: ID!
    fecha: String!
    total: Float!
    status: EstadoPedido!
    usuario: Usuario
    destinatario: String!
    telefono: String!
    direccion: String!
    fechaEntrega: String!
    horarioEntrega: String
    mensajeTarjeta: String
    detalles: [DetallePedido!]!
    pagos: [Pago!]!
  }

  type ProductosPage {
    items: [Producto!]!
    total: Int!
  }

  type PagoExterno {
    url: String!
  }

  type ProductoVendido {
    id: ID!
    nombre: String!
    cantidad: Int!
    ingresos: Float!
  }

  type AdminDashboard {
    ingresosMes: Float!
    pedidosMes: Int!
    pedidosPendientes: Int!
    totalProductos: Int!
    productosBajoStock: [Producto!]!
    masVendidos: [ProductoVendido!]!
    pedidosRecientes: [Pedido!]!
  }

  input ProductoInput {
    nombre: String!
    descripcion: String!
    precio: Float!
    imagen: String
    stock: Int!
    categoriaId: ID!
  }

  input ProductoUpdateInput {
    nombre: String
    descripcion: String
    precio: Float
    imagen: String
    stock: Int
    categoriaId: ID
  }

  input DetalleInput {
    productoId: ID!
    cantidad: Int!
  }

  input EntregaInput {
    destinatario: String!
    telefono: String!
    direccion: String!
    fechaEntrega: String!
    horarioEntrega: String
    mensajeTarjeta: String
  }

  type Query {
    categorias: [Categoria!]!
    categoria(id: ID!): Categoria
    productos(limit: Int = 20, offset: Int = 0): ProductosPage!
    producto(id: ID!): Producto
    buscarProductos(texto: String!, categoriaId: ID, limit: Int = 30, offset: Int = 0): ProductosPage!
    me: Usuario
    pedidos: [Pedido!]!
    pedido(id: ID!): Pedido
    adminDashboard: AdminDashboard!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    registro(nombre: String!, email: String!, password: String!): AuthPayload!

    crearProducto(input: ProductoInput!): Producto!
    actualizarProducto(id: ID!, input: ProductoUpdateInput!): Producto!
    eliminarProducto(id: ID!): Boolean!

    crearPedido(detalles: [DetalleInput!]!, entrega: EntregaInput!): Pedido!
    procesarPagoDemo(pedidoId: ID!, proveedor: ProveedorPago!, resultado: EstadoPago = APROBADO): Pedido!
    iniciarPagoExterno(pedidoId: ID!, proveedor: ProveedorPago!): PagoExterno!
    confirmarPagoExterno(pedidoId: ID!, proveedor: ProveedorPago!, referencia: String!): Pedido!
    cancelarPedido(pedidoId: ID!): Pedido!
    actualizarEstadoPedido(pedidoId: ID!, status: EstadoPedido!): Pedido!
  }
`;

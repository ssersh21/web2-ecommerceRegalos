import { useEffect, useMemo, useState } from 'react';

interface Categoria {
  id: string | number;
  nombre: string;
}

interface Producto {
  id: string | number;
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  imagen: string | null;
  categoria: Categoria | null;
}

interface ItemCarrito {
  id: string | number;
  nombre: string;
  precio: number;
  imagen: string | null;
  cantidad: number;
}

interface Props {
  categorias: Categoria[];
  productos: Producto[];
}

const clasesCategoriaActiva =
  'bg-indigo-600 text-white font-medium px-4 py-1.5 rounded-full text-sm shadow-sm transition-all';
const clasesCategoriaInactiva =
  'bg-white text-gray-700 border border-gray-200 font-medium px-4 py-1.5 rounded-full text-sm hover:bg-gray-50 transition-all';

function leerCarrito(): ItemCarrito[] {
  const carrito = JSON.parse(localStorage.getItem('cart') || '[]');
  return Array.isArray(carrito) ? carrito : [];
}

export default function CatalogoInteractivo({ categorias, productos }: Props) {
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('all');
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [productoAgregado, setProductoAgregado] = useState<string | null>(null);

  useEffect(() => {
    const sincronizarCarrito = () => setCarrito(leerCarrito());
    const inputBusqueda = document.getElementById('searchInput');

    const buscar = (evento: Event) => {
      setTerminoBusqueda((evento.currentTarget as HTMLInputElement).value.toLowerCase());
    };

    sincronizarCarrito();
    if (inputBusqueda instanceof HTMLInputElement) {
      setTerminoBusqueda(inputBusqueda.value.toLowerCase());
    }
    inputBusqueda?.addEventListener('input', buscar);
    window.addEventListener('cart-updated', sincronizarCarrito);

    return () => {
      inputBusqueda?.removeEventListener('input', buscar);
      window.removeEventListener('cart-updated', sincronizarCarrito);
    };
  }, []);

  const productosVisibles = useMemo(() => {
    const termino = terminoBusqueda.trim();
    return productos.filter((producto) => {
      const coincideCategoria =
        categoriaSeleccionada === 'all' ||
        String(producto.categoria?.id ?? 'none') === categoriaSeleccionada;
      const coincideBusqueda = producto.nombre.toLowerCase().includes(termino);
      return coincideCategoria && coincideBusqueda;
    });
  }, [categoriaSeleccionada, productos, terminoBusqueda]);

  function cambiarCantidad(producto: Producto, delta: number) {
    const nuevoCarrito = leerCarrito();
    const item = nuevoCarrito.find((actual) => String(actual.id) === String(producto.id));

    if (item) {
      item.cantidad = Math.max(0, Math.min(producto.stock, Number(item.cantidad) + delta));
      if (item.cantidad === 0) {
        nuevoCarrito.splice(nuevoCarrito.indexOf(item), 1);
      }
    } else if (delta > 0 && producto.stock > 0) {
      nuevoCarrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        imagen: producto.imagen,
        cantidad: 1,
      });
    }

    localStorage.setItem('cart', JSON.stringify(nuevoCarrito));
    setCarrito(nuevoCarrito);
    window.dispatchEvent(new Event('cart-updated'));
  }

  return (
    <>
      <section className="mb-6 flex gap-2 overflow-x-auto pb-2" aria-label="Filtrar por categoría">
        <button
          type="button"
          aria-pressed={categoriaSeleccionada === 'all'}
          className={categoriaSeleccionada === 'all' ? clasesCategoriaActiva : clasesCategoriaInactiva}
          onClick={() => setCategoriaSeleccionada('all')}
        >
          Todas
        </button>
        {categorias.map((categoria) => (
          <button
            type="button"
            key={categoria.id}
            aria-pressed={categoriaSeleccionada === String(categoria.id)}
            className={
              categoriaSeleccionada === String(categoria.id)
                ? clasesCategoriaActiva
                : clasesCategoriaInactiva
            }
            onClick={() => setCategoriaSeleccionada(String(categoria.id))}
          >
            {categoria.nombre}
          </button>
        ))}
      </section>

      {productosVisibles.length === 0 && productos.length > 0 && (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
          No hay productos que coincidan con la búsqueda.
        </p>
      )}

      <section
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        aria-label="Productos"
      >
        {productosVisibles.map((producto) => {
          const cantidad =
            carrito.find((item) => String(item.id) === String(producto.id))?.cantidad ?? 0;
          const agregado = productoAgregado === String(producto.id);

          return (
            <article
              key={producto.id}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between border border-gray-100"
            >
              <a href={`/producto/${producto.id}`} className="block group">
                <div className="h-48 w-full bg-gray-50 overflow-hidden">
                  {producto.imagen ? (
                    <img
                      src={producto.imagen}
                      alt={producto.nombre}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm">
                      Sin imagen
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="font-bold text-gray-900 text-base group-hover:text-indigo-600 transition-colors line-clamp-1">
                    {producto.nombre}
                  </h2>
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2">{producto.descripcion}</p>
                  <p className="text-indigo-600 font-extrabold text-xl mt-2">
                    ${producto.precio} MXN
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Stock: {producto.stock} unidades</p>
                </div>
              </a>

              <div className="p-4 pt-0">
                <div className="mb-3 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="text-xs font-semibold text-gray-600">Cantidad en carrito</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1 font-bold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Quitar una unidad de ${producto.nombre}`}
                      disabled={cantidad <= 0}
                      onClick={() => cambiarCantidad(producto, -1)}
                    >
                      −
                    </button>
                    <span className="min-w-4 text-center text-sm font-bold text-gray-800">
                      {cantidad}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1 font-bold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Agregar una unidad de ${producto.nombre}`}
                      disabled={cantidad >= producto.stock}
                      onClick={() => cambiarCantidad(producto, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className={`w-full text-white py-2 rounded-xl font-semibold text-sm transition-colors shadow-sm active:scale-95 transform disabled:cursor-not-allowed disabled:opacity-50 ${
                    agregado ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                  disabled={producto.stock < 1 || cantidad >= producto.stock}
                  onClick={() => {
                    cambiarCantidad(producto, 1);
                    setProductoAgregado(String(producto.id));
                    window.setTimeout(() => setProductoAgregado(null), 1200);
                  }}
                >
                  {agregado ? '¡Añadido! ✓' : 'Agregar al Carrito'}
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

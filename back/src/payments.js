const FRONT_URL = (process.env.FRONT_URL || 'http://localhost:4321').replace(/\/+$/, '');
const FRONT_ES_HTTPS = FRONT_URL.startsWith('https://');

function paypalApiUrl() {
  const environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
  if (!['sandbox', 'live'].includes(environment)) {
    throw new Error('PAYPAL_ENVIRONMENT debe ser "sandbox" o "live"');
  }
  return environment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function requireEnvironment(...names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Configura estas variables para habilitar el pago: ${missing.join(', ')}`);
  }
}

async function respuestaJson(url, options, proveedor) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const issue = body?.details?.[0]?.issue || body?.name || body?.error || 'UNKNOWN_ERROR';
    const debugId = body?.debug_id ? ` (referencia ${body.debug_id})` : '';
    console.error(`Error de ${proveedor}:`, issue, body?.message || response.status, debugId);
    if (proveedor === 'PayPal' && issue === 'RESOURCE_NOT_FOUND') {
      throw new Error('PayPal no encontró la orden. Verifica que PAYPAL_ENVIRONMENT coincida con las credenciales (sandbox con sandbox o live con live) y vuelve a iniciar el pago.');
    }
    throw new Error(`${proveedor} rechazó la solicitud (${issue}). ${body?.message || 'Revisa la configuración y vuelve a intentarlo.'}${debugId}`);
  }
  return body;
}

function urlResultado(proveedor, pedidoId) {
  const url = new URL('/checkout/resultado', FRONT_URL);
  url.searchParams.set('proveedor', proveedor);
  url.searchParams.set('pedidoId', String(pedidoId));
  return url.toString();
}

export async function crearPreferenciaMercadoPago(pedido) {
  requireEnvironment('MERCADO_PAGO_ACCESS_TOKEN');
  const environment = process.env.MERCADO_PAGO_ENVIRONMENT || 'sandbox';
  if (!['sandbox', 'live'].includes(environment)) {
    throw new Error('MERCADO_PAGO_ENVIRONMENT debe ser "sandbox" o "live"');
  }
  const resultado = urlResultado('MERCADO_PAGO', pedido.id);
  const preference = await respuestaJson(
    'https://api.mercadopago.com/checkout/preferences',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_reference: String(pedido.id),
        items: [{
          id: String(pedido.id),
          title: `Pedido RegalosApp #${pedido.id}`,
          quantity: 1,
          unit_price: Number(pedido.total),
          currency_id: 'MXN',
        }],
        back_urls: {
          success: resultado,
          pending: resultado,
          failure: resultado,
        },
        ...(FRONT_ES_HTTPS ? { auto_return: 'approved' } : {}),
      }),
    },
    'Mercado Pago'
  );

  const url = environment === 'sandbox' ? preference.sandbox_init_point : preference.init_point;
  if (!url) throw new Error(`Mercado Pago no devolvió una URL de pago para el entorno ${environment}`);
  return { url, referencia: String(preference.id) };
}

async function tokenPayPal() {
  requireEnvironment('PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET');
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const token = await respuestaJson(
    `${paypalApiUrl()}/v1/oauth2/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    },
    'PayPal'
  );
  if (!token.access_token) throw new Error('PayPal no devolvió un token de acceso');
  return token.access_token;
}

export async function crearOrdenPayPal(pedido) {
  const accessToken = await tokenPayPal();
  const order = await respuestaJson(
    `${paypalApiUrl()}/v2/checkout/orders`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: String(pedido.id),
          custom_id: String(pedido.id),
          amount: { currency_code: 'MXN', value: Number(pedido.total).toFixed(2) },
        }],
        application_context: {
          return_url: urlResultado('PAYPAL', pedido.id),
          cancel_url: `${FRONT_URL}/checkout/pago?cancelado=1`,
          user_action: 'PAY_NOW',
        },
      }),
    },
    'PayPal'
  );

  const approval = order.links?.find((link) => link.rel === 'approve' || link.rel === 'payer-action');
  if (!approval?.href || !order.id) throw new Error('PayPal no devolvió la URL de aprobación');
  return { url: approval.href, referencia: order.id };
}

export async function verificarPagoMercadoPago(paymentId, pedido) {
  requireEnvironment('MERCADO_PAGO_ACCESS_TOKEN');
  if (!/^\d+$/.test(String(paymentId || ''))) {
    throw new Error('Mercado Pago no devolvió una referencia de pago válida');
  }
  const payment = await respuestaJson(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}` } },
    'Mercado Pago'
  );
  if (
    payment.status !== 'approved' ||
    String(payment.external_reference) !== String(pedido.id) ||
    payment.currency_id !== 'MXN' ||
    Math.round(Number(payment.transaction_amount) * 100) !== Math.round(Number(pedido.total) * 100)
  ) {
    throw new Error('Mercado Pago no confirmó el pago de este pedido por el monto esperado');
  }
  return String(payment.id);
}

export async function capturarOrdenPayPal(orderId, pedido) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(orderId || ''))) {
    throw new Error('PayPal no devolvió una referencia de pedido válida');
  }
  const accessToken = await tokenPayPal();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const order = await respuestaJson(
    `${paypalApiUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    { headers },
    'PayPal'
  );
  const unit = order.purchase_units?.[0];
  if (
    String(unit?.custom_id || unit?.reference_id) !== String(pedido.id) ||
    unit?.amount?.currency_code !== 'MXN' ||
    Math.round(Number(unit?.amount?.value) * 100) !== Math.round(Number(pedido.total) * 100)
  ) {
    throw new Error('La orden de PayPal no coincide con el pedido o el monto de la tienda.');
  }

  if (order.status === 'COMPLETED') {
    const pagoExistente = unit?.payments?.captures?.find((capture) => capture.status === 'COMPLETED');
    if (!pagoExistente?.id) throw new Error('PayPal reportó la orden completada sin una captura válida.');
    return String(pagoExistente.id);
  }
  if (order.status !== 'APPROVED') {
    throw new Error(`PayPal aún no aprobó la orden (estado: ${order.status || 'desconocido'}).`);
  }

  const capture = await respuestaJson(
    `${paypalApiUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: 'POST',
      headers,
      body: '{}',
    },
    'PayPal'
  );
  const pago = capture.purchase_units?.[0]?.payments?.captures?.[0];
  if (
    capture.status !== 'COMPLETED' ||
    pago?.status !== 'COMPLETED' ||
    pago?.amount?.currency_code !== 'MXN' ||
    Math.round(Number(pago.amount.value) * 100) !== Math.round(Number(pedido.total) * 100)
  ) {
    throw new Error('PayPal no confirmó el pago de este pedido por el monto esperado');
  }
  return String(pago.id);
}

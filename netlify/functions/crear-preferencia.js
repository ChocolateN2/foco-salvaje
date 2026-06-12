const { MercadoPagoConfig, Preference } = require('mercadopago');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 }
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { items } = JSON.parse(event.body);

    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: items.map(item => ({
          id: item.id,
          title: item.name,
          quantity: 1,
          unit_price: item.price,
          currency_id: 'ARS',
        })),
        back_urls: {
          success: `${process.env.URL}/pago-exitoso`,
          failure: `${process.env.URL}/pago-fallido`,
          pending: `${process.env.URL}/pago-pendiente`,
        },
        statement_descriptor: 'Foco Salvaje',
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_point: result.sandbox_init_point, id: result.id })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error al procesar el pago' })
    };
  }
};

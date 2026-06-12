const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname)));

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 }
});

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'http://localhost:3000';

app.post('/crear-preferencia', async (req, res) => {
  try {
    const { items } = req.body;
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
          success: `${BASE_URL}/pago-exitoso`,
          failure: `${BASE_URL}/pago-fallido`,
          pending: `${BASE_URL}/pago-pendiente`,
        },
        statement_descriptor: 'Foco Salvaje',
      }
    });
    res.json({ init_point: result.init_point, id: result.id });
  } catch (error) {
    console.error('Error al crear preferencia:', error);
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
});

app.get('/pago-exitoso', (req, res) => {
  res.send(`
    <html><head><meta charset="UTF-8">
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#F4EFE6;margin:0}
    .box{text-align:center;background:white;padding:48px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
    h1{color:#1D9E75;font-size:28px;margin-bottom:12px} p{color:#5C5C58;margin-bottom:24px}
    a{background:#04342C;color:white;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px}</style></head>
    <body><div class="box">
      <h1>✓ Pago exitoso</h1>
      <p>Tu compra fue procesada correctamente.<br>Vas a recibir las fotos por email.</p>
      <a href="/">Volver a la galería</a>
    </div></body></html>
  `);
});

app.get('/pago-fallido', (req, res) => {
  res.send(`
    <html><head><meta charset="UTF-8">
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#F4EFE6;margin:0}
    .box{text-align:center;background:white;padding:48px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
    h1{color:#c0392b;font-size:28px;margin-bottom:12px} p{color:#5C5C58;margin-bottom:24px}
    a{background:#04342C;color:white;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px}</style></head>
    <body><div class="box">
      <h1>✕ Pago fallido</h1>
      <p>Hubo un problema con el pago.<br>Por favor intentá de nuevo.</p>
      <a href="/">Volver a la galería</a>
    </div></body></html>
  `);
});

app.get('/pago-pendiente', (req, res) => {
  res.send(`
    <html><head><meta charset="UTF-8">
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#F4EFE6;margin:0}
    .box{text-align:center;background:white;padding:48px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
    h1{color:#f39c12;font-size:28px;margin-bottom:12px} p{color:#5C5C58;margin-bottom:24px}
    a{background:#04342C;color:white;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px}</style></head>
    <body><div class="box">
      <h1>⏳ Pago pendiente</h1>
      <p>Tu pago está siendo procesado.<br>Te avisaremos cuando se confirme.</p>
      <a href="/">Volver a la galería</a>
    </div></body></html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Servidor corriendo en puerto ${PORT}`);
  console.log(`✓ URL pública: ${BASE_URL}`);
});
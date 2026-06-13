const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const mysql = require('mysql2/promise');
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
  : 'http://localhost:8080';

// Conexión a MySQL
const dbConfig = {
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT || 3306,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
};

async function initDB() {
  try {
    const conn = await mysql.createConnection(dbConfig);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        fotos TEXT NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        estado VARCHAR(50) DEFAULT 'pendiente',
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Base de datos conectada y lista');
    await conn.end();
  } catch (err) {
    console.error('Error conectando a la base de datos:', err.message);
  }
}

initDB();

app.post('/crear-preferencia', async (req, res) => {
  try {
    const { items, buyer } = req.body;

    // Guardar pedido en MySQL
    if (buyer && buyer.name && buyer.email) {
      try {
        const conn = await mysql.createConnection(dbConfig);
        const fotos = items.map(i => i.name).join(', ');
        const total = items.reduce((s, i) => s + i.price, 0);
        await conn.execute(
          'INSERT INTO pedidos (nombre, email, fotos, total, estado) VALUES (?, ?, ?, ?, ?)',
          [buyer.name, buyer.email, fotos, total, 'pendiente']
        );
        await conn.end();
        console.log(`✓ Pedido guardado: ${buyer.name} - ${buyer.email}`);
      } catch (dbErr) {
        console.error('Error guardando pedido:', dbErr.message);
      }
    }

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
        payer: buyer ? { name: buyer.name, email: buyer.email } : undefined,
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

// Panel de pedidos para Cristian
app.get('/pedidos', async (req, res) => {
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute('SELECT * FROM pedidos ORDER BY fecha DESC');
    await conn.end();

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pedidos — Foco Salvaje</title>
      <style>
        body{font-family:'DM Sans',sans-serif;background:#F4EFE6;margin:0;padding:24px}
        h1{font-family:serif;color:#04342C;margin-bottom:24px}
        .stats{display:flex;gap:16px;margin-bottom:24px}
        .stat{background:white;padding:16px 24px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
        .stat-num{font-size:28px;font-weight:700;color:#04342C}
        .stat-label{font-size:12px;color:#9C9C94;margin-top:4px}
        table{width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
        th{background:#04342C;color:white;padding:12px 16px;text-align:left;font-size:13px}
        td{padding:12px 16px;border-bottom:1px solid #f0ece4;font-size:13px}
        tr:last-child td{border-bottom:none}
        .badge{padding:4px 10px;border-radius:20px;font-size:11px;font-weight:500}
        .pendiente{background:#fff3cd;color:#856404}
        .exitoso{background:#d1e7dd;color:#0f5132}
        .fallido{background:#f8d7da;color:#842029}
        .empty{text-align:center;padding:48px;color:#9C9C94}
      </style>
    </head>
    <body>
      <h1>📋 Pedidos — Foco Salvaje</h1>
      <div class="stats">
        <div class="stat">
          <div class="stat-num">${rows.length}</div>
          <div class="stat-label">Total pedidos</div>
        </div>
        <div class="stat">
          <div class="stat-num">$ ${rows.reduce((s, r) => s + parseFloat(r.total), 0).toLocaleString('es-AR')}</div>
          <div class="stat-label">Total vendido</div>
        </div>
      </div>
      ${rows.length === 0 ? '<div class="empty">No hay pedidos todavía</div>' : `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Nombre</th>
            <th>Email</th>
            <th>Fotos</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
          <tr>
            <td>${r.id}</td>
            <td>${r.nombre}</td>
            <td>${r.email}</td>
            <td>${r.fotos}</td>
            <td>$ ${parseFloat(r.total).toLocaleString('es-AR')}</td>
            <td><span class="badge ${r.estado}">${r.estado}</span></td>
            <td>${new Date(r.fecha).toLocaleString('es-AR')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`}
    </body>
    </html>`;

    res.send(html);
  } catch (err) {
    res.status(500).send('Error conectando a la base de datos');
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✓ Servidor corriendo en puerto ${PORT}`);
  console.log(`✓ URL pública: ${BASE_URL}`);
  console.log(`✓ Panel de pedidos: ${BASE_URL}/pedidos`);
});
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.use(session({
  secret: 'focosalvaje_secret_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage() });

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 }
});

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = 'focosalvajeph@gmail.com';

async function enviarEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY no configurada, no se envió el email');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Foco Salvaje <pedidos@focosalvaje.com>',
        to: [to],
        subject,
        html
      })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Error enviando email:', data);
      return false;
    }
    console.log('Email enviado:', data.id);
    return true;
  } catch (err) {
    console.error('Error enviando email:', err.message);
    return false;
  }
}

const LOGO_URL = `${process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:8080'}/assets/logo.jpg`;

function emailFotosHTML({ nombreComprador, fotos }) {
  const fotosHtml = fotos.map(f => `
    <tr>
      <td style="padding:0 0 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9f8;border-radius:10px;overflow:hidden;border:1px solid #e8ece9;">
          <tr>
            <td style="padding:0;">
              <a href="${f.url_descarga}" target="_blank" style="text-decoration:none;display:block;">
                <img src="${f.url_galeria}" alt="${f.nombre}" width="100%" style="display:block;width:100%;max-height:340px;object-fit:cover;border-bottom:1px solid #e8ece9;">
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 20px 20px;">
              <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#04342C;font-family:Georgia,'Times New Roman',serif;">${f.nombre}</p>
              <p style="margin:0 0 14px;font-size:13px;color:#5C5C58;font-family:Arial,sans-serif;">Tocá la imagen o el botón para descargarla en alta resolución, sin marca de agua.</p>
              <a href="${f.url_descarga}" target="_blank" style="display:inline-block;background:#1D9E75;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:11px 22px;border-radius:6px;">⬇ Descargar esta foto</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1ef;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1ef;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(4,52,44,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#04342C,#0F6E56);padding:32px 28px;text-align:center;">
              <img src="${LOGO_URL}" alt="Foco Salvaje" width="64" height="64" style="border-radius:50%;display:block;margin:0 auto 12px;border:2px solid rgba(255,255,255,0.4);object-fit:cover;">
              <p style="margin:0;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;">Foco Salvaje</p>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:2px;text-transform:uppercase;">Fotografía Profesional</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;">
              <p style="margin:0 0 6px;font-size:21px;font-weight:700;color:#04342C;font-family:Georgia,'Times New Roman',serif;">¡Gracias por tu compra, ${nombreComprador}!</p>
              <p style="margin:0 0 28px;font-size:14px;color:#5C5C58;line-height:1.6;">
                Tu pago fue confirmado. Abajo encontrás ${fotos.length === 1 ? 'tu foto' : 'tus fotos'} en alta resolución y sin marca de agua.
                Hacé click en cada imagen o en el botón verde para descargarla a tu dispositivo.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${fotosHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 32px;border-top:1px solid #eef1ef;">
              <p style="margin:20px 0 0;font-size:13px;color:#9C9C94;line-height:1.6;text-align:center;">
                ¿Algún problema con la descarga o alguna consulta?<br>
                Escribinos a <a href="mailto:focosalvajeph@gmail.com" style="color:#1D9E75;text-decoration:none;font-weight:600;">focosalvajeph@gmail.com</a>
                o por <a href="https://wa.me/5492613036313" style="color:#1D9E75;text-decoration:none;font-weight:600;">WhatsApp</a>.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:11px;color:#9C9C94;">© 2026 Foco Salvaje — Mendoza, Argentina</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'http://localhost:8080';

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
    await conn.execute(`CREATE TABLE IF NOT EXISTS pedidos (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL, fotos TEXT NOT NULL, total DECIMAL(10,2) NOT NULL, estado VARCHAR(50) DEFAULT 'pendiente', entregado TINYINT(1) DEFAULT 0, mp_preference_id VARCHAR(255), mp_payment_id VARCHAR(255), fecha DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await conn.execute(`CREATE TABLE IF NOT EXISTS fotos (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(255) NOT NULL, categoria VARCHAR(50) DEFAULT 'accion', precio DECIMAL(10,2) NOT NULL, url_galeria VARCHAR(500) NOT NULL, url_descarga VARCHAR(500) NOT NULL, descripcion TEXT, etiqueta VARCHAR(100), fecha DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await conn.execute(`CREATE TABLE IF NOT EXISTS categorias (id INT AUTO_INCREMENT PRIMARY KEY, slug VARCHAR(50) NOT NULL UNIQUE, nombre VARCHAR(100) NOT NULL, fecha DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    try { await conn.execute('ALTER TABLE fotos ADD COLUMN descripcion TEXT'); } catch(e) {}
    try { await conn.execute('ALTER TABLE fotos ADD COLUMN etiqueta VARCHAR(100)'); } catch(e) {}
    try { await conn.execute('ALTER TABLE pedidos ADD COLUMN entregado TINYINT(1) DEFAULT 0'); } catch(e) {}
    try { await conn.execute('ALTER TABLE pedidos ADD COLUMN mp_preference_id VARCHAR(255)'); } catch(e) {}
    try { await conn.execute('ALTER TABLE pedidos ADD COLUMN mp_payment_id VARCHAR(255)'); } catch(e) {}
    const [catCount] = await conn.execute('SELECT COUNT(*) as c FROM categorias');
    if (catCount[0].c === 0) {
      const defaults = [
        ['accion', 'Acción'],
        ['retrato', 'Retrato'],
        ['paisaje', 'Paisaje & Naturaleza'],
        ['campeonato', 'Campeonato de Pesca'],
      ];
      for (const [slug, nombre] of defaults) {
        try { await conn.execute('INSERT INTO categorias (slug, nombre) VALUES (?, ?)', [slug, nombre]); } catch(e) {}
      }
    }
    console.log('✓ Base de datos conectada y lista');
    await conn.end();
  } catch (err) {
    console.error('Error conectando a la base de datos:', err.message);
  }
}

initDB();

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

app.get('/api/fotos', async (req, res) => {
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute('SELECT * FROM fotos ORDER BY fecha DESC');
    await conn.end();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/categorias', async (req, res) => {
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute('SELECT * FROM categorias ORDER BY nombre ASC');
    await conn.end();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.post('/fs2026categoria-agregar', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre no puede estar vacío' });
    const slug = slugify(nombre.trim());
    if (!slug) return res.status(400).json({ error: 'Nombre inválido' });
    const conn = await mysql.createConnection(dbConfig);
    const [existing] = await conn.execute('SELECT id FROM categorias WHERE slug = ?', [slug]);
    if (existing.length > 0) { await conn.end(); return res.status(400).json({ error: 'Esa categoría ya existe' }); }
    await conn.execute('INSERT INTO categorias (slug, nombre) VALUES (?, ?)', [slug, nombre.trim()]);
    await conn.end();
    res.json({ ok: true, slug, nombre: nombre.trim() });
  } catch (err) {
    console.error('Error agregando categoría:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/fs2026categoria-eliminar/:id', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [catRows] = await conn.execute('SELECT * FROM categorias WHERE id = ?', [req.params.id]);
    if (catRows.length === 0) { await conn.end(); return res.status(404).json({ error: 'Categoría no encontrada' }); }
    const cat = catRows[0];
    const [enUso] = await conn.execute('SELECT COUNT(*) as c FROM fotos WHERE categoria = ?', [cat.slug]);
    if (enUso[0].c > 0) {
      await conn.end();
      return res.status(400).json({ error: `No se puede eliminar: ${enUso[0].c} foto(s) usan esta categoría. Cambiá su categoría primero.` });
    }
    await conn.execute('DELETE FROM categorias WHERE id = ?', [req.params.id]);
    await conn.end();
    res.json({ ok: true });
  } catch (err) {
    console.error('Error eliminando categoría:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/fs2026subir', upload.fields([{name:'foto_galeria'},{name:'foto_descarga'}]), async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const { nombre, categoria, precio, descripcion, etiqueta } = req.body;
    if (!nombre || !categoria || !precio || parseFloat(precio) <= 0 || !req.files?.foto_galeria || !req.files?.foto_descarga)
      return res.status(400).json({ error: 'Faltan datos o el precio no es válido' });
    const galResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({ folder: 'focosalvaje/galeria', public_id: `gal_${Date.now()}` }, (err, result) => err ? reject(err) : resolve(result)).end(req.files.foto_galeria[0].buffer);
    });
    const descResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({ folder: 'focosalvaje/descarga', public_id: `desc_${Date.now()}` }, (err, result) => err ? reject(err) : resolve(result)).end(req.files.foto_descarga[0].buffer);
    });
    const conn = await mysql.createConnection(dbConfig);
    await conn.execute('INSERT INTO fotos (nombre, categoria, precio, url_galeria, url_descarga, descripcion, etiqueta) VALUES (?, ?, ?, ?, ?, ?, ?)', [nombre, categoria, parseFloat(precio), galResult.secure_url, descResult.secure_url, descripcion || null, etiqueta || null]);
    await conn.end();
    res.json({ ok: true });
  } catch (err) {
    console.error('Error subiendo foto:', err);
    res.status(500).json({ error: 'Error subiendo foto' });
  }
});

app.post('/fs2026subir-multiple', upload.fields([
  { name: 'foto_galeria_0' }, { name: 'foto_descarga_0' },
  { name: 'foto_galeria_1' }, { name: 'foto_descarga_1' },
  { name: 'foto_galeria_2' }, { name: 'foto_descarga_2' },
  { name: 'foto_galeria_3' }, { name: 'foto_descarga_3' },
  { name: 'foto_galeria_4' }, { name: 'foto_descarga_4' },
  { name: 'foto_galeria_5' }, { name: 'foto_descarga_5' },
  { name: 'foto_galeria_6' }, { name: 'foto_descarga_6' },
  { name: 'foto_galeria_7' }, { name: 'foto_descarga_7' },
  { name: 'foto_galeria_8' }, { name: 'foto_descarga_8' },
  { name: 'foto_galeria_9' }, { name: 'foto_descarga_9' },
  { name: 'foto_galeria_10' }, { name: 'foto_descarga_10' },
  { name: 'foto_galeria_11' }, { name: 'foto_descarga_11' },
  { name: 'foto_galeria_12' }, { name: 'foto_descarga_12' },
  { name: 'foto_galeria_13' }, { name: 'foto_descarga_13' },
  { name: 'foto_galeria_14' }, { name: 'foto_descarga_14' },
  { name: 'foto_galeria_15' }, { name: 'foto_descarga_15' },
  { name: 'foto_galeria_16' }, { name: 'foto_descarga_16' },
  { name: 'foto_galeria_17' }, { name: 'foto_descarga_17' },
  { name: 'foto_galeria_18' }, { name: 'foto_descarga_18' },
  { name: 'foto_galeria_19' }, { name: 'foto_descarga_19' },
]), async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const { categoria, precio, descripcion, etiqueta, nombreBase } = req.body;
    if (!categoria || !precio || parseFloat(precio) <= 0)
      return res.status(400).json({ error: 'Faltan datos o el precio no es válido' });
    if (!req.files) return res.status(400).json({ error: 'No se recibieron archivos' });

    const conn = await mysql.createConnection(dbConfig);
    let subidas = 0;
    let errores = 0;

    for (let i = 0; i < 20; i++) {
      const galFile = req.files[`foto_galeria_${i}`]?.[0];
      const descFile = req.files[`foto_descarga_${i}`]?.[0];
      if (!galFile || !descFile) continue;

      try {
        const galResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream({ folder: 'focosalvaje/galeria', public_id: `gal_${Date.now()}_${i}` }, (err, result) => err ? reject(err) : resolve(result)).end(galFile.buffer);
        });
        const descResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream({ folder: 'focosalvaje/descarga', public_id: `desc_${Date.now()}_${i}` }, (err, result) => err ? reject(err) : resolve(result)).end(descFile.buffer);
        });
        const nombreFoto = (nombreBase && nombreBase.trim())
          ? `${nombreBase.trim()} — Foto ${i + 1}`
          : (galFile.originalname ? galFile.originalname.replace(/\.[^/.]+$/, '') : `Foto ${i + 1}`);
        await conn.execute('INSERT INTO fotos (nombre, categoria, precio, url_galeria, url_descarga, descripcion, etiqueta) VALUES (?, ?, ?, ?, ?, ?, ?)', [nombreFoto, categoria, parseFloat(precio), galResult.secure_url, descResult.secure_url, descripcion || null, etiqueta || null]);
        subidas++;
      } catch (innerErr) {
        console.error(`Error subiendo foto ${i}:`, innerErr.message);
        errores++;
      }
    }
    await conn.end();

    if (subidas === 0) return res.status(400).json({ error: 'No se pudo subir ninguna foto' });
    res.json({ ok: true, subidas, errores });
  } catch (err) {
    console.error('Error subiendo fotos múltiples:', err);
    res.status(500).json({ error: 'Error subiendo fotos' });
  }
});

app.post('/fs2026editar/:id', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const { nombre, categoria, precio, descripcion, etiqueta } = req.body;
    if (!nombre || !categoria || !precio || parseFloat(precio) <= 0) return res.status(400).json({ error: 'Datos inválidos' });
    const conn = await mysql.createConnection(dbConfig);
    await conn.execute('UPDATE fotos SET nombre = ?, categoria = ?, precio = ?, descripcion = ?, etiqueta = ? WHERE id = ?', [nombre, categoria, parseFloat(precio), descripcion || null, etiqueta || null, req.params.id]);
    await conn.end();
    res.json({ ok: true });
  } catch (err) {
    console.error('Error editando foto:', err);
    res.status(500).json({ error: 'Error' });
  }
});

app.post('/fs2026eliminar/:id', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const conn = await mysql.createConnection(dbConfig);
    await conn.execute('DELETE FROM fotos WHERE id = ?', [req.params.id]);
    await conn.end();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.post('/contacto', async (req, res) => {
  try {
    const { nombre, email, mensaje } = req.body;
    if (!nombre || !email || !mensaje) return res.status(400).json({ error: 'Faltan datos' });
    const html = `
      <h2>Nuevo mensaje de contacto — Foco Salvaje</h2>
      <p><strong>Nombre:</strong> ${nombre}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Mensaje:</strong></p>
      <p>${mensaje.replace(/\n/g, '<br>')}</p>
    `;
    const enviado = await enviarEmail({ to: NOTIFY_EMAIL, subject: `Nuevo mensaje de ${nombre}`, html });
    if (enviado) res.json({ ok: true });
    else res.status(500).json({ error: 'No se pudo enviar el mensaje' });
  } catch (err) {
    console.error('Error en /contacto:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/crear-preferencia', async (req, res) => {
  try {
    const { items, buyer } = req.body;
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: items.map(item => ({ id: String(item.id), title: item.name, quantity: 1, unit_price: item.price, currency_id: 'ARS' })),
        payer: buyer ? { name: buyer.name, email: buyer.email } : undefined,
        back_urls: { success: `${BASE_URL}/pago-exitoso`, failure: `${BASE_URL}/pago-fallido`, pending: `${BASE_URL}/pago-pendiente` },
        notification_url: `${BASE_URL}/webhook`,
        statement_descriptor: 'Foco Salvaje',
      }
    });
    if (buyer && buyer.name && buyer.email) {
      try {
        const conn = await mysql.createConnection(dbConfig);
        const fotos = items.map(i => i.name).join(', ');
        const total = items.reduce((s, i) => s + i.price, 0);
        await conn.execute('INSERT INTO pedidos (nombre, email, fotos, total, estado, mp_preference_id) VALUES (?, ?, ?, ?, ?, ?)', [buyer.name, buyer.email, fotos, total, 'pendiente', result.id]);
        await conn.end();
      } catch (dbErr) { console.error('Error guardando pedido:', dbErr.message); }
    }
    res.json({ init_point: result.init_point, id: result.id });
  } catch (error) {
    console.error('Error al crear preferencia:', error);
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
});

async function actualizarPedidoPorPago(paymentId) {
  try {
    const payment = new Payment(client);
    const paymentInfo = await payment.get({ id: Number(paymentId) });
    console.log('Payment status:', paymentInfo.status, '| email:', paymentInfo.payer?.email);
    let estado = 'pendiente';
    if (paymentInfo.status === 'approved') estado = 'exitoso';
    const conn = await mysql.createConnection(dbConfig);
    let pedidoActualizado = null;
    if (paymentInfo.preference_id) {
      const [r1] = await conn.execute('UPDATE pedidos SET estado = ?, mp_payment_id = ? WHERE mp_preference_id = ?', [estado, String(paymentId), paymentInfo.preference_id]);
      if (r1.affectedRows > 0) {
        const [rows] = await conn.execute('SELECT * FROM pedidos WHERE mp_preference_id = ?', [paymentInfo.preference_id]);
        pedidoActualizado = rows[0];
      }
    }
    if (!pedidoActualizado) {
      const payerEmail = paymentInfo.payer?.email;
      if (payerEmail) {
        const [r2] = await conn.execute('UPDATE pedidos SET estado = ?, mp_payment_id = ? WHERE email = ? AND estado = "pendiente" ORDER BY fecha DESC LIMIT 1', [estado, String(paymentId), payerEmail]);
        console.log('Por email (', payerEmail, '):', r2.affectedRows, 'filas | estado:', estado);
        if (r2.affectedRows > 0) {
          const [rows] = await conn.execute('SELECT * FROM pedidos WHERE email = ? ORDER BY fecha DESC LIMIT 1', [payerEmail]);
          pedidoActualizado = rows[0];
        }
      }
    }

    if (estado === 'exitoso' && pedidoActualizado) {
      try {
        const nombresFotos = pedidoActualizado.fotos.split(',').map(s => s.trim());
        const placeholders = nombresFotos.map(() => '?').join(',');
        const [fotosRows] = await conn.execute(`SELECT * FROM fotos WHERE nombre IN (${placeholders})`, nombresFotos);
        if (fotosRows.length > 0) {
          const html = emailFotosHTML({ nombreComprador: pedidoActualizado.nombre, fotos: fotosRows });
          await enviarEmail({ to: pedidoActualizado.email, subject: '¡Tus fotos de Foco Salvaje están listas!', html });
        }
      } catch (mailErr) {
        console.error('Error mandando fotos por email:', mailErr.message);
      }
    }

    await conn.end();
    return { estado };
  } catch (err) {
    console.error('Error actualizando pedido:', err.message);
    return null;
  }
}

app.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook recibido:', JSON.stringify(req.body));
    let paymentId = null;
    if (req.body.type === 'payment' && req.body.data?.id) paymentId = req.body.data.id;
    else if (req.body.topic === 'payment' && req.body.resource) paymentId = req.body.resource;
    if (paymentId) await actualizarPedidoPorPago(paymentId);
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.sendStatus(500);
  }
});

app.get('/pago-exitoso', async (req, res) => {
  const paymentId = req.query.payment_id;
  if (paymentId) {
    console.log('Pago exitoso redirect, payment_id:', paymentId);
    await actualizarPedidoPorPago(paymentId);
  }
  res.send(`<html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#F4EFE6;margin:0}.box{text-align:center;background:white;padding:48px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}h1{color:#1D9E75;font-size:28px;margin-bottom:12px}p{color:#5C5C58;margin-bottom:24px}a{background:#04342C;color:white;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px}</style></head><body><div class="box"><h1>✓ Pago exitoso</h1><p>Tu compra fue procesada correctamente.<br>Vas a recibir las fotos por email.</p><a href="/">Volver a la galería</a></div></body></html>`);
});

app.post('/fs2026eliminar-pedido/:id', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const conn = await mysql.createConnection(dbConfig);
    await conn.execute('DELETE FROM pedidos WHERE id = ?', [req.params.id]);
    await conn.end();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.post('/fs2026editar-email/:id', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email inválido' });
    const conn = await mysql.createConnection(dbConfig);
    await conn.execute('UPDATE pedidos SET email = ? WHERE id = ?', [email, req.params.id]);
    await conn.end();
    res.json({ ok: true });
  } catch (err) {
    console.error('Error editando email:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/fs2026reenviar/:id', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute('SELECT * FROM pedidos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) { await conn.end(); return res.status(404).json({ error: 'Pedido no encontrado' }); }
    const pedido = rows[0];
    const nombresFotos = pedido.fotos.split(',').map(s => s.trim());
    const placeholders = nombresFotos.map(() => '?').join(',');
    const [fotosRows] = await conn.execute(`SELECT * FROM fotos WHERE nombre IN (${placeholders})`, nombresFotos);
    if (fotosRows.length === 0) { await conn.end(); return res.status(404).json({ error: 'No se encontraron las fotos de este pedido' }); }
    const html = emailFotosHTML({ nombreComprador: pedido.nombre, fotos: fotosRows });
    const enviado = await enviarEmail({ to: pedido.email, subject: '¡Tus fotos de Foco Salvaje están listas!', html });
    if (enviado) {
      await conn.execute('UPDATE pedidos SET estado = "exitoso" WHERE id = ?', [req.params.id]);
      await conn.end();
      res.json({ ok: true });
    } else {
      await conn.end();
      res.status(500).json({ error: 'No se pudo enviar el email' });
    }
  } catch (err) {
    console.error('Error reenviando fotos:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/fs2026entregar/:id', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute('SELECT entregado FROM pedidos WHERE id = ?', [req.params.id]);
    const nuevoEstado = rows[0].entregado ? 0 : 1;
    await conn.execute('UPDATE pedidos SET entregado = ? WHERE id = ?', [nuevoEstado, req.params.id]);
    await conn.end();
    res.json({ entregado: nuevoEstado });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.get('/fs2026admin', (req, res) => {
  if (req.session.admin) return res.redirect('/fs2026pedidos');
  const error = req.query.error ? true : false;
  res.send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin — Foco Salvaje</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',sans-serif;min-height:100vh;background:linear-gradient(135deg,#04342C 0%,#0F6E56 50%,#1D9E75 100%);display:flex;align-items:center;justify-content:center;padding:16px}
  .card{background:white;border-radius:16px;padding:40px 36px;width:100%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.25)}
  .logo{text-align:center;margin-bottom:28px}
  .logo h1{font-size:20px;color:#04342C;font-weight:700}
  .logo p{font-size:13px;color:#9C9C94;margin-top:3px}
  .error{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px;text-align:center}
  label{display:block;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#6b7280;margin-bottom:6px}
  input{width:100%;padding:12px 14px;border:2px solid #e5e7eb;border-radius:8px;font-size:15px;outline:none;transition:border 0.2s;margin-bottom:20px}
  input:focus{border-color:#1D9E75}
  button{width:100%;background:linear-gradient(135deg,#04342C,#1D9E75);color:white;border:none;padding:13px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:opacity 0.2s}
  button:hover{opacity:0.9}
</style></head>
<body><div class="card">
  <div class="logo">
    <img src="/assets/logo.jpg" style="width:120px;height:120px;object-fit:contain;margin-bottom:12px">
    <h1>FocoSalvaje</h1>
    <p>Panel de administración</p>
  </div>
  ${error ? '<div class="error">Contraseña incorrecta. Intentá de nuevo.</div>' : ''}
  <form action="/fs2026admin" method="post">
    <label>Contraseña</label>
    <input type="password" name="pass" placeholder="••••••••" autofocus>
    <button type="submit">Ingresar al panel</button>
  </form>
</div></body></html>`);
});

app.post('/fs2026admin', (req, res) => {
  if (req.body.pass === 'Nicotina48') { req.session.admin = true; res.redirect('/fs2026pedidos'); }
  else res.redirect('/fs2026admin?error=1');
});

app.get('/fs2026logout', (req, res) => { req.session.destroy(); res.redirect('/fs2026admin'); });

app.get('/fs2026fotos', async (req, res) => {
  if (!req.session.admin) return res.redirect('/fs2026admin');
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [fotos] = await conn.execute('SELECT * FROM fotos ORDER BY fecha DESC');
    const [categorias] = await conn.execute('SELECT * FROM categorias ORDER BY nombre ASC');
    await conn.end();
    fotos.forEach((f, idx) => { f.displayNum = idx + 1; });
    const catMap = {};
    categorias.forEach(c => { catMap[c.slug] = c.nombre; });
    const catOptionsHTML = (selectedSlug) => categorias.map(c =>
      `<option value="${c.slug}"${c.slug===selectedSlug?' selected':''}>${c.nombre}</option>`
    ).join('');
    res.send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fotos — Foco Salvaje</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',-apple-system,sans-serif;background:#eef1f0;min-height:100vh;color:#1f2937}
  .navbar{background:linear-gradient(135deg,#04342C,#0F6E56);padding:14px 24px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 12px rgba(0,0,0,0.15);flex-wrap:wrap;gap:10px;position:sticky;top:0;z-index:10}
  .navbar-brand{color:white;font-size:17px;font-weight:700;display:flex;align-items:center;gap:8px}
  .navbar-links{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .nav-link{color:rgba(255,255,255,0.85);text-decoration:none;font-size:13px;border:1px solid rgba(255,255,255,0.3);padding:7px 16px;border-radius:8px;transition:all 0.2s;font-weight:500}
  .nav-link:hover{background:rgba(255,255,255,0.12);color:white}
  .nav-link.active{background:rgba(255,255,255,0.18);color:white;border-color:rgba(255,255,255,0.45)}
  .container{padding:24px 20px 60px;max-width:1100px;margin:0 auto}
  .upload-card{background:white;border-radius:16px;padding:28px;margin-bottom:28px;box-shadow:0 4px 16px rgba(4,52,44,0.07);border:1px solid #e8ece9}
  .upload-title{font-size:18px;font-weight:700;color:#04342C;margin-bottom:22px;display:flex;align-items:center;gap:10px}
  .upload-tabs{display:flex;gap:8px;margin-bottom:22px;border-bottom:2px solid #eef1f0}
  .upload-tab{background:none;border:none;padding:10px 4px 14px;font-size:14px;font-weight:700;color:#9ca3af;cursor:pointer;font-family:inherit;border-bottom:3px solid transparent;margin-bottom:-2px;margin-right:14px;transition:color 0.2s,border-color 0.2s}
  .upload-tab:hover{color:#04342C}
  .upload-tab.active{color:#04342C;border-bottom-color:#1D9E75}
  .multi-file-list{margin-top:10px;font-size:11.5px;color:#04342C;font-weight:600;max-width:100%;max-height:90px;overflow-y:auto;text-align:left}
  .multi-file-list div{padding:2px 0;border-bottom:1px solid #f1f3f2;word-break:break-all}
  .form-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:18px}
  .fg{display:flex;flex-direction:column;gap:7px}
  .fg label{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px}
  .fg input,.fg select{padding:11px 13px;border:1.5px solid #e2e5e9;border-radius:10px;font-size:14px;font-family:inherit;outline:none;transition:border 0.2s,box-shadow 0.2s;background:#fbfcfc}
  .fg input:focus,.fg select:focus{border-color:#1D9E75;box-shadow:0 0 0 3px rgba(29,158,117,0.12);background:white}
  .file-input-wrap{border:2px dashed #d9dee0;border-radius:12px;padding:18px;text-align:center;cursor:pointer;transition:border 0.2s,background 0.2s;position:relative;min-height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fafbfb}
  .file-input-wrap:hover{border-color:#1D9E75;background:#f3fbf8}
  .file-input-wrap.has-preview{border-style:solid;border-color:#1D9E75;background:white}
  .file-input-wrap input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;z-index:2}
  .file-preview-img{max-width:100%;max-height:130px;border-radius:8px;margin-bottom:10px;display:none;object-fit:cover;box-shadow:0 2px 8px rgba(0,0,0,0.12)}
  .file-icon{font-size:26px;margin-bottom:8px}
  .file-label{font-size:13px;color:#4b5563;font-weight:500}
  .file-sublabel{font-size:11px;color:#9ca3af;margin-top:3px}
  .file-name{font-size:12px;color:#04342C;font-weight:600;margin-top:8px;word-break:break-all;max-width:100%}
  .field-hint{font-size:11px;color:#9ca3af;margin-top:4px}
  .btn-subir{background:linear-gradient(135deg,#04342C,#1D9E75);color:white;border:none;padding:14px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-top:24px;font-family:inherit;width:100%;transition:opacity 0.2s,transform 0.15s;letter-spacing:0.3px}
  .btn-subir:hover{opacity:0.92;transform:translateY(-1px)}
  .btn-subir:disabled{background:#9ca3af;cursor:not-allowed;transform:none}
  .cat-manager{display:flex;gap:8px;align-items:flex-end;margin-top:6px}
  .cat-manager input{flex:1;padding:9px 11px;border:1.5px solid #e2e5e9;border-radius:8px;font-size:13px;font-family:inherit;outline:none}
  .cat-manager input:focus{border-color:#1D9E75}
  .btn-cat-add{background:#04342C;color:white;border:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
  .btn-cat-add:hover{background:#0F6E56}
  .cat-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .cat-chip{display:inline-flex;align-items:center;gap:6px;background:#e6f4ee;color:#0d7a52;padding:5px 8px 5px 12px;border-radius:20px;font-size:12.5px;font-weight:600}
  .cat-chip button{background:none;border:none;color:#0d7a52;cursor:pointer;font-size:14px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background 0.2s,color 0.2s}
  .cat-chip button:hover{background:rgba(179,38,30,0.12);color:#b3261e}
  .cat-msg{font-size:12px;margin-top:8px;display:none}
  .cat-msg.ok{color:#0a6b46;display:block}
  .cat-msg.err{color:#b3261e;display:block}
  .gallery-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
  .gallery-title{font-size:16px;font-weight:700;color:#04342C}
  .fotos-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .foto-card{background:white;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(4,52,44,0.07);border:1px solid #eef1f0;transition:box-shadow 0.2s}
  .foto-card:hover{box-shadow:0 6px 20px rgba(4,52,44,0.12)}
  .foto-img-wrap{position:relative;aspect-ratio:4/3;overflow:hidden;background:#f1f3f2}
  .foto-img{width:100%;height:100%;object-fit:cover;display:block}
  .foto-id-badge{position:absolute;top:8px;left:8px;background:rgba(4,52,44,0.75);color:white;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;letter-spacing:0.5px;backdrop-filter:blur(4px)}
  .foto-info{padding:14px}
  .foto-nombre{font-size:14px;font-weight:700;color:#111827;margin-bottom:5px;line-height:1.3}
  .foto-etiqueta{font-size:11px;color:#0d7a52;font-weight:600;margin-bottom:6px}
  .foto-meta-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  .foto-cat-pill{font-size:10.5px;font-weight:600;padding:3px 10px;border-radius:20px;background:#e6f4ee;color:#0d7a52}
  .foto-precio{font-size:15px;font-weight:800;color:#04342C}
  .btn-row{display:flex;gap:8px}
  .btn-editar{flex:1;background:#eaf3fb;color:#1d5e8c;border:none;padding:8px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:background 0.2s}
  .btn-editar:hover{background:#d4e9f9}
  .btn-eliminar{flex:1;background:#fdecec;color:#b3261e;border:none;padding:8px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:background 0.2s}
  .btn-eliminar:hover{background:#fbd5d5}
  .empty{text-align:center;padding:56px 24px;color:#9ca3af;background:white;border-radius:16px;border:1px solid #eef1f0}
  .empty-icon{font-size:40px;margin-bottom:10px}
  .msg{padding:13px 18px;border-radius:10px;font-size:13.5px;margin-bottom:18px;display:none;font-weight:500}
  .msg.ok{background:#e3f7ee;color:#0a6b46;display:block;border:1px solid #b9e8d2}
  .msg.err{background:#fdecec;color:#b3261e;display:block;border:1px solid #f8c9c9}
  .edit-form{display:none;padding:16px;background:#f8fafc;border-top:1px solid #eef1f0}
  .edit-form.open{display:block;animation:slideDown 0.2s ease}
  @keyframes slideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
  .edit-form .fg{margin-bottom:10px}
  .edit-form input,.edit-form select{padding:8px 10px;font-size:12.5px;border:1.5px solid #e2e5e9;border-radius:8px;width:100%;font-family:inherit;outline:none}
  .edit-form input:focus,.edit-form select:focus{border-color:#1D9E75}
  .edit-actions{display:flex;gap:8px;margin-top:10px}
  .btn-guardar{flex:1;background:#04342C;color:white;border:none;padding:9px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
  .btn-guardar:hover{background:#0F6E56}
  .btn-cancelar{flex:1;background:#e5e7eb;color:#374151;border:none;padding:9px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
  .btn-cancelar:hover{background:#d1d5db}
  @media(max-width:700px){.form-grid{grid-template-columns:1fr}.fotos-grid{grid-template-columns:repeat(2,1fr)}.container{padding:16px 12px 50px}.upload-card{padding:20px}.cat-manager{flex-direction:column;align-items:stretch}}
  @media(max-width:420px){.fotos-grid{grid-template-columns:1fr}}
</style></head>
<body>
<div class="navbar">
  <div class="navbar-brand">🎣 Foco Salvaje</div>
  <div class="navbar-links">
    <a class="nav-link active" href="/fs2026fotos">📷 Fotos</a>
    <a class="nav-link" href="/fs2026pedidos">📋 Pedidos</a>
    <a class="nav-link" href="/fs2026logout">Salir</a>
  </div>
</div>
<div class="container">
  <div id="msg" class="msg"></div>

  <div class="upload-card">
    <div class="upload-title">🏷️ Categorías</div>
    <div class="cat-manager">
      <input type="text" id="catInput" placeholder="Ej: Vuelo de aves">
      <button class="btn-cat-add" onclick="agregarCategoria()">+ Agregar categoría</button>
    </div>
    <div class="cat-msg" id="catMsg"></div>
    <div class="cat-list" id="catList">
      ${categorias.map(c => `<span class="cat-chip" id="catchip-${c.id}">${c.nombre}<button onclick="eliminarCategoria(${c.id})" title="Eliminar">✕</button></span>`).join('')}
    </div>
  </div>

  <div class="upload-card">
    <div class="upload-tabs">
      <button class="upload-tab active" id="tabIndividual" onclick="switchUploadTab('individual')">📷 Subir una foto</button>
      <button class="upload-tab" id="tabMultiple" onclick="switchUploadTab('multiple')">📚 Subir varias fotos</button>
    </div>

    <form id="uploadForm">
      <div class="form-grid">
        <div class="fg"><label>Nombre de la foto</label><input type="text" name="nombre" placeholder="Ej: Juan Pérez - Lanzamiento" required></div>
        <div class="fg"><label>Categoría</label><select name="categoria" id="uploadCatSelect">${catOptionsHTML(null)}</select></div>
      </div>
      <div class="form-grid" style="margin-top:18px">
        <div class="fg">
          <label>Precio ($ ARS)</label>
          <input type="number" name="precio" placeholder="1500" min="1" step="1" required>
          <div class="field-hint">Debe ser mayor a $0</div>
        </div>
        <div class="fg">
          <label>Etiqueta (opcional)</label>
          <input type="text" name="etiqueta" placeholder="Ej: Corredor 22">
          <div class="field-hint">Para agrupar y filtrar fotos relacionadas</div>
        </div>
      </div>
      <div class="form-grid" style="margin-top:18px">
        <div class="fg" style="grid-column:1/-1">
          <label>Descripción (opcional)</label>
          <input type="text" name="descripcion" placeholder="Ej: Tomada al amanecer en la costa del río">
        </div>
      </div>
      <div class="form-grid" style="margin-top:18px">
        <div class="fg">
          <label>Foto con marca de agua (galería)</label>
          <div class="file-input-wrap" id="wrap1"><input type="file" name="foto_galeria" accept="image/*" onchange="showPreview(this,'name1','prev1','wrap1')" required><img class="file-preview-img" id="prev1"><div class="file-icon" id="icon1">🖼️</div><div class="file-label" id="label1">Tocá para elegir la foto</div><div class="file-sublabel">Se muestra en la galería</div><div class="file-name" id="name1"></div></div>
        </div>
        <div class="fg">
          <label>Foto sin marca de agua (descarga)</label>
          <div class="file-input-wrap" id="wrap2"><input type="file" name="foto_descarga" accept="image/*" onchange="showPreview(this,'name2','prev2','wrap2')" required><img class="file-preview-img" id="prev2"><div class="file-icon" id="icon2">⬇️</div><div class="file-label" id="label2">Tocá para elegir la foto</div><div class="file-sublabel">Se manda al comprador</div><div class="file-name" id="name2"></div></div>
        </div>
      </div>
      <button class="btn-subir" type="submit" id="btnSubir">Subir foto</button>
    </form>

    <form id="uploadFormMultiple" style="display:none">
      <div class="form-grid">
        <div class="fg"><label>Nombre base (opcional)</label><input type="text" name="nombreBase" placeholder="Ej: Corredor 22 → Corredor 22 — Foto 1, 2..."></div>
        <div class="fg"><label>Categoría</label><select name="categoria" id="uploadCatSelectMulti">${catOptionsHTML(null)}</select></div>
      </div>
      <div class="form-grid" style="margin-top:18px">
        <div class="fg">
          <label>Precio para todo el lote ($ ARS)</label>
          <input type="number" name="precio" placeholder="1500" min="1" step="1" required>
          <div class="field-hint">Mismo precio para todas las fotos subidas</div>
        </div>
        <div class="fg">
          <label>Etiqueta (opcional)</label>
          <input type="text" name="etiqueta" placeholder="Ej: Corredor 22">
          <div class="field-hint">Para que el comprador filtre por esta etiqueta</div>
        </div>
      </div>
      <div class="form-grid" style="margin-top:18px">
        <div class="fg" style="grid-column:1/-1">
          <label>Descripción para todo el lote (opcional)</label>
          <input type="text" name="descripcion" placeholder="Ej: Tomadas durante la jornada del sábado">
        </div>
      </div>
      <div class="form-grid" style="margin-top:18px">
        <div class="fg">
          <label>Fotos con marca de agua (galería)</label>
          <div class="file-input-wrap" id="wrapMulti1"><input type="file" name="fotos_galeria" accept="image/*" multiple onchange="showMultiPreview(this,'multi1')" required><div class="file-icon">🖼️</div><div class="file-label">Tocá y elegí varias fotos</div><div class="file-sublabel">Se muestran en la galería</div><div class="multi-file-list" id="multi1"></div></div>
        </div>
        <div class="fg">
          <label>Fotos sin marca de agua (descarga)</label>
          <div class="file-input-wrap" id="wrapMulti2"><input type="file" name="fotos_descarga" accept="image/*" multiple onchange="showMultiPreview(this,'multi2')" required><div class="file-icon">⬇️</div><div class="file-label">Tocá y elegí varias fotos</div><div class="file-sublabel">Se mandan al comprador</div><div class="multi-file-list" id="multi2"></div></div>
        </div>
      </div>
      <div class="field-hint" style="margin-top:6px;text-align:center">⚠️ Elegí los archivos en el mismo orden en ambos campos (foto 1 con foto 1, foto 2 con foto 2, etc.)</div>
      <button class="btn-subir" type="submit" id="btnSubirMulti">Subir todas las fotos</button>
    </form>
  </div>

  <div class="gallery-header">
    <div class="gallery-title" id="galleryTitle">Fotos en la galería (${fotos.length})</div>
  </div>
  <div id="fotosContainer">
  ${fotos.length === 0 ? '<div class="empty"><div class="empty-icon">📷</div>No hay fotos todavía. ¡Subí la primera!</div>' : `
  <div class="fotos-grid">
    ${fotos.map(f => `<div class="foto-card" id="foto-${f.id}">
      <div class="foto-img-wrap">
        <img class="foto-img" src="${f.url_galeria}" alt="${f.nombre}">
        <div class="foto-id-badge">#${String(f.displayNum).padStart(3,'0')}</div>
      </div>
      <div class="foto-info">
        <div class="foto-nombre" id="nombre-${f.id}">${f.nombre}</div>
        ${f.etiqueta ? `<div class="foto-etiqueta" id="etq-${f.id}">🏷 ${f.etiqueta}</div>` : `<div class="foto-etiqueta" id="etq-${f.id}" style="display:none"></div>`}
        <div class="foto-meta-row">
          <span class="foto-cat-pill" id="cat-${f.id}" data-cat="${f.categoria}">${catMap[f.categoria] || f.categoria}</span>
          <span class="foto-precio" id="precio-${f.id}">$ ${parseFloat(f.precio).toLocaleString('es-AR')}</span>
        </div>
        <div class="btn-row">
          <button class="btn-editar" onclick="toggleEdit(${f.id})">✏️ Editar</button>
          <button class="btn-eliminar" onclick="eliminarFoto(${f.id})">🗑 Eliminar</button>
        </div>
      </div>
      <div class="edit-form" id="edit-${f.id}">
        <div class="fg"><label>Nombre</label><input type="text" id="edit-nombre-${f.id}" value="${f.nombre}"></div>
        <div class="fg"><label>Categoría</label>
          <select id="edit-cat-${f.id}" class="edit-cat-select">${catOptionsHTML(f.categoria)}</select>
        </div>
        <div class="fg"><label>Precio</label><input type="number" id="edit-precio-${f.id}" value="${f.precio}" min="1" step="1"></div>
        <div class="fg"><label>Etiqueta</label><input type="text" id="edit-etq-${f.id}" value="${f.etiqueta || ''}" placeholder="Ej: Corredor 22"></div>
        <div class="fg"><label>Descripción</label><input type="text" id="edit-desc-${f.id}" value="${f.descripcion || ''}" placeholder="Opcional"></div>
        <div class="edit-actions">
          <button class="btn-guardar" onclick="guardarEdit(${f.id})">Guardar</button>
          <button class="btn-cancelar" onclick="toggleEdit(${f.id})">Cancelar</button>
        </div>
      </div>
    </div>`).join('')}
  </div>`}
  </div>
</div>
<script>
var CAT_MAP = ${JSON.stringify(catMap)};
var CATEGORIAS = ${JSON.stringify(categorias)};

function catOptionsHTML(selectedSlug){
  return CATEGORIAS.map(function(c){
    return '<option value="'+c.slug+'"'+(c.slug===selectedSlug?' selected':'')+'>'+c.nombre+'</option>';
  }).join('');
}

async function agregarCategoria(){
  const input=document.getElementById('catInput');
  const nombre=input.value.trim();
  const msgEl=document.getElementById('catMsg');
  if(!nombre){
    msgEl.className='cat-msg err';
    msgEl.textContent='Escribí un nombre para la categoría';
    return;
  }
  try{
    const res=await fetch('/fs2026categoria-agregar',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nombre:nombre})
    });
    const data=await res.json();
    if(data.ok){
      msgEl.className='cat-msg ok';
      msgEl.textContent='✓ Categoría agregada';
      input.value='';
      location.reload();
    } else {
      msgEl.className='cat-msg err';
      msgEl.textContent=data.error||'No se pudo agregar';
    }
  } catch(e){
    msgEl.className='cat-msg err';
    msgEl.textContent='Error de conexión';
  }
}

async function eliminarCategoria(id){
  if(!confirm('¿Eliminar esta categoría?'))return;
  try{
    const res=await fetch('/fs2026categoria-eliminar/'+id,{method:'POST'});
    const data=await res.json();
    if(data.ok){
      const chip=document.getElementById('catchip-'+id);
      if(chip)chip.remove();
    } else {
      alert(data.error||'No se pudo eliminar');
    }
  } catch(e){
    alert('Error de conexión');
  }
}

function fotoCardHTML(f, displayNum) {
  var catLabel = CAT_MAP[f.categoria] || f.categoria;
  var html = '';
  html += '<div class="foto-card" id="foto-' + f.id + '">';
  html += '<div class="foto-img-wrap">';
  html += '<img class="foto-img" src="' + f.url_galeria + '" alt="' + f.nombre + '">';
  html += '<div class="foto-id-badge">#' + String(displayNum).padStart(3,'0') + '</div>';
  html += '</div>';
  html += '<div class="foto-info">';
  html += '<div class="foto-nombre" id="nombre-' + f.id + '">' + f.nombre + '</div>';
  html += f.etiqueta ? ('<div class="foto-etiqueta" id="etq-' + f.id + '">\ud83c\udff7 ' + f.etiqueta + '</div>') : ('<div class="foto-etiqueta" id="etq-' + f.id + '" style="display:none"></div>');
  html += '<div class="foto-meta-row">';
  html += '<span class="foto-cat-pill" id="cat-' + f.id + '" data-cat="' + f.categoria + '">' + catLabel + '</span>';
  html += '<span class="foto-precio" id="precio-' + f.id + '">$ ' + parseFloat(f.precio).toLocaleString('es-AR') + '</span>';
  html += '</div>';
  html += '<div class="btn-row">';
  html += '<button class="btn-editar" onclick="toggleEdit(' + f.id + ')">\u270f\ufe0f Editar</button>';
  html += '<button class="btn-eliminar" onclick="eliminarFoto(' + f.id + ')">\ud83d\uddd1 Eliminar</button>';
  html += '</div>';
  html += '</div>';
  html += '<div class="edit-form" id="edit-' + f.id + '">';
  html += '<div class="fg"><label>Nombre</label><input type="text" id="edit-nombre-' + f.id + '" value="' + f.nombre + '"></div>';
  html += '<div class="fg"><label>Categor\u00eda</label>';
  html += '<select id="edit-cat-' + f.id + '" class="edit-cat-select">' + catOptionsHTML(f.categoria) + '</select>';
  html += '</div>';
  html += '<div class="fg"><label>Precio</label><input type="number" id="edit-precio-' + f.id + '" value="' + f.precio + '" min="1" step="1"></div>';
  html += '<div class="fg"><label>Etiqueta</label><input type="text" id="edit-etq-' + f.id + '" value="' + (f.etiqueta || '') + '" placeholder="Ej: Corredor 22"></div>';
  html += '<div class="fg"><label>Descripci\u00f3n</label><input type="text" id="edit-desc-' + f.id + '" value="' + (f.descripcion || '') + '" placeholder="Opcional"></div>';
  html += '<div class="edit-actions">';
  html += '<button class="btn-guardar" onclick="guardarEdit(' + f.id + ')">Guardar</button>';
  html += '<button class="btn-cancelar" onclick="toggleEdit(' + f.id + ')">Cancelar</button>';
  html += '</div>';
  html += '</div>';
  html += '</div>';
  return html;
}

function refrescarGaleria() {
  return fetch('/api/fotos')
    .then(function(res){ return res.json(); })
    .then(function(fotos){
      document.getElementById('galleryTitle').textContent = 'Fotos en la galería (' + fotos.length + ')';
      var cont = document.getElementById('fotosContainer');
      if (fotos.length === 0) {
        cont.innerHTML = '<div class="empty"><div class="empty-icon">📷</div>No hay fotos todavía. ¡Subí la primera!</div>';
      } else {
        var gridHtml = '<div class="fotos-grid">';
        for (var i = 0; i < fotos.length; i++) {
          gridHtml += fotoCardHTML(fotos[i], i + 1);
        }
        gridHtml += '</div>';
        cont.innerHTML = gridHtml;
      }
    })
    .catch(function(err){ console.error('Error refrescando galería:', err); });
}

function showPreview(input,nameId,prevId,wrapId){
  const file=input.files[0];
  document.getElementById(nameId).textContent=file?file.name:'';
  const img=document.getElementById(prevId);
  const wrap=document.getElementById(wrapId);
  if(file){
    const reader=new FileReader();
    reader.onload=function(e){
      img.src=e.target.result;
      img.style.display='block';
      wrap.classList.add('has-preview');
    };
    reader.readAsDataURL(file);
  } else {
    img.style.display='none';
    wrap.classList.remove('has-preview');
  }
}

document.getElementById('uploadForm').addEventListener('submit',function(e){
  e.preventDefault();
  const form = e.target;
  const precioInput = form.querySelector('input[name="precio"]');
  const msg=document.getElementById('msg');
  if (parseFloat(precioInput.value) <= 0 || !precioInput.value) {
    msg.className='msg err';
    msg.textContent='El precio debe ser mayor a $0';
    precioInput.focus();
    return;
  }
  const btn=document.getElementById('btnSubir');
  btn.disabled=true;btn.textContent='Subiendo...';
  msg.className='msg';msg.textContent='';
  fetch('/fs2026subir',{method:'POST',body:new FormData(form)})
    .then(function(res){ return res.json(); })
    .then(function(data){
      if(data.ok){
        msg.className='msg ok';
        msg.textContent='✓ Foto subida correctamente.';
        form.reset();
        document.getElementById('name1').textContent='';
        document.getElementById('name2').textContent='';
        document.getElementById('prev1').style.display='none';
        document.getElementById('prev2').style.display='none';
        document.getElementById('wrap1').classList.remove('has-preview');
        document.getElementById('wrap2').classList.remove('has-preview');
        return refrescarGaleria().then(function(){
          setTimeout(function(){ msg.className='msg'; msg.textContent=''; }, 3500);
        });
      } else {
        msg.className='msg err';
        msg.textContent='Error: '+(data.error||'No se pudo subir');
      }
    })
    .catch(function(){
      msg.className='msg err';
      msg.textContent='Error de conexión.';
    })
    .finally(function(){
      btn.disabled=false;btn.textContent='Subir foto';
    });
});

function eliminarFoto(id){
  if(!confirm('¿Eliminar esta foto?'))return;
  fetch('/fs2026eliminar/'+id,{method:'POST'})
    .then(function(res){ return res.json(); })
    .then(function(data){
      if(data.ok){
        var el = document.getElementById('foto-'+id);
        if(el) el.remove();
        var title = document.getElementById('galleryTitle');
        var current = document.querySelectorAll('.foto-card').length;
        title.textContent = 'Fotos en la galería (' + current + ')';
        if(current === 0){
          document.getElementById('fotosContainer').innerHTML = '<div class="empty"><div class="empty-icon">📷</div>No hay fotos todavía. ¡Subí la primera!</div>';
        }
      }
    });
}

function toggleEdit(id){
  document.getElementById('edit-'+id).classList.toggle('open');
}

function guardarEdit(id){
  const nombre=document.getElementById('edit-nombre-'+id).value.trim();
  const categoria=document.getElementById('edit-cat-'+id).value;
  const precio=document.getElementById('edit-precio-'+id).value;
  const etiqueta=document.getElementById('edit-etq-'+id).value.trim();
  const descripcion=document.getElementById('edit-desc-'+id).value.trim();
  if(!nombre){alert('El nombre no puede estar vacío');return;}
  if(!precio || parseFloat(precio) <= 0){alert('El precio debe ser mayor a $0');return;}
  fetch('/fs2026editar/'+id,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({nombre:nombre,categoria:categoria,precio:precio,descripcion:descripcion,etiqueta:etiqueta})
  })
    .then(function(res){ return res.json(); })
    .then(function(data){
      if(data.ok){
        document.getElementById('nombre-'+id).textContent=nombre;
        const catEl=document.getElementById('cat-'+id);
        catEl.textContent=CAT_MAP[categoria]||categoria;
        catEl.dataset.cat=categoria;
        document.getElementById('precio-'+id).textContent='$ '+parseFloat(precio).toLocaleString('es-AR');
        const etqEl=document.getElementById('etq-'+id);
        if(etiqueta){ etqEl.textContent='🏷 '+etiqueta; etqEl.style.display='block'; }
        else { etqEl.textContent=''; etqEl.style.display='none'; }
        toggleEdit(id);
      } else {
        alert('Error al guardar: '+(data.error||''));
      }
    });
}

function switchUploadTab(tab){
  const formInd=document.getElementById('uploadForm');
  const formMulti=document.getElementById('uploadFormMultiple');
  const tabInd=document.getElementById('tabIndividual');
  const tabMulti=document.getElementById('tabMultiple');
  if(tab==='individual'){
    formInd.style.display='block'; formMulti.style.display='none';
    tabInd.classList.add('active'); tabMulti.classList.remove('active');
  } else {
    formInd.style.display='none'; formMulti.style.display='block';
    tabInd.classList.remove('active'); tabMulti.classList.add('active');
  }
}

function showMultiPreview(input,listId){
  const list=document.getElementById(listId);
  const files=Array.from(input.files||[]);
  if(files.length===0){ list.innerHTML=''; return; }
  list.innerHTML=files.map(function(f,i){ return '<div>'+(i+1)+'. '+f.name+'</div>'; }).join('');
}

document.getElementById('uploadFormMultiple').addEventListener('submit',function(e){
  e.preventDefault();
  const form=e.target;
  const precioInput=form.querySelector('input[name="precio"]');
  const msg=document.getElementById('msg');
  const galInput=form.querySelector('input[name="fotos_galeria"]');
  const descInput=form.querySelector('input[name="fotos_descarga"]');
  const galFiles=Array.from(galInput.files||[]);
  const descFiles=Array.from(descInput.files||[]);

  if(parseFloat(precioInput.value)<=0||!precioInput.value){
    msg.className='msg err'; msg.textContent='El precio debe ser mayor a $0'; precioInput.focus(); return;
  }
  if(galFiles.length===0||descFiles.length===0){
    msg.className='msg err'; msg.textContent='Elegí al menos un par de fotos (galería y descarga)'; return;
  }
  if(galFiles.length!==descFiles.length){
    msg.className='msg err'; msg.textContent='La cantidad de fotos de galería ('+galFiles.length+') no coincide con la de descarga ('+descFiles.length+')'; return;
  }
  if(galFiles.length>20){
    msg.className='msg err'; msg.textContent='Máximo 20 fotos por lote'; return;
  }

  const fd=new FormData();
  fd.append('categoria', form.querySelector('select[name="categoria"]').value);
  fd.append('precio', precioInput.value);
  fd.append('etiqueta', form.querySelector('input[name="etiqueta"]').value);
  fd.append('descripcion', form.querySelector('input[name="descripcion"]').value);
  fd.append('nombreBase', form.querySelector('input[name="nombreBase"]').value);
  galFiles.forEach(function(f,i){ fd.append('foto_galeria_'+i, f); });
  descFiles.forEach(function(f,i){ fd.append('foto_descarga_'+i, f); });

  const btn=document.getElementById('btnSubirMulti');
  btn.disabled=true; btn.textContent='Subiendo '+galFiles.length+' fotos...';
  msg.className='msg'; msg.textContent='';

  fetch('/fs2026subir-multiple',{method:'POST',body:fd})
    .then(function(res){ return res.json(); })
    .then(function(data){
      if(data.ok){
        msg.className='msg ok';
        msg.textContent='✓ '+data.subidas+' foto(s) subida(s) correctamente.'+(data.errores>0?(' ('+data.errores+' con error)'):'');
        form.reset();
        document.getElementById('multi1').innerHTML='';
        document.getElementById('multi2').innerHTML='';
        return refrescarGaleria().then(function(){
          setTimeout(function(){ msg.className='msg'; msg.textContent=''; }, 4500);
        });
      } else {
        msg.className='msg err';
        msg.textContent='Error: '+(data.error||'No se pudo subir');
      }
    })
    .catch(function(){
      msg.className='msg err';
      msg.textContent='Error de conexión.';
    })
    .finally(function(){
      btn.disabled=false; btn.textContent='Subir todas las fotos';
    });
});
</script>
</body></html>`);
  } catch (err) { res.status(500).send('Error'); }
});

app.get('/fs2026pedidos', async (req, res) => {
  if (!req.session.admin) return res.redirect('/fs2026admin');
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute('SELECT * FROM pedidos ORDER BY fecha DESC');
    await conn.end();
    const sortedAsc = [...rows].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const numPorId = {};
    sortedAsc.forEach((r, idx) => { numPorId[r.id] = idx + 1; });
    rows.forEach(r => { r.displayNum = numPorId[r.id]; });
    const PER_PAGE = 20;
    const page = parseInt(req.query.page) || 1;
    const busqueda = req.query.q || '';
    const filtroEstado = req.query.estado || '';
    const filtroFecha = req.query.fecha || '';
    const filtroEntregado = req.query.entregado || '';
    let filtered = rows.filter(r => {
      const matchQ = !busqueda || r.nombre.toLowerCase().includes(busqueda.toLowerCase()) || r.email.toLowerCase().includes(busqueda.toLowerCase());
      const matchEstado = !filtroEstado || r.estado === filtroEstado;
      const matchFecha = !filtroFecha || new Date(r.fecha).toISOString().slice(0,10) === filtroFecha;
      const matchEntregado = filtroEntregado === '' ? true : (filtroEntregado === '1' ? r.entregado == 1 : r.entregado == 0);
      return matchQ && matchEstado && matchFecha && matchEntregado;
    });
    const total = filtered.length;
    const totalPages = Math.ceil(total / PER_PAGE);
    const paginated = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);
    const cobrados = rows.filter(r => r.estado === 'exitoso').length;
    const entregados = rows.filter(r => r.entregado == 1).length;
    const pendientes = rows.filter(r => r.estado === 'pendiente').length;
    const qStr = (extra={}) => new URLSearchParams({ q: busqueda, estado: filtroEstado, fecha: filtroFecha, entregado: filtroEntregado, ...extra }).toString();
    res.send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pedidos — Foco Salvaje</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',sans-serif;background:#f0f4f3;min-height:100vh}
  .navbar{background:linear-gradient(135deg,#04342C,#0F6E56);padding:14px 20px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 12px rgba(0,0,0,0.15);flex-wrap:wrap;gap:10px}
  .navbar-brand{color:white;font-size:17px;font-weight:700}
  .navbar-links{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .nav-link{color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;border:1px solid rgba(255,255,255,0.3);padding:6px 14px;border-radius:6px}
  .nav-link:hover{background:rgba(255,255,255,0.1);color:white}
  .nav-link.active{background:rgba(255,255,255,0.15);color:white}
  .container{padding:20px;max-width:1200px;margin:0 auto}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
  .stat{background:white;border-radius:12px;padding:18px 20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border-left:4px solid transparent}
  .stat.s1{border-left-color:#6366f1}.stat.s2{border-left-color:#10b981}.stat.s3{border-left-color:#f59e0b}.stat.s4{border-left-color:#04342C}
  .stat-num{font-size:26px;font-weight:700;color:#111827;line-height:1}
  .stat-label{font-size:12px;color:#6b7280;margin-top:5px}
  .stat-icon{font-size:22px;margin-bottom:6px}
  .filters{background:white;border-radius:12px;padding:16px 20px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
  .filters-title{font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
  .filters form{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
  .fg{display:flex;flex-direction:column;gap:4px;flex:1;min-width:130px}
  .fg label{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px}
  .fg input,.fg select{padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:13px;font-family:inherit;outline:none;transition:border 0.2s;background:white}
  .fg input:focus,.fg select:focus{border-color:#1D9E75}
  .btn-filter{background:#04342C;color:white;border:none;padding:8px 20px;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}
  .btn-clear{color:#6b7280;border:1.5px solid #e5e7eb;background:white;padding:8px 14px;border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;text-decoration:none;display:inline-block}
  .results-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  .results{font-size:13px;color:#6b7280}
  .table-wrap{background:white;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden}
  .table-scroll{overflow-x:auto}
  table{width:100%;border-collapse:collapse;min-width:600px}
  thead{background:linear-gradient(135deg,#04342C,#0F6E56)}
  th{color:white;padding:12px 16px;text-align:left;font-size:12px;font-weight:600;white-space:nowrap}
  td{padding:12px 16px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#f9fafb}
  .badge{padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;display:inline-block}
  .badge.pendiente{background:#fef3c7;color:#d97706}
  .badge.exitoso{background:#d1fae5;color:#065f46}
  .btn-entregar{border:none;padding:6px 13px;border-radius:6px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:600;transition:all 0.2s}
  .btn-entregar.no{background:#f3f4f6;color:#6b7280}
  .btn-entregar.no:hover{background:#04342C;color:white}
  .btn-entregar.si{background:#d1fae5;color:#065f46}
  .pagination{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
  .page-btn{padding:7px 13px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:500;border:1.5px solid #e5e7eb;color:#374151;background:white;transition:all 0.2s}
  .page-btn.active{background:#04342C;color:white;border-color:#04342C}
  .empty{text-align:center;padding:60px 20px;color:#9ca3af}
  @media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}.container{padding:12px}}
</style></head>
<body>
<div class="navbar">
  <div class="navbar-brand">🎣 Foco Salvaje</div>
  <div class="navbar-links">
    <a class="nav-link" href="/fs2026fotos">📷 Fotos</a>
    <a class="nav-link active" href="/fs2026pedidos">📋 Pedidos</a>
    <a class="nav-link" href="/fs2026logout">Salir</a>
  </div>
</div>
<div class="container">
  <div class="stats">
    <div class="stat s1"><div class="stat-icon">📋</div><div class="stat-num">${rows.length}</div><div class="stat-label">Total pedidos</div></div>
    <div class="stat s2"><div class="stat-icon">💰</div><div class="stat-num">${cobrados}</div><div class="stat-label">Cobrados</div></div>
    <div class="stat s3"><div class="stat-icon">⏳</div><div class="stat-num">${pendientes}</div><div class="stat-label">Pendientes</div></div>
    <div class="stat s4"><div class="stat-icon">📤</div><div class="stat-num">${entregados}</div><div class="stat-label">Entregados</div></div>
  </div>
  <div class="filters">
    <div class="filters-title">🔍 Filtros</div>
    <form method="get" action="/fs2026pedidos">
      <div class="fg"><label>Buscar</label><input type="text" name="q" value="${busqueda}" placeholder="Nombre o email..."></div>
      <div class="fg"><label>Estado</label><select name="estado"><option value="">Todos</option><option value="pendiente" ${filtroEstado==='pendiente'?'selected':''}>Pendiente</option><option value="exitoso" ${filtroEstado==='exitoso'?'selected':''}>Exitoso</option></select></div>
      <div class="fg"><label>Entregado</label><select name="entregado"><option value="">Todos</option><option value="0" ${filtroEntregado==='0'?'selected':''}>No entregado</option><option value="1" ${filtroEntregado==='1'?'selected':''}>Entregado</option></select></div>
      <div class="fg"><label>Fecha</label><input type="date" name="fecha" value="${filtroFecha}"></div>
      <button class="btn-filter" type="submit">Filtrar</button>
      <a class="btn-clear" href="/fs2026pedidos">Limpiar</a>
    </form>
  </div>
  <div class="results-bar">
    <div class="results">Mostrando <strong>${paginated.length}</strong> de <strong>${total}</strong> pedidos</div>
    <div class="results">Total: <strong>$ ${filtered.reduce((s,r)=>s+parseFloat(r.total),0).toLocaleString('es-AR')}</strong></div>
  </div>
  ${paginated.length === 0 ? `<div class="table-wrap"><div class="empty"><div style="font-size:48px;margin-bottom:12px">🔍</div><div>No hay pedidos con esos filtros</div></div></div>` : `
  <div class="table-wrap">
    <div class="table-scroll">
      <table>
        <thead><tr><th>#</th><th>Nombre</th><th>Email</th><th>Fotos</th><th>Total</th><th>Estado</th><th>Entregado</th><th>Fecha</th><th></th><th></th></tr></thead>
        <tbody>
          ${paginated.map(r => `<tr id="pedido-${r.id}">
            <td><strong>${r.displayNum}</strong></td>
            <td style="max-width:160px;white-space:normal;word-break:break-word">${r.nombre}</td>
            <td><span id="email-${r.id}">${r.email}</span> <button onclick="toggleEmailEdit(${r.id})" style="border:none;background:none;cursor:pointer;font-size:11px;color:#1d5e8c;">✏️</button>
              <div id="email-edit-${r.id}" style="display:none;margin-top:6px">
                <input type="email" id="email-input-${r.id}" value="${r.email}" style="font-size:12px;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;width:160px">
                <button onclick="guardarEmail(${r.id})" style="border:none;background:#04342C;color:white;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;">OK</button>
              </div>
            </td>
            <td style="max-width:260px;white-space:normal;word-break:break-word;line-height:1.4">${r.fotos}</td>
            <td><strong>$ ${parseFloat(r.total).toLocaleString('es-AR')}</strong></td>
            <td><span class="badge ${r.estado}">${r.estado}</span></td>
            <td><button class="btn-entregar ${r.entregado?'si':'no'}" onclick="toggleEntregar(${r.id},this)">${r.entregado?'✓ Entregado':'Entregar'}</button></td>
            <td style="white-space:nowrap">${new Date(r.fecha).toLocaleString('es-AR',{timeZone:'America/Argentina/Mendoza',hour12:false})}</td>
            <td><button onclick="eliminarPedido(${r.id})" style="border:none;background:#fee2e2;color:#991b1b;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">🗑</button></td>
            <td><button onclick="reenviarFotos(${r.id})" style="border:none;background:#e0f2fe;color:#075985;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;">📧 Reenviar</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${totalPages > 1 ? `<div style="padding:16px;border-top:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div style="font-size:13px;color:#6b7280">Página <strong>${page}</strong> de <strong>${totalPages}</strong></div>
      <div class="pagination">
        ${page > 1 ? `<a class="page-btn" href="/fs2026pedidos?${qStr({page:page-1})}">← Anterior</a>` : ''}
        ${Array.from({length:Math.min(totalPages,7)},(_,i)=>i+1).map(p=>`<a class="page-btn ${p===page?'active':''}" href="/fs2026pedidos?${qStr({page:p})}">${p}</a>`).join('')}
        ${page < totalPages ? `<a class="page-btn" href="/fs2026pedidos?${qStr({page:page+1})}">Siguiente →</a>` : ''}
      </div>
    </div>` : ''}
  </div>`}
</div>
<script>
function toggleEmailEdit(id){
  const div=document.getElementById('email-edit-'+id);
  div.style.display = div.style.display==='none' ? 'block' : 'none';
}
async function guardarEmail(id){
  const nuevoEmail=document.getElementById('email-input-'+id).value.trim();
  if(!nuevoEmail||!nuevoEmail.includes('@')){alert('Ingresá un email válido');return;}
  const res=await fetch('/fs2026editar-email/'+id,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:nuevoEmail})
  });
  const data=await res.json();
  if(data.ok){
    document.getElementById('email-'+id).textContent=nuevoEmail;
    toggleEmailEdit(id);
  } else {
    alert('Error: '+(data.error||'No se pudo guardar'));
  }
}
async function eliminarPedido(id){
  if(!confirm('¿Eliminar este pedido?'))return;
  const res=await fetch('/fs2026eliminar-pedido/'+id,{method:'POST'});
  const data=await res.json();
  if(data.ok)document.getElementById('pedido-'+id).remove();
}
async function reenviarFotos(id){
  if(!confirm('¿Reenviar las fotos de este pedido por email? El pedido se marcará como exitoso.'))return;
  const res=await fetch('/fs2026reenviar/'+id,{method:'POST'});
  const data=await res.json();
  if(data.ok){
    alert('✓ Email reenviado y pedido marcado como exitoso.');
    location.reload();
  }
  else alert('Error: '+(data.error||'No se pudo reenviar'));
}
async function toggleEntregar(id,btn){
  const res=await fetch('/fs2026entregar/'+id,{method:'POST'});
  const data=await res.json();
  if(data.entregado){btn.textContent='✓ Entregado';btn.className='btn-entregar si';}
  else{btn.textContent='Entregar';btn.className='btn-entregar no';}
}
</script>
</body></html>`);
  } catch (err) { res.status(500).send('Error conectando a la base de datos'); }
});

app.get('/pedidos', (req, res) => res.status(404).send('Not found'));
app.get('/admin/login', (req, res) => res.status(404).send('Not found'));

app.get('/pago-fallido', (req, res) => {
  res.send(`<html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#F4EFE6;margin:0}.box{text-align:center;background:white;padding:48px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}h1{color:#c0392b;font-size:28px;margin-bottom:12px}p{color:#5C5C58;margin-bottom:24px}a{background:#04342C;color:white;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px}</style></head><body><div class="box"><h1>✕ Pago fallido</h1><p>Hubo un problema con el pago.<br>Por favor intentá de nuevo.</p><a href="/">Volver a la galería</a></div></body></html>`);
});
app.get('/pago-pendiente', (req, res) => {
  res.send(`<html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#F4EFE6;margin:0}.box{text-align:center;background:white;padding:48px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}h1{color:#f39c12;font-size:28px;margin-bottom:12px}p{color:#5C5C58;margin-bottom:24px}a{background:#04342C;color:white;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px}</style></head><body><div class="box"><h1>⏳ Pago pendiente</h1><p>Tu pago está siendo procesado.<br>Te avisaremos cuando se confirme.</p><a href="/">Volver a la galería</a></div></body></html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✓ Servidor corriendo en puerto ${PORT}`);
  console.log(`✓ Panel admin: ${BASE_URL}/fs2026admin`);
});
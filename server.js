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
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        fotos TEXT NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        estado VARCHAR(50) DEFAULT 'pendiente',
        entregado TINYINT(1) DEFAULT 0,
        mp_preference_id VARCHAR(255),
        mp_payment_id VARCHAR(255),
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS fotos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        categoria VARCHAR(50) DEFAULT 'accion',
        precio DECIMAL(10,2) NOT NULL,
        url_galeria VARCHAR(500) NOT NULL,
        url_descarga VARCHAR(500) NOT NULL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { await conn.execute('ALTER TABLE pedidos ADD COLUMN entregado TINYINT(1) DEFAULT 0'); } catch(e) {}
    try { await conn.execute('ALTER TABLE pedidos ADD COLUMN mp_preference_id VARCHAR(255)'); } catch(e) {}
    try { await conn.execute('ALTER TABLE pedidos ADD COLUMN mp_payment_id VARCHAR(255)'); } catch(e) {}
    console.log('✓ Base de datos conectada y lista');
    await conn.end();
  } catch (err) {
    console.error('Error conectando a la base de datos:', err.message);
  }
}

initDB();

app.get('/api/fotos', async (req, res) => {
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute('SELECT * FROM fotos ORDER BY fecha DESC');
    await conn.end();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

app.post('/fs2026subir', upload.fields([{name:'foto_galeria'},{name:'foto_descarga'}]), async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const { nombre, categoria, precio } = req.body;
    if (!nombre || !categoria || !precio || !req.files?.foto_galeria || !req.files?.foto_descarga) {
      return res.status(400).json({ error: 'Faltan datos' });
    }
    const galResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'focosalvaje/galeria', public_id: `gal_${Date.now()}` },
        (err, result) => err ? reject(err) : resolve(result)
      ).end(req.files.foto_galeria[0].buffer);
    });
    const descResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'focosalvaje/descarga', public_id: `desc_${Date.now()}` },
        (err, result) => err ? reject(err) : resolve(result)
      ).end(req.files.foto_descarga[0].buffer);
    });
    const conn = await mysql.createConnection(dbConfig);
    await conn.execute(
      'INSERT INTO fotos (nombre, categoria, precio, url_galeria, url_descarga) VALUES (?, ?, ?, ?, ?)',
      [nombre, categoria, parseFloat(precio), galResult.secure_url, descResult.secure_url]
    );
    await conn.end();
    res.json({ ok: true });
  } catch (err) {
    console.error('Error subiendo foto:', err);
    res.status(500).json({ error: 'Error subiendo foto' });
  }
});

app.post('/fs2026eliminar/:id', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const conn = await mysql.createConnection(dbConfig);
    await conn.execute('DELETE FROM fotos WHERE id = ?', [req.params.id]);
    await conn.end();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

app.post('/crear-preferencia', async (req, res) => {
  try {
    const { items, buyer } = req.body;
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: items.map(item => ({
          id: String(item.id),
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
        notification_url: `${BASE_URL}/webhook`,
        statement_descriptor: 'Foco Salvaje',
      }
    });
    if (buyer && buyer.name && buyer.email) {
      try {
        const conn = await mysql.createConnection(dbConfig);
        const fotos = items.map(i => i.name).join(', ');
        const total = items.reduce((s, i) => s + i.price, 0);
        await conn.execute(
          'INSERT INTO pedidos (nombre, email, fotos, total, estado, mp_preference_id) VALUES (?, ?, ?, ?, ?, ?)',
          [buyer.name, buyer.email, fotos, total, 'pendiente', result.id]
        );
        await conn.end();
      } catch (dbErr) { console.error('Error guardando pedido:', dbErr.message); }
    }
    res.json({ init_point: result.init_point, id: result.id });
  } catch (error) {
    console.error('Error al crear preferencia:', error);
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
});

// Webhook MP — busca por email del comprador
app.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;
    console.log('Webhook recibido:', JSON.stringify(req.body));

    if (type === 'payment' && data && data.id) {
      const payment = new Payment(client);
      const paymentInfo = await payment.get({ id: Number(data.id) });
      console.log('Payment status:', paymentInfo.status);
      console.log('Payer email:', paymentInfo.payer?.email);
      console.log('preference_id:', paymentInfo.preference_id);

      let estado = 'pendiente';
      if (paymentInfo.status === 'approved') estado = 'exitoso';
      if (paymentInfo.status === 'rejected') estado = 'fallido';

      const conn = await mysql.createConnection(dbConfig);

      // Intentar por preference_id primero
      if (paymentInfo.preference_id) {
        const [r1] = await conn.execute(
          'UPDATE pedidos SET estado = ?, mp_payment_id = ? WHERE mp_preference_id = ?',
          [estado, String(data.id), paymentInfo.preference_id]
        );
        console.log('Por preference_id:', r1.affectedRows, 'filas');
        if (r1.affectedRows > 0) { await conn.end(); res.sendStatus(200); return; }
      }

      // Si no encontró, buscar por email del comprador (pedido más reciente pendiente)
      const payerEmail = paymentInfo.payer?.email;
      if (payerEmail) {
        const [r2] = await conn.execute(
          'UPDATE pedidos SET estado = ?, mp_payment_id = ? WHERE email = ? AND estado = "pendiente" ORDER BY fecha DESC LIMIT 1',
          [estado, String(data.id), payerEmail]
        );
        console.log('Por email (', payerEmail, '):', r2.affectedRows, 'filas | estado:', estado);
      } else {
        console.log('Sin preference_id ni email del comprador');
      }

      await conn.end();
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.sendStatus(500);
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
  if (req.body.pass === 'Cuncarop12') {
    req.session.admin = true;
    res.redirect('/fs2026pedidos');
  } else {
    res.redirect('/fs2026admin?error=1');
  }
});

app.get('/fs2026logout', (req, res) => {
  req.session.destroy();
  res.redirect('/fs2026admin');
});

app.get('/fs2026fotos', async (req, res) => {
  if (!req.session.admin) return res.redirect('/fs2026admin');
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [fotos] = await conn.execute('SELECT * FROM fotos ORDER BY fecha DESC');
    await conn.end();
    res.send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fotos — Foco Salvaje</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',sans-serif;background:#f0f4f3;min-height:100vh}
  .navbar{background:linear-gradient(135deg,#04342C,#0F6E56);padding:14px 20px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 12px rgba(0,0,0,0.15);flex-wrap:wrap;gap:10px}
  .navbar-brand{color:white;font-size:17px;font-weight:700}
  .navbar-links{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .nav-link{color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;border:1px solid rgba(255,255,255,0.3);padding:6px 14px;border-radius:6px}
  .nav-link:hover{background:rgba(255,255,255,0.1);color:white}
  .nav-link.active{background:rgba(255,255,255,0.15);color:white}
  .container{padding:20px;max-width:1000px;margin:0 auto}
  .upload-card{background:white;border-radius:12px;padding:24px;margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
  .upload-title{font-size:16px;font-weight:700;color:#04342C;margin-bottom:20px}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .fg{display:flex;flex-direction:column;gap:6px}
  .fg label{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px}
  .fg input,.fg select{padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;outline:none;transition:border 0.2s}
  .fg input:focus,.fg select:focus{border-color:#1D9E75}
  .file-input-wrap{border:2px dashed #e5e7eb;border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:border 0.2s;position:relative}
  .file-input-wrap:hover{border-color:#1D9E75}
  .file-input-wrap input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
  .file-icon{font-size:28px;margin-bottom:8px}
  .file-label{font-size:13px;color:#6b7280}
  .file-sublabel{font-size:11px;color:#9ca3af;margin-top:4px}
  .file-name{font-size:12px;color:#04342C;font-weight:500;margin-top:8px}
  .btn-subir{background:linear-gradient(135deg,#04342C,#1D9E75);color:white;border:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:20px;font-family:inherit;width:100%}
  .btn-subir:hover{opacity:0.9}
  .btn-subir:disabled{background:#9ca3af;cursor:not-allowed}
  .fotos-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .foto-card{background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
  .foto-img{width:100%;aspect-ratio:4/3;object-fit:cover}
  .foto-info{padding:12px}
  .foto-nombre{font-size:13px;font-weight:600;color:#111827}
  .foto-cat{font-size:11px;color:#6b7280;margin-top:2px;text-transform:capitalize}
  .foto-precio{font-size:14px;font-weight:700;color:#04342C;margin-top:6px}
  .btn-eliminar{width:100%;margin-top:8px;background:#fee2e2;color:#991b1b;border:none;padding:7px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
  .btn-eliminar:hover{background:#fecaca}
  .empty{text-align:center;padding:48px;color:#9ca3af;background:white;border-radius:12px}
  .msg{padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:16px;display:none}
  .msg.ok{background:#d1fae5;color:#065f46;display:block}
  .msg.err{background:#fee2e2;color:#991b1b;display:block}
  @media(max-width:600px){.form-grid{grid-template-columns:1fr}.fotos-grid{grid-template-columns:repeat(2,1fr)}}
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
    <div class="upload-title">📷 Subir nueva foto</div>
    <form id="uploadForm">
      <div class="form-grid">
        <div class="fg"><label>Nombre de la foto</label><input type="text" name="nombre" placeholder="Ej: Juan Pérez - Lanzamiento" required></div>
        <div class="fg"><label>Categoría</label><select name="categoria"><option value="accion">Acción</option><option value="retrato">Retrato</option><option value="paisaje">Paisaje</option></select></div>
        <div class="fg"><label>Precio ($ ARS)</label><input type="number" name="precio" placeholder="1500" required></div>
      </div>
      <div class="form-grid" style="margin-top:16px">
        <div class="fg">
          <label>Foto con marca de agua (galería)</label>
          <div class="file-input-wrap"><input type="file" name="foto_galeria" accept="image/*" onchange="showName(this,'name1')" required><div class="file-icon">🖼️</div><div class="file-label">Tocá para elegir la foto</div><div class="file-sublabel">Se muestra en la galería</div><div class="file-name" id="name1"></div></div>
        </div>
        <div class="fg">
          <label>Foto sin marca de agua (descarga)</label>
          <div class="file-input-wrap"><input type="file" name="foto_descarga" accept="image/*" onchange="showName(this,'name2')" required><div class="file-icon">⬇️</div><div class="file-label">Tocá para elegir la foto</div><div class="file-sublabel">Se manda al comprador</div><div class="file-name" id="name2"></div></div>
        </div>
      </div>
      <button class="btn-subir" type="submit" id="btnSubir">Subir foto</button>
    </form>
  </div>
  <div class="upload-title" style="margin-bottom:14px;font-size:15px">Fotos en la galería (${fotos.length})</div>
  ${fotos.length === 0 ? '<div class="empty">No hay fotos todavía. ¡Subí la primera!</div>' : `
  <div class="fotos-grid">
    ${fotos.map(f => `<div class="foto-card" id="foto-${f.id}">
      <img class="foto-img" src="${f.url_galeria}" alt="${f.nombre}">
      <div class="foto-info">
        <div class="foto-nombre">${f.nombre}</div>
        <div class="foto-cat">${f.categoria}</div>
        <div class="foto-precio">$ ${parseFloat(f.precio).toLocaleString('es-AR')}</div>
        <button class="btn-eliminar" onclick="eliminarFoto(${f.id})">🗑 Eliminar</button>
      </div>
    </div>`).join('')}
  </div>`}
</div>
<script>
function showName(input,id){document.getElementById(id).textContent=input.files[0]?.name||'';}
document.getElementById('uploadForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=document.getElementById('btnSubir');btn.disabled=true;btn.textContent='Subiendo...';
  const msg=document.getElementById('msg');msg.className='msg';msg.textContent='';
  try{
    const res=await fetch('/fs2026subir',{method:'POST',body:new FormData(e.target)});
    const data=await res.json();
    if(data.ok){msg.className='msg ok';msg.textContent='✓ Foto subida. Recargá la página para verla.';e.target.reset();document.getElementById('name1').textContent='';document.getElementById('name2').textContent='';}
    else{msg.className='msg err';msg.textContent='Error: '+(data.error||'No se pudo subir');}
  }catch(err){msg.className='msg err';msg.textContent='Error de conexión.';}
  btn.disabled=false;btn.textContent='Subir foto';
});
async function eliminarFoto(id){
  if(!confirm('¿Eliminar esta foto?'))return;
  const res=await fetch('/fs2026eliminar/'+id,{method:'POST'});
  const data=await res.json();
  if(data.ok)document.getElementById('foto-'+id).remove();
}
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
  .badge.fallido{background:#fee2e2;color:#991b1b}
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
      <div class="fg"><label>Estado</label><select name="estado"><option value="">Todos</option><option value="pendiente" ${filtroEstado==='pendiente'?'selected':''}>Pendiente</option><option value="exitoso" ${filtroEstado==='exitoso'?'selected':''}>Exitoso</option><option value="fallido" ${filtroEstado==='fallido'?'selected':''}>Fallido</option></select></div>
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
        <thead><tr><th>#</th><th>Nombre</th><th>Email</th><th>Fotos</th><th>Total</th><th>Estado</th><th>Entregado</th><th>Fecha</th></tr></thead>
        <tbody>
          ${paginated.map(r => `<tr>
            <td><strong>${r.id}</strong></td>
            <td>${r.nombre}</td>
            <td>${r.email}</td>
            <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.fotos}</td>
            <td><strong>$ ${parseFloat(r.total).toLocaleString('es-AR')}</strong></td>
            <td><span class="badge ${r.estado}">${r.estado}</span></td>
            <td><button class="btn-entregar ${r.entregado?'si':'no'}" onclick="toggleEntregar(${r.id},this)">${r.entregado?'✓ Entregado':'Entregar'}</button></td>
            <td style="white-space:nowrap">${new Date(r.fecha).toLocaleString('es-AR',{timeZone:'America/Argentina/Mendoza',hour12:false})}</td>
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

app.get('/pago-exitoso', (req, res) => {
  res.send(`<html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#F4EFE6;margin:0}.box{text-align:center;background:white;padding:48px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}h1{color:#1D9E75;font-size:28px;margin-bottom:12px}p{color:#5C5C58;margin-bottom:24px}a{background:#04342C;color:white;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px}</style></head><body><div class="box"><h1>✓ Pago exitoso</h1><p>Tu compra fue procesada correctamente.<br>Vas a recibir las fotos por email.</p><a href="/">Volver a la galería</a></div></body></html>`);
});
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
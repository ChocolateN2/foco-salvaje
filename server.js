const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const mysql = require('mysql2/promise');
const path = require('path');

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
    // Agregar columna entregado si no existe
    try {
      await conn.execute('ALTER TABLE pedidos ADD COLUMN entregado TINYINT(1) DEFAULT 0');
    } catch(e) {}
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
      } catch (dbErr) {
        console.error('Error guardando pedido:', dbErr.message);
      }
    }

    res.json({ init_point: result.init_point, id: result.id });
  } catch (error) {
    console.error('Error al crear preferencia:', error);
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === 'payment' && data && data.id) {
      const payment = new Payment(client);
      const paymentInfo = await payment.get({ id: data.id });
      let estado = 'pendiente';
      if (paymentInfo.status === 'approved') estado = 'exitoso';
      if (paymentInfo.status === 'rejected') estado = 'fallido';
      if (paymentInfo.preference_id) {
        const conn = await mysql.createConnection(dbConfig);
        await conn.execute(
          'UPDATE pedidos SET estado = ?, mp_payment_id = ? WHERE mp_preference_id = ?',
          [estado, String(data.id), paymentInfo.preference_id]
        );
        await conn.end();
      }
    }
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
});

// Marcar como entregado
app.post('/fs2026entregar/:id', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'No autorizado' });
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute('SELECT entregado FROM pedidos WHERE id = ?', [req.params.id]);
    const nuevoEstado = rows[0].entregado ? 0 : 1;
    await conn.execute('UPDATE pedidos SET entregado = ? WHERE id = ?', [nuevoEstado, req.params.id]);
    await conn.end();
    res.json({ entregado: nuevoEstado });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

app.get('/fs2026admin', (req, res) => {
  if (req.session.admin) return res.redirect('/fs2026pedidos');
  const error = req.query.error ? '<p style="color:#c0392b;margin-bottom:12px;font-size:13px">Contraseña incorrecta</p>' : '';
  res.send(`
    <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#F4EFE6;margin:0;padding:16px;box-sizing:border-box}
      .box{background:white;padding:40px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.08);text-align:center;width:100%;max-width:320px}
      h2{color:#04342C;margin-bottom:8px;font-family:serif;font-size:22px}
      .sub{color:#9C9C94;font-size:13px;margin-bottom:24px;margin-top:0}
      label{display:block;text-align:left;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#9C9C94;margin-bottom:6px}
      input{padding:10px 14px;border:1px solid rgba(4,52,44,0.15);border-radius:4px;font-size:14px;width:100%;box-sizing:border-box;outline:none;margin-bottom:16px}
      input:focus{border-color:#1D9E75}
      button{width:100%;background:#04342C;color:white;border:none;padding:12px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:500}
      button:hover{background:#0F6E56}
    </style></head>
    <body><div class="box">
      <h2>🔒 Foco Salvaje</h2>
      <p class="sub">Panel de administración</p>
      ${error}
      <form action="/fs2026admin" method="post">
        <label>Contraseña</label>
        <input type="password" name="pass" placeholder="••••••••" autofocus>
        <button type="submit">Ingresar</button>
      </form>
    </div></body></html>
  `);
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

    const totalVendido = rows.reduce((s, r) => s + parseFloat(r.total), 0);
    const exitosos = rows.filter(r => r.estado === 'exitoso').length;
    const entregados = rows.filter(r => r.entregado == 1).length;

    const qStr = (extra='') => {
      const p = new URLSearchParams({ q: busqueda, estado: filtroEstado, fecha: filtroFecha, entregado: filtroEntregado, ...extra });
      return p.toString();
    };

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Pedidos — Foco Salvaje</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:'DM Sans',sans-serif;background:#F4EFE6;margin:0;padding:16px}
        .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;gap:12px;flex-wrap:wrap}
        h1{font-family:serif;color:#04342C;margin:0;font-size:20px}
        .logout{background:transparent;border:1px solid rgba(4,52,44,0.2);color:#04342C;padding:7px 14px;border-radius:4px;font-size:13px;text-decoration:none}
        .stats{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
        .stat{background:white;padding:14px 20px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06);flex:1;min-width:120px}
        .stat-num{font-size:24px;font-weight:700;color:#04342C}
        .stat-label{font-size:11px;color:#9C9C94;margin-top:3px}
        .filters{background:white;padding:16px;border-radius:8px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
        .filters form{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
        .fg{display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px}
        .fg label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9C9C94}
        .fg input,.fg select{padding:8px 10px;border:1px solid rgba(4,52,44,0.12);border-radius:4px;font-size:13px;font-family:inherit;outline:none;width:100%}
        .fg input:focus,.fg select:focus{border-color:#1D9E75}
        .btn-filter{background:#04342C;color:white;border:none;padding:8px 18px;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;white-space:nowrap}
        .btn-clear{background:transparent;color:#9C9C94;border:1px solid rgba(4,52,44,0.12);padding:8px 14px;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;text-decoration:none;white-space:nowrap}
        .results{font-size:13px;color:#9C9C94;margin-bottom:12px}
        .table-wrap{overflow-x:auto;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
        table{width:100%;border-collapse:collapse;background:white;min-width:500px}
        th{background:#04342C;color:white;padding:11px 14px;text-align:left;font-size:12px;white-space:nowrap}
        td{padding:11px 14px;border-bottom:1px solid #f0ece4;font-size:13px;vertical-align:middle}
        tr:last-child td{border-bottom:none}
        tr:hover td{background:#fafaf8}
        .badge{padding:3px 9px;border-radius:20px;font-size:11px;font-weight:500}
        .pendiente{background:#fff3cd;color:#856404}
        .exitoso{background:#d1e7dd;color:#0f5132}
        .fallido{background:#f8d7da;color:#842029}
        .btn-entregar{border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:500;transition:all 0.2s}
        .btn-entregar.no{background:#f0ece4;color:#5C5C58}
        .btn-entregar.no:hover{background:#04342C;color:white}
        .btn-entregar.si{background:#d1e7dd;color:#0f5132}
        .btn-entregar.si:hover{background:#f8d7da;color:#842029}
        .pagination{display:flex;gap:8px;margin-top:16px;justify-content:center;flex-wrap:wrap}
        .page-btn{padding:7px 14px;border-radius:4px;text-decoration:none;font-size:13px;border:1px solid rgba(4,52,44,0.15);color:#04342C;background:white}
        .page-btn.active{background:#04342C;color:white;border-color:#04342C}
        .page-btn:hover:not(.active){background:#f0ece4}
        .empty{text-align:center;padding:48px;color:#9C9C94;background:white;border-radius:8px}
        @media(max-width:600px){
          .stat-num{font-size:20px}
          th,td{padding:9px 10px;font-size:12px}
        }
      </style>
    </head>
    <body>
      <div class="top">
        <h1>📋 Pedidos — Foco Salvaje</h1>
        <a class="logout" href="/fs2026logout">Cerrar sesión</a>
      </div>

      <div class="stats">
        <div class="stat"><div class="stat-num">${rows.length}</div><div class="stat-label">Total pedidos</div></div>
        <div class="stat"><div class="stat-num">${exitosos}</div><div class="stat-label">Pagados</div></div>
        <div class="stat"><div class="stat-num">${entregados}</div><div class="stat-label">Entregados</div></div>
        <div class="stat"><div class="stat-num">$ ${totalVendido.toLocaleString('es-AR')}</div><div class="stat-label">Total vendido</div></div>
      </div>

      <div class="filters">
        <form method="get" action="/fs2026pedidos">
          <div class="fg">
            <label>Buscar</label>
            <input type="text" name="q" value="${busqueda}" placeholder="Nombre o email...">
          </div>
          <div class="fg">
            <label>Estado</label>
            <select name="estado">
              <option value="">Todos</option>
              <option value="pendiente" ${filtroEstado==='pendiente'?'selected':''}>Pendiente</option>
              <option value="exitoso" ${filtroEstado==='exitoso'?'selected':''}>Exitoso</option>
              <option value="fallido" ${filtroEstado==='fallido'?'selected':''}>Fallido</option>
            </select>
          </div>
          <div class="fg">
            <label>Entregado</label>
            <select name="entregado">
              <option value="">Todos</option>
              <option value="0" ${filtroEntregado==='0'?'selected':''}>No entregado</option>
              <option value="1" ${filtroEntregado==='1'?'selected':''}>Entregado</option>
            </select>
          </div>
          <div class="fg">
            <label>Fecha</label>
            <input type="date" name="fecha" value="${filtroFecha}">
          </div>
          <button class="btn-filter" type="submit">Filtrar</button>
          <a class="btn-clear" href="/fs2026pedidos">Limpiar</a>
        </form>
      </div>

      <div class="results">Mostrando ${paginated.length} de ${total} pedidos</div>

      ${paginated.length === 0 ? '<div class="empty">No hay pedidos con esos filtros</div>' : `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>Email</th>
              <th>Fotos</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Entregado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            ${paginated.map(r => `
            <tr>
              <td>${r.id}</td>
              <td>${r.nombre}</td>
              <td>${r.email}</td>
              <td>${r.fotos}</td>
              <td>$ ${parseFloat(r.total).toLocaleString('es-AR')}</td>
              <td><span class="badge ${r.estado}">${r.estado}</span></td>
              <td>
                <button class="btn-entregar ${r.entregado ? 'si' : 'no'}" onclick="toggleEntregar(${r.id}, this)">
                  ${r.entregado ? '✓ Entregado' : 'Entregar'}
                </button>
              </td>
              <td>${new Date(r.fecha).toLocaleString('es-AR')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      ${totalPages > 1 ? `
      <div class="pagination">
        ${page > 1 ? `<a class="page-btn" href="/fs2026pedidos?${qStr({page: page-1})}">← Anterior</a>` : ''}
        ${Array.from({length: totalPages}, (_, i) => i+1).map(p => `
          <a class="page-btn ${p===page?'active':''}" href="/fs2026pedidos?${qStr({page: p})}">${p}</a>
        `).join('')}
        ${page < totalPages ? `<a class="page-btn" href="/fs2026pedidos?${qStr({page: page+1})}">Siguiente →</a>` : ''}
      </div>` : ''}
      `}

      <script>
        async function toggleEntregar(id, btn) {
          const res = await fetch('/fs2026entregar/' + id, { method: 'POST' });
          const data = await res.json();
          if (data.entregado) {
            btn.textContent = '✓ Entregado';
            btn.className = 'btn-entregar si';
          } else {
            btn.textContent = 'Entregar';
            btn.className = 'btn-entregar no';
          }
        }
      </script>
    </body>
    </html>`);
  } catch (err) {
    res.status(500).send('Error conectando a la base de datos');
  }
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
  console.log(`✓ URL pública: ${BASE_URL}`);
  console.log(`✓ Panel admin: ${BASE_URL}/fs2026admin`);
});
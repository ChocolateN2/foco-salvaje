const pages=['inicio','galeria','contacto'];
let current='inicio';

function goTo(name){
  document.getElementById('page-'+current).classList.remove('active');
  document.getElementById('nav-'+current)&&document.getElementById('nav-'+current).classList.remove('active');
  current=name;
  document.getElementById('page-'+current).classList.add('active');
  document.getElementById('nav-'+current)&&document.getElementById('nav-'+current).classList.add('active');
  document.getElementById('footerBar').classList.toggle('show',name==='contacto');
  window.scrollTo(0,0);
}
goTo('inicio');

function toggleMobileNav(){document.getElementById('navMobile').classList.toggle('open');}

let photos=[];
let lbList=[],lbCurrent=0,cart=[];

function cam(w){return `<svg fill="none" stroke="white" stroke-width="1" viewBox="0 0 24 24" width="${w}" height="${w}"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`;}

const CAT_LABELS = {
  accion: 'Acción',
  retrato: 'Retrato',
  paisaje: 'Paisaje & Naturaleza',
  campeonato: 'Campeonato de Pesca'
};

function catLabel(cat){
  return CAT_LABELS[cat] || (cat.charAt(0).toUpperCase()+cat.slice(1));
}

function renderFilters(){
  const cats = [...new Set(photos.map(p=>p.cat))]
    .sort((a,b)=>catLabel(a).localeCompare(catLabel(b),'es'));
  const bar = document.querySelector('.filter-bar');
  bar.innerHTML = `<button class="fbtn active" onclick="filterPhotos('todas',this)">Todas</button>`
    + cats.map(c=>`<button class="fbtn" onclick="filterPhotos('${c}',this)">${catLabel(c)}</button>`).join('');
}

async function loadPhotos(){
  try {
    const res = await fetch('/api/fotos');
    const data = await res.json();
    photos = data.map(f => ({
      id: f.id,
      name: f.nombre,
      cat: f.categoria,
      price: parseFloat(f.precio),
      img: f.url_galeria,
      url_descarga: f.url_descarga,
    }));
    lbList = [...photos];
    renderFilters();
    renderGrid(photos);
  } catch(e) {
    document.getElementById('galleryGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:#9C9C94">No se pudieron cargar las fotos</div>';
  }
}
loadPhotos();

function renderGrid(list){
  if(list.length === 0) {
    document.getElementById('galleryGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:#9C9C94">No hay fotos disponibles todavía</div>';
    return;
  }
  document.getElementById('galleryGrid').innerHTML=list.map(p=>`
    <div class="photo-card">
      <div class="photo-thumb-wrap" onclick="openLB(${p.id})" style="cursor:pointer">
        <img src="${p.img}" alt="${p.name}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
        <div class="photo-num-badge">#${String(p.id).padStart(3,'0')}</div>
      </div>
      <div class="photo-info">
        <div class="photo-name">${p.name}</div>
        <div class="photo-bottom">
          <div>
            <span class="photo-cat-badge ${p.cat}">${catLabel(p.cat)}</span>
            <div class="photo-price-tag">$ ${p.price.toLocaleString('es-AR')}</div>
          </div>
          <button class="add-cart-btn" onclick="addPhoto(${p.id})">+ Agregar</button>
        </div>
      </div>
    </div>`).join('');
}

function filterPhotos(cat,btn){
  document.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  lbList=cat==='todas'?[...photos]:photos.filter(p=>p.cat===cat);
  renderGrid(lbList);
}

function openLB(id){const idx=lbList.findIndex(p=>p.id===id);if(idx===-1)return;lbCurrent=idx;updateLB();document.getElementById('lightbox').classList.add('open');}
function closeLB(){document.getElementById('lightbox').classList.remove('open');}
function navLB(dir){lbCurrent=(lbCurrent+dir+lbList.length)%lbList.length;updateLB();}
function updateLB(){
  const p=lbList[lbCurrent];
  document.getElementById('lbImg').className='lb-img';
  document.getElementById('lbImg').innerHTML=`<img src="${p.img}" alt="${p.name}" style="width:100%;height:100%;object-fit:contain;border-radius:4px;">`;
  document.getElementById('lbNum').textContent='#'+String(p.id).padStart(3,'0')+' — '+(lbCurrent+1)+' de '+lbList.length;
  document.getElementById('lbName').textContent=p.name;
  document.getElementById('lbCat').textContent=catLabel(p.cat);
  document.getElementById('lbPrice').textContent='$ '+p.price.toLocaleString('es-AR');
  document.getElementById('lbAdd').onclick=()=>addPhoto(p.id);
}
document.addEventListener('keydown',e=>{
  if(!document.getElementById('lightbox').classList.contains('open'))return;
  if(e.key==='ArrowRight')navLB(1);if(e.key==='ArrowLeft')navLB(-1);if(e.key==='Escape')closeLB();
});

function addPhoto(id){
  const p=photos.find(x=>x.id===id);if(!p)return;
  if(cart.find(i=>i.id==='photo_'+id)){showToast('Ya está en el carrito');return;}
  cart.push({id:'photo_'+id,name:p.name,price:p.price,img:p.img,url_descarga:p.url_descarga});
  updateCartUI();showToast('"'+p.name+'" agregada');
}
function removeItem(id){cart=cart.filter(i=>i.id!==id);updateCartUI();}

function updateCartUI(){
  const count=cart.length;
  const total=cart.reduce((s,i)=>s+i.price,0);

  document.getElementById('cartCount').textContent=count;
  document.getElementById('cartTotal').textContent='$ '+total.toLocaleString('es-AR');
  document.getElementById('cartSubtotal').textContent='$ '+total.toLocaleString('es-AR');
  document.getElementById('cartSubtitle').textContent=count===0?'0 fotos seleccionadas':count===1?'1 foto seleccionada':count+' fotos seleccionadas';

  const body=document.getElementById('cartBody');
  const foot=document.getElementById('cartFoot');

  if(count===0){
    foot.style.display='none';
    body.innerHTML=`
      <div class="cart-empty-state">
        <div class="cart-empty-icon">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        </div>
        <div class="cart-empty-title">Tu carrito está vacío</div>
        <div class="cart-empty-desc">Agregá fotos desde la galería</div>
        <button class="cart-empty-btn" onclick="toggleCart();goTo('galeria')">Ver galería</button>
      </div>`;
  } else {
    foot.style.display='block';
    body.innerHTML=cart.map(item=>`
      <div class="cart-item">
        <div class="ci-thumb" style="overflow:hidden;border-radius:6px;background:#e5e7eb">
          ${item.img?`<img src="${item.img}" style="width:100%;height:100%;object-fit:cover;">`:cam(20)}
        </div>
        <div class="ci-info">
          <div class="ci-name">${item.name}</div>
          <div class="ci-price">$ ${item.price.toLocaleString('es-AR')}</div>
        </div>
        <button class="ci-rm" onclick="removeItem('${item.id}')">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');
  }
}

async function checkout(){
  if(cart.length===0)return;

  const name=document.getElementById('buyerName').value.trim();
  const email=document.getElementById('buyerEmail').value.trim();

  if(!name){
    document.getElementById('buyerName').focus();
    document.getElementById('buyerName').style.borderColor='#c0392b';
    showToast('Ingresá tu nombre para continuar');
    return;
  }
  if(!email||!email.includes('@')){
    document.getElementById('buyerEmail').focus();
    document.getElementById('buyerEmail').style.borderColor='#c0392b';
    showToast('Ingresá un email válido para continuar');
    return;
  }

  document.getElementById('buyerName').style.borderColor='';
  document.getElementById('buyerEmail').style.borderColor='';

  const btn=document.getElementById('checkoutBtn');
  btn.innerHTML='<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Procesando...';
  btn.disabled=true;

  try{
    const res=await fetch('/crear-preferencia',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({items:cart, buyer:{name,email}})
    });
    const data=await res.json();
    if(data.init_point){
      window.location.href=data.init_point;
    } else {
      alert('Error al procesar el pago');
      btn.innerHTML='<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Pagar con MercadoPago';
      btn.disabled=false;
    }
  } catch(e){
    alert('No se pudo conectar. Intentá de nuevo.');
    btn.innerHTML='<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Pagar con MercadoPago';
    btn.disabled=false;
  }
}

function toggleCart(){document.getElementById('cartModal').classList.toggle('open');}
function showToast(msg){const t=document.getElementById('toast');document.getElementById('toastMsg').textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800);}
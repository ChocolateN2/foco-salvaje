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

const photos=[
  {id:1,name:'Juan Pérez - Lanzamiento',cat:'accion',price:1500,img:'assets/pez1.jpg'},
  {id:2,name:'Captura del día',cat:'accion',price:1500,bg:'g2'},
  {id:3,name:'Orilla al amanecer',cat:'paisaje',price:1500,bg:'g3'},
  {id:4,name:'El campeón',cat:'retrato',price:1500,bg:'g4'},
  {id:5,name:'Aguas tranquilas',cat:'paisaje',price:1500,bg:'g5'},
  {id:6,name:'Tarde de pesca',cat:'retrato',price:1500,bg:'g6'},
  {id:7,name:'La pieza mayor',cat:'accion',price:1500,bg:'g7'},
  {id:8,name:'Entre nieblas',cat:'paisaje',price:1500,bg:'g8'},
];
let lbList=[...photos],lbCurrent=0,cart=[];

function cam(w){return `<svg fill="none" stroke="white" stroke-width="1" viewBox="0 0 24 24" width="${w}" height="${w}"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`;}

function renderGrid(list){
  document.getElementById('galleryGrid').innerHTML=list.map(p=>`
    <div class="photo-card">
      <div class="photo-thumb-wrap">
        ${p.img
          ? `<img src="${p.img}" alt="${p.name}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">`
          : `<div class="photo-bg ${p.bg}"><div style="opacity:.15">${cam(36)}</div></div>`
        }
        <div class="photo-num-badge">#${String(p.id).padStart(3,'00')}</div>
        <button class="photo-zoom-btn" onclick="event.stopPropagation();openLB(${p.id})">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </button>
      </div>
      <div class="photo-info">
        <div class="photo-name">${p.name}</div>
        <div class="photo-cat">${p.cat}</div>
        <div class="photo-bottom">
          <div class="photo-price-tag">$ ${p.price.toLocaleString('es-AR')}</div>
          <button class="add-cart-btn" onclick="addPhoto(${p.id})">+ Agregar</button>
        </div>
      </div>
    </div>`).join('');
}
renderGrid(photos);

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
  document.getElementById('lbImg').className='lb-img '+(p.bg||'');
  document.getElementById('lbImg').innerHTML=p.img
    ? `<img src="${p.img}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;">`
    : `<div style="opacity:.15">${cam(80)}</div>`;
  document.getElementById('lbNum').textContent='#'+String(p.id).padStart(3,'0')+' — '+(lbCurrent+1)+' de '+lbList.length;
  document.getElementById('lbName').textContent=p.name;
  document.getElementById('lbCat').textContent=p.cat.charAt(0).toUpperCase()+p.cat.slice(1);
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
  cart.push({id:'photo_'+id,name:p.name,price:p.price,bg:p.bg||'g1',img:p.img||null});
  updateCartUI();showToast('"'+p.name+'" agregada');
}
function addPack(name,price){
  const pid='pack_'+name;
  if(cart.find(i=>i.id===pid)){showToast('Ya está en el carrito');return;}
  cart.push({id:pid,name,price,bg:'g1'});updateCartUI();showToast(name+' agregado');
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
        <div class="ci-thumb ${item.bg||'g1'}" style="overflow:hidden;border-radius:6px">
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
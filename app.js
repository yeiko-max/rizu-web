// Rizú en la web: lo mismo que la app para clientes (buscar, reservar, pagar, mis reservas, membresías).
// Usa la misma base de datos y las mismas funciones del servidor que la app del móvil.
(function () {
  'use strict';

  // ---------- Configuración (claves públicas: se pueden ver en el navegador sin problema) ----------
  var SUPABASE_URL = 'https://jljuuytjivrxhjugxjaz.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_O9HxRqA9a-VTyEogOj6cgg__E0dhlQO';
  var STRIPE_PK = 'pk_test_51UbPmUHr7XUHZJnVV67OQVzsomsRdNOvKl3PTAjUldrOdt28Y60xSxOJNapoIeKk4q7I4U05cCs9U2BAyxpjd6YI00qgOgLagp'; // clave publicable de Stripe (pk_test_... o pk_live_...). Vacía = solo efectivo.
  var URL_APP = 'https://yeiko-max.github.io/rizu-web/app.html';
  var DIAS = 7, PASO_MIN = 30, DESPLAZAMIENTO = 200;
  var REGLAS_BASE = { club: false, cancel_horas: 24, dias_retoque: 7 };

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
  var stripe = STRIPE_PK && window.Stripe ? window.Stripe(STRIPE_PK, { locale: 'es' }) : null;
  var vista = document.getElementById('vista');
  var menu = document.getElementById('menu');
  var estado = { sesion: null, perfil: null, reglas: REGLAS_BASE, pos: null, categoria: null, cats: [] };

  // ---------- Utilidades ----------
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function euros(c) { return (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }); }
  function fecha(d) { return new Date(d).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function foto(ruta) { return SUPABASE_URL + '/storage/v1/object/public/portfolio/' + encodeURI(ruta); }
  function inicial(n) { return esc((n || '?').trim().charAt(0).toUpperCase()); }
  function pintar(html) { vista.innerHTML = '<div class="contenedor">' + html + '</div>'; vista.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  function $(sel) { return vista.querySelector(sel); }
  function aviso(el, tipo, texto) { if (!el) return; el.className = 'aviso ' + tipo; el.textContent = texto; }
  var EMOJI = { peluqueria: '✂️', unas: '💅', barberia: '🧔', maquillaje: '💄', depilacion: '🌿', 'cejas-pestanas': '👁️' };
  var TEXTO_ESTADO = { pendiente: 'Pendiente', aceptada: 'Confirmada', en_camino: 'En camino', rechazada: 'Rechazada', cancelada: 'Cancelada', en_curso: 'En curso', completada: 'Completada', disputa: 'En revisión' };
  var COLOR_ESTADO = { pendiente: '', aceptada: 'verde', en_camino: 'verde', en_curso: 'verde', completada: '', rechazada: 'roja', cancelada: 'roja' };

  async function llamarFuncion(nombre, cuerpo) {
    var token = estado.sesion && estado.sesion.access_token;
    var r = await fetch(SUPABASE_URL + '/functions/v1/' + nombre, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + (token || SUPABASE_KEY) },
      body: JSON.stringify(cuerpo || {})
    });
    var datos = await r.json().catch(function () { return {}; });
    if (!r.ok || datos.error) throw new Error(datos.error || 'Error del servidor (' + r.status + ')');
    return datos;
  }

  // ---------- Sesión ----------
  async function cargarUsuario() {
    var s = (await sb.auth.getSession()).data.session;
    estado.sesion = s;
    if (!s) { estado.perfil = null; estado.reglas = REGLAS_BASE; return; }
    var res = await Promise.all([sb.rpc('mi_perfil'), sb.rpc('mis_reglas')]);
    var p = res[0].data; estado.perfil = Array.isArray(p) ? p[0] : p;
    var rg = res[1].data; estado.reglas = (Array.isArray(rg) ? rg[0] : rg) || REGLAS_BASE;
  }

  function pintarMenu(ruta) {
    if (!estado.sesion) { menu.innerHTML = '<a href="#/entrar">Entrar</a><a class="boton peq" href="#/registro">Crear cuenta</a>'; return; }
    var enlaces = [['#/', 'Buscar'], ['#/reservas', 'Mis reservas'], ['#/cuenta', 'Mi cuenta']];
    menu.innerHTML = enlaces.map(function (e) {
      var actual = (e[0] === '#/' && (ruta === '' || ruta.indexOf('pro/') === 0 || ruta.indexOf('reservar/') === 0)) || ('#/' + ruta) === e[0];
      return '<a href="' + e[0] + '"' + (actual ? ' aria-current="page"' : '') + '>' + e[1] + '</a>';
    }).join('');
  }

  // ---------- Router ----------
  async function navegar() {
    var ruta = location.hash.replace(/^#\/?/, '');
    var partes = ruta.split('/');
    pintarMenu(ruta);
    var publicas = ['entrar', 'registro'];
    if (!estado.sesion && publicas.indexOf(partes[0]) < 0) { return vistaEntrar('Entra o crea tu cuenta para reservar.'); }
    try {
      if (partes[0] === 'entrar') return vistaEntrar();
      if (partes[0] === 'registro') return vistaRegistro();
      if (partes[0] === 'pro' && partes[1]) return await vistaProfesional(partes[1]);
      if (partes[0] === 'reservar' && partes[1]) return await vistaReservar(partes[1]);
      if (partes[0] === 'reservas') return await vistaReservas();
      if (partes[0] === 'cuenta') return await vistaCuenta();
      return await vistaInicio();
    } catch (e) {
      pintar('<div class="vacio">Algo ha fallado: ' + esc(e.message) + '<br><br><a class="boton" href="#/">Volver al inicio</a></div>');
    }
  }

  // ---------- Entrar / registrarse ----------
  function vistaEntrar(mensaje) {
    pintar('<div class="cuenta-caja tarjeta">' +
      '<h1 style="margin-top:0">Entrar</h1>' + (mensaje ? '<p class="nota-peq">' + esc(mensaje) + '</p>' : '') +
      '<form class="form" id="f-entrar">' +
      '<div class="campo"><label for="e-email">Email</label><input id="e-email" type="email" required autocomplete="email"></div>' +
      '<div class="campo"><label for="e-clave">Contraseña</label><input id="e-clave" type="password" required autocomplete="current-password" minlength="6"></div>' +
      '<button class="boton" type="submit">Entrar</button><div class="aviso" role="status" aria-live="polite"></div></form>' +
      '<p class="nota-peq" style="margin-top:14px">¿No tienes cuenta? <a href="#/registro">Créala gratis</a> · <button class="enlace-btn" id="olvido" type="button">He olvidado mi contraseña</button></p></div>');
    $('#f-entrar').addEventListener('submit', async function (e) {
      e.preventDefault();
      var av = $('.aviso'), b = e.target.querySelector('button'); b.disabled = true;
      var r = await sb.auth.signInWithPassword({ email: $('#e-email').value.trim().toLowerCase(), password: $('#e-clave').value });
      b.disabled = false;
      if (r.error) return aviso(av, 'error', r.error.message.indexOf('confirm') >= 0 ? 'Confirma primero tu email (revisa tu bandeja de entrada).' : 'Email o contraseña incorrectos.');
      await cargarUsuario(); location.hash = '#/';
    });
    $('#olvido').addEventListener('click', async function () {
      var email = $('#e-email').value.trim().toLowerCase();
      if (!email) return aviso($('.aviso'), 'error', 'Escribe tu email arriba y pulsa de nuevo.');
      await sb.auth.resetPasswordForEmail(email, { redirectTo: URL_APP });
      aviso($('.aviso'), 'ok', 'Si existe una cuenta con ese email, te hemos enviado un enlace para cambiar la contraseña.');
    });
  }

  function vistaRegistro() {
    pintar('<div class="cuenta-caja tarjeta">' +
      '<h1 style="margin-top:0">Crear cuenta</h1><p class="nota-peq">La misma cuenta sirve en la web y en la app.</p>' +
      '<form class="form" id="f-reg">' +
      '<div class="campo"><label for="r-nombre">Nombre</label><input id="r-nombre" required maxlength="80" autocomplete="name"></div>' +
      '<div class="campo"><label for="r-email">Email</label><input id="r-email" type="email" required autocomplete="email"></div>' +
      '<div class="campo"><label for="r-clave">Contraseña (mínimo 6 caracteres)</label><input id="r-clave" type="password" required minlength="6" autocomplete="new-password"></div>' +
      '<label class="check"><input type="checkbox" required><span>Acepto los <a href="terminos.html">términos</a> y la <a href="privacidad.html">política de privacidad</a>. Soy mayor de 18 años.</span></label>' +
      '<button class="boton" type="submit">Crear cuenta</button><div class="aviso" role="status" aria-live="polite"></div></form>' +
      '<p class="nota-peq" style="margin-top:14px">¿Ya tienes cuenta? <a href="#/entrar">Entra</a></p></div>');
    $('#f-reg').addEventListener('submit', async function (e) {
      e.preventDefault();
      var av = $('.aviso'), b = e.target.querySelector('button'); b.disabled = true;
      var r = await sb.auth.signUp({ email: $('#r-email').value.trim().toLowerCase(), password: $('#r-clave').value,
        options: { data: { nombre: $('#r-nombre').value.trim() }, emailRedirectTo: URL_APP } });
      b.disabled = false;
      if (r.error) return aviso(av, 'error', r.error.message);
      if (r.data.session) { await cargarUsuario(); location.hash = '#/'; return; }
      aviso(av, 'ok', '¡Cuenta creada! Te hemos enviado un email: pulsa el enlace para confirmarla y después entra.');
    });
  }

  // ---------- Inicio: buscar profesionales ----------
  async function vistaInicio() {
    if (!estado.cats.length) estado.cats = (await sb.from('categorias').select('*').order('orden')).data || [];
    var nombre = estado.perfil && estado.perfil.nombre ? estado.perfil.nombre.split(' ')[0] : '';
    pintar('<section class="hero-app"><h1>Hola' + (nombre ? ', ' + esc(nombre) : '') + ' 👋</h1><p>¿Qué te apetece hoy? Te mostramos profesionales que van a tu zona.</p>' +
      '<form class="busca" id="f-zona"><label class="salto" for="zona">Tu dirección o barrio</label><input id="zona" placeholder="Tu dirección o barrio (p. ej. Chamberí, Madrid)" autocomplete="street-address">' +
      '<button class="boton" type="submit">Buscar</button><button class="boton secundario" type="button" id="gps" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.6)">📍 Usar mi ubicación</button></form></section>' +
      (estado.reglas.club ? '' : '<p class="nota-peq" style="margin:-8px 0 14px">💎 Con <a href="#/cuenta">Rizú Club</a> no pagas desplazamiento y tienes un 15 % de descuento.</p>') +
      '<div class="chips" role="group" aria-label="Categorías">' +
      '<button class="chip" data-cat="" aria-pressed="' + (!estado.categoria) + '">Todo</button>' +
      estado.cats.map(function (c) { return '<button class="chip" data-cat="' + esc(c.slug) + '" aria-pressed="' + (estado.categoria === c.slug) + '">' + (EMOJI[c.slug] || '') + ' ' + esc(c.nombre) + '</button>'; }).join('') +
      '</div><div id="resultados"></div>');
    vista.querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () { estado.categoria = b.dataset.cat || null; vista.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); buscar(); });
    });
    $('#f-zona').addEventListener('submit', async function (e) {
      e.preventDefault();
      var q = $('#zona').value.trim(); if (!q) return;
      $('#resultados').innerHTML = '<div class="cargando">Buscando la zona…</div>';
      var g = await geocodificar(q);
      if (!g) { $('#resultados').innerHTML = '<div class="vacio">No encontramos esa dirección. Prueba con calle y ciudad.</div>'; return; }
      estado.pos = g; buscar();
    });
    $('#gps').addEventListener('click', function () { usarGps(buscar); });
    if (estado.pos) buscar();
    else $('#resultados').innerHTML = '<div class="vacio">Escribe tu dirección o pulsa <b>Usar mi ubicación</b> para ver profesionales cerca de ti.</div>';
  }

  function usarGps(despues) {
    if (!navigator.geolocation) return alert('Tu navegador no permite la ubicación. Escribe tu dirección.');
    navigator.geolocation.getCurrentPosition(function (p) {
      estado.pos = { lat: p.coords.latitude, lng: p.coords.longitude }; despues();
    }, function () { alert('No hemos podido obtener tu ubicación. Escribe tu dirección.'); }, { enableHighAccuracy: false, timeout: 10000 });
  }

  async function geocodificar(texto) {
    try {
      var r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=es&accept-language=es&q=' + encodeURIComponent(texto));
      var d = await r.json();
      return d && d[0] ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) } : null;
    } catch (e) { return null; }
  }

  async function buscar() {
    var cont = $('#resultados'); if (!cont || !estado.pos) return;
    cont.innerHTML = '<div class="cargando">Buscando profesionales…</div>';
    var r = await sb.rpc('profesionales_cerca', { lat: estado.pos.lat, lng: estado.pos.lng, p_categoria: estado.categoria });
    if (r.error) { cont.innerHTML = '<div class="vacio">' + esc(r.error.message) + '</div>'; return; }
    var pros = r.data || [];
    if (!pros.length) { cont.innerHTML = '<div class="vacio">Aún no hay profesionales disponibles en tu zona para esta categoría. ¡Estamos sumando nuevos cada semana!</div>'; return; }
    cont.innerHTML = '<div class="lista-pros">' + pros.map(function (p) {
      return '<a class="pro" href="#/pro/' + esc(p.id) + '">' +
        '<div class="pro-foto" style="' + (p.foto_ruta ? 'background-image:url(\'' + esc(foto(p.foto_ruta)) + '\')' : '') + '"><div class="sobre-foto">' +
        (p.destacado ? '<span class="insignia oro">Pro+</span>' : '') + (p.acepta_efectivo ? '<span class="insignia verde">Efectivo</span>' : '') + '</div></div>' +
        '<div class="pro-cuerpo"><h3>' + esc(p.nombre) + (p.verificado ? ' <span title="Verificado" aria-label="Verificado">✔️</span>' : '') + '</h3>' +
        '<div class="meta">' + esc(p.especialidad || '') + '</div>' +
        '<div class="meta"><span class="estrella">★ ' + (p.num_valoraciones ? Number(p.nota).toFixed(1).replace('.', ',') : 'Nuevo') + '</span>' +
        (p.num_valoraciones ? '<span>(' + p.num_valoraciones + ')</span>' : '') + '<span>' + String(p.distancia_km).replace('.', ',') + ' km</span>' +
        '<span>desde <b>' + euros(p.precio_desde_cent) + '</b></span></div></div></a>';
    }).join('') + '</div>';
  }

  // ---------- Perfil del profesional ----------
  async function vistaProfesional(id) {
    pintar('<div class="cargando">Cargando…</div>');
    var r = await Promise.all([
      sb.from('perfiles').select('id, nombre, avatar_url').eq('id', id).single(),
      sb.from('profesionales').select('id, bio, barrio, verificado, nota, num_valoraciones, servicios_hechos, tasa_puntualidad, acepta_efectivo').eq('id', id).single(),
      sb.from('servicios').select('*').eq('profesional_id', id).eq('activo', true).order('precio_cent'),
      sb.from('valoraciones_publicas').select('*').eq('destinatario_id', id).eq('direccion', 'cliente_a_profesional').order('publicada_en', { ascending: false }).limit(10),
      sb.from('fotos_trabajo').select('id, ruta').eq('profesional_id', id).order('creada_en', { ascending: false }).limit(12),
      sb.rpc('es_pro_plus', { p_profesional: id })
    ]);
    var pf = r[0].data, pr = r[1].data, servicios = r[2].data || [], resenas = r[3].data || [], fotos = r[4].data || [], proPlus = !!r[5].data;
    if (!pf || !pr) return pintar('<div class="vacio">Este perfil no está disponible.</div>');
    var av = pf.avatar_url ? '<div class="avatar" style="background-image:url(\'' + esc(pf.avatar_url) + '\')" role="img" aria-label="' + esc(pf.nombre) + '"></div>' : '<div class="avatar" aria-hidden="true">' + inicial(pf.nombre) + '</div>';
    pintar('<a class="atras" href="#/">← Volver</a>' +
      '<div class="cab-pro">' + av + '<div><h1>' + esc(pf.nombre) + '</h1><div class="meta">' +
      (pr.verificado ? '<span class="insignia verde">✔ Verificada</span>' : '') + (proPlus ? '<span class="insignia oro">Pro+</span>' : '') +
      (pr.acepta_efectivo ? '<span class="insignia">Acepta efectivo</span>' : '') + (pr.barrio ? '<span>📍 ' + esc(pr.barrio) + '</span>' : '') + '</div></div></div>' +
      (pr.bio ? '<p>' + esc(pr.bio) + '</p>' : '') +
      '<div class="stats"><div class="stat"><b>★ ' + (pr.num_valoraciones ? Number(pr.nota).toFixed(1).replace('.', ',') : '—') + '</b><span>' + pr.num_valoraciones + ' valoraciones</span></div>' +
      '<div class="stat"><b>' + (pr.servicios_hechos || 0) + '</b><span>servicios hechos</span></div>' +
      '<div class="stat"><b>' + (pr.tasa_puntualidad != null ? Math.round(pr.tasa_puntualidad * 100) + ' %' : '—') + '</b><span>puntualidad</span></div></div>' +
      '<h2 class="seccion-t">Servicios</h2>' +
      (servicios.length ? servicios.map(function (s) {
        return '<div class="servicio"><div><h4>' + esc(s.nombre) + '</h4><div class="meta">' + s.duracion_min + ' min' + (s.descripcion ? ' · ' + esc(s.descripcion) : '') + '</div></div>' +
          '<div style="display:flex;gap:12px;align-items:center"><span class="precio-s">' + euros(s.precio_cent) + '</span><a class="boton peq" href="#/reservar/' + esc(s.id) + '">Reservar</a></div></div>';
      }).join('') : '<div class="vacio">Sin servicios disponibles ahora mismo.</div>') +
      (fotos.length ? '<h2 class="seccion-t">Trabajos</h2><div class="galeria">' + fotos.map(function (f) { return '<img src="' + esc(foto(f.ruta)) + '" alt="Trabajo de ' + esc(pf.nombre) + '" loading="lazy">'; }).join('') + '</div>' : '') +
      '<h2 class="seccion-t">Valoraciones</h2>' +
      (resenas.length ? resenas.map(function (v) {
        return '<div class="resena"><div class="meta"><b style="color:var(--texto)">' + esc((v.autor_nombre || '').split(' ')[0]) + '</b><span class="estrella">' + '★'.repeat(v.nota) + '</span><span>' + new Date(v.publicada_en).toLocaleDateString('es-ES') + '</span></div>' +
          (v.comentario ? '<p>' + esc(v.comentario) + '</p>' : '') + '</div>';
      }).join('') : '<div class="vacio">Todavía no tiene valoraciones publicadas.</div>'));
  }

  // ---------- Reservar ----------
  function aMinutos(hhmm) { var p = hhmm.split(':').map(Number); return p[0] * 60 + p[1]; }

  async function vistaReservar(servicioId) {
    pintar('<div class="cargando">Cargando…</div>');
    var s = (await sb.from('servicios').select('*').eq('id', servicioId).single()).data;
    if (!s) return pintar('<div class="vacio">Servicio no disponible.</div>');
    var desde = new Date(), hasta = new Date(Date.now() + DIAS * 864e5);
    var r = await Promise.all([
      sb.from('horarios').select('dia_semana, desde, hasta').eq('profesional_id', s.profesional_id),
      sb.rpc('huecos_ocupados', { p_profesional: s.profesional_id, p_desde: desde.toISOString(), p_hasta: hasta.toISOString() }),
      sb.rpc('acepta_efectivo_ahora', { p_profesional: s.profesional_id }),
      sb.rpc('acepta_tarjeta', { p_profesional: s.profesional_id }),
      sb.from('perfiles').select('nombre').eq('id', s.profesional_id).single()
    ]);
    var horarios = r[0].data || [], ocupados = r[1].data || [];
    var aceptaEfectivo = !!r[2].data, aceptaTarjeta = !!r[3].data && !!stripe;
    var nombrePro = r[4].data ? r[4].data.nombre.split(' ')[0] : 'la profesional';
    var club = !!estado.reglas.club;
    var precio = club ? Math.round(s.precio_cent * 0.85) : s.precio_cent;
    var desplaz = club ? 0 : DESPLAZAMIENTO;
    var total = precio + desplaz;
    var sel = { dia: 0, hora: null, metodo: aceptaTarjeta ? 'tarjeta' : (aceptaEfectivo ? 'efectivo' : null) };
    var dias = []; for (var i = 0; i < DIAS; i++) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); dias.push(d); }

    function huecos() {
      var base = dias[sel.dia], limite = Date.now() + 3600000, res = [];
      horarios.filter(function (h) { return h.dia_semana === base.getDay(); }).forEach(function (h) {
        for (var m = aMinutos(h.desde); m + s.duracion_min <= aMinutos(h.hasta); m += PASO_MIN) {
          var ini = new Date(base); ini.setMinutes(m);
          var fin = new Date(ini.getTime() + s.duracion_min * 60000);
          var choca = ocupados.some(function (o) { return ini < new Date(o.termina) && fin > new Date(o.empieza); });
          if (ini.getTime() >= limite && !choca) res.push(ini);
        }
      });
      return res.sort(function (a, b) { return a - b; });
    }

    pintar('<a class="atras" href="#/pro/' + esc(s.profesional_id) + '">← Volver</a>' +
      '<h1 style="margin:0 0 4px">Reservar</h1><p class="meta" style="margin:0 0 18px">' + esc(s.nombre) + ' con ' + esc(nombrePro) + ' · ' + s.duracion_min + ' min</p>' +
      '<h2 class="seccion-t">Día</h2><div class="dias" role="group" aria-label="Día">' + dias.map(function (d, i) {
        return '<button class="dia" type="button" data-i="' + i + '" aria-pressed="' + (i === 0) + '"><small>' + d.toLocaleDateString('es-ES', { weekday: 'short' }) + '</small><b>' + d.getDate() + '</b></button>';
      }).join('') + '</div>' +
      '<h2 class="seccion-t">Hora</h2><div id="horas"></div>' +
      '<h2 class="seccion-t">¿Dónde?</h2><div class="form">' +
      '<div class="campo"><label for="dir">Dirección completa</label><input id="dir" required placeholder="C/ Santa Engracia 54, 3ºB, Madrid" autocomplete="street-address"></div>' +
      '<div class="campo"><label for="notas">Notas para la profesional (opcional)</label><textarea id="notas" rows="2" maxlength="500" placeholder="Portero automático, mascotas, alergias…"></textarea></div></div>' +
      '<h2 class="seccion-t">Cómo pagas</h2><div class="metodos" role="radiogroup" aria-label="Forma de pago">' +
      '<button class="metodo" type="button" data-m="tarjeta" role="radio" aria-pressed="' + (sel.metodo === 'tarjeta') + '" aria-checked="' + (sel.metodo === 'tarjeta') + '"' + (aceptaTarjeta ? '' : ' disabled') + '><b>💳 Tarjeta</b><small>' + (aceptaTarjeta ? 'Solo se retiene; se cobra al terminar' : (stripe ? 'No disponible con esta profesional' : 'Muy pronto en la web')) + '</small></button>' +
      '<button class="metodo" type="button" data-m="efectivo" role="radio" aria-pressed="' + (sel.metodo === 'efectivo') + '" aria-checked="' + (sel.metodo === 'efectivo') + '"' + (aceptaEfectivo ? '' : ' disabled') + '><b>💶 Efectivo</b><small>' + (aceptaEfectivo ? 'En mano al terminar' : 'No disponible con esta profesional') + '</small></button></div>' +
      '<div class="resumen"><div class="fila"><span>Servicio</span><span>' + euros(s.precio_cent) + '</span></div>' +
      (club ? '<div class="fila"><span>Descuento Rizú Club (15 %)</span><span>−' + euros(s.precio_cent - precio) + '</span></div>' : '') +
      '<div class="fila"><span>Desplazamiento</span><span>' + (club ? 'Gratis con Club' : euros(DESPLAZAMIENTO)) + '</span></div>' +
      '<div class="fila total"><span>Total</span><span>' + euros(total) + '</span></div>' +
      '<p class="nota-peq">Cancelación gratis hasta ' + estado.reglas.cancel_horas + ' h antes. <a href="reembolsos.html" target="_blank">Política de cancelaciones</a>.</p></div>' +
      '<button class="boton" id="confirmar" type="button" style="width:100%" disabled>Elige una hora</button><div class="aviso" id="av-reserva" role="status" aria-live="polite" style="margin-top:12px"></div>');

    function pintarHoras() {
      var hs = huecos(), cont = $('#horas');
      if (!hs.length) { cont.innerHTML = '<div class="vacio">No hay huecos libres este día. Prueba otro.</div>'; return; }
      cont.innerHTML = '<div class="horas" role="group" aria-label="Hora">' + hs.map(function (h) {
        var activo = sel.hora && sel.hora.getTime() === h.getTime();
        return '<button class="hora" type="button" data-t="' + h.getTime() + '" aria-pressed="' + !!activo + '">' + h.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + '</button>';
      }).join('') + '</div>';
      cont.querySelectorAll('.hora').forEach(function (b) { b.addEventListener('click', function () { sel.hora = new Date(Number(b.dataset.t)); pintarHoras(); actualizarBoton(); }); });
    }
    function actualizarBoton() {
      var b = $('#confirmar');
      if (!sel.metodo) { b.disabled = true; b.textContent = 'Esta profesional no puede recibir reservas ahora'; return; }
      b.disabled = !sel.hora;
      b.textContent = !sel.hora ? 'Elige una hora' : sel.metodo === 'efectivo' ? 'Reservar · ' + euros(total) + ' en efectivo' : 'Continuar al pago · ' + euros(total);
    }
    vista.querySelectorAll('.dia').forEach(function (b) {
      b.addEventListener('click', function () { sel.dia = Number(b.dataset.i); sel.hora = null; vista.querySelectorAll('.dia').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); pintarHoras(); actualizarBoton(); });
    });
    vista.querySelectorAll('.metodo').forEach(function (b) {
      b.addEventListener('click', function () { if (b.disabled) return; sel.metodo = b.dataset.m; vista.querySelectorAll('.metodo').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); x.setAttribute('aria-checked', String(x === b)); }); actualizarBoton(); });
    });
    pintarHoras(); actualizarBoton();

    $('#confirmar').addEventListener('click', async function () {
      var av = $('#av-reserva'), boton = this, direccion = $('#dir').value.trim();
      if (direccion.length < 6) return aviso(av, 'error', 'Escribe tu dirección completa: calle, número y piso.');
      boton.disabled = true; var texto = boton.textContent; boton.textContent = 'Reservando…';
      var reservaId = null;
      try {
        var g = await geocodificar(direccion);
        if (!g) throw new Error('No encontramos esa dirección. Revisa calle, número y ciudad.');
        var res = await sb.rpc('crear_reserva', { p_servicio: s.id, p_empieza: sel.hora.toISOString(), p_direccion: direccion,
          p_lat: g.lat, p_lng: g.lng, p_notas: $('#notas').value.trim(), p_metodo: sel.metodo });
        if (res.error) throw new Error(res.error.message.indexOf('sin_solapes') >= 0 ? 'Esa hora acaba de ocuparse, elige otra.' : res.error.message);
        reservaId = res.data;
        if (sel.metodo === 'efectivo') {
          reservaId = null;
          alert('¡Solicitud enviada! Pagarás ' + euros(total) + ' en efectivo al terminar. Te avisaremos cuando ' + nombrePro + ' confirme.');
          location.hash = '#/reservas'; return;
        }
        var pago = await llamarFuncion('crear-pago', { reserva_id: reservaId });
        var ok = await hojaDePago(pago.client_secret, 'Autorizar ' + euros(total), 'Solo retenemos el importe en tu tarjeta. Se cobra cuando termine el servicio.', 'Autorizar pago', false);
        if (!ok) throw new Error('CANCELADO');
        reservaId = null;
        alert('¡Solicitud enviada! Te avisaremos cuando ' + nombrePro + ' confirme. No se cobra nada hasta que termine el servicio.');
        location.hash = '#/reservas';
      } catch (e) {
        if (reservaId) {
          await sb.rpc('cambiar_estado_reserva', { p_reserva: reservaId, p_estado: 'cancelada' });
          llamarFuncion('cancelar-pago', { reserva_id: reservaId }).catch(function () {});
        }
        if (e.message !== 'CANCELADO') aviso(av, 'error', e.message); else aviso(av, 'error', 'Pago cancelado: no se ha hecho la reserva.');
        boton.disabled = false; boton.textContent = texto;
      }
    });
  }

  /** Ventana con el formulario de pago seguro de Stripe (Payment Element). Devuelve true si se completa. */
  function hojaDePago(clientSecret, titulo, texto, textoBoton, esSuscripcion) {
    return new Promise(function (resolver) {
      if (!stripe) { alert('El pago con tarjeta aún no está disponible en la web.'); return resolver(false); }
      var fondo = document.createElement('div');
      fondo.className = 'modal-fondo';
      fondo.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="t-pago"><h3 id="t-pago">' + esc(titulo) + '</h3><p class="nota-peq">' + esc(texto) + '</p>' +
        '<div id="pago-el"></div><button class="boton" id="pagar" type="button">' + esc(textoBoton) + '</button>' +
        '<button class="enlace-btn" id="cerrar-pago" type="button">Cancelar</button><div class="aviso" role="status" aria-live="polite"></div>' +
        '<p class="nota-peq">🔒 Pago seguro con Stripe. Rizú no guarda los datos de tu tarjeta.</p></div>';
      document.body.appendChild(fondo);
      var elements = stripe.elements({ clientSecret: clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#6D28D9', borderRadius: '12px', fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' } }, locale: 'es' });
      var el = elements.create('payment', { layout: 'tabs' });
      el.mount(fondo.querySelector('#pago-el'));
      function cerrar(ok) { el.destroy(); fondo.remove(); resolver(ok); }
      fondo.querySelector('#cerrar-pago').addEventListener('click', function () { cerrar(false); });
      fondo.querySelector('#pagar').addEventListener('click', async function () {
        var b = this, av = fondo.querySelector('.aviso'); b.disabled = true; b.textContent = 'Procesando…';
        var r = await stripe.confirmPayment({ elements: elements, redirect: 'if_required', confirmParams: { return_url: URL_APP + '#/reservas' } });
        if (r.error) { aviso(av, 'error', r.error.message || 'No se pudo completar el pago.'); b.disabled = false; b.textContent = textoBoton; return; }
        var st = r.paymentIntent && r.paymentIntent.status;
        if (st === 'requires_capture' || st === 'succeeded' || st === 'processing') return cerrar(true);
        aviso(av, 'error', 'El pago no se ha completado. Inténtalo de nuevo.'); b.disabled = false; b.textContent = textoBoton;
      });
    });
  }

  // ---------- Mis reservas ----------
  async function vistaReservas() {
    pintar('<div class="cargando">Cargando tus reservas…</div>');
    var r = await sb.rpc('mis_reservas', { p_como: 'cliente' });
    if (r.error) throw new Error(r.error.message);
    var lista = r.data || [];
    var activas = lista.filter(function (x) { return ['pendiente', 'aceptada', 'en_camino', 'en_curso'].indexOf(x.estado) >= 0; });
    var ids = activas.filter(function (x) { return x.estado !== 'pendiente'; }).map(function (x) { return x.id; });
    var pins = {};
    if (ids.length) ((await sb.from('reserva_pins').select('reserva_id, pin').in('reserva_id', ids)).data || []).forEach(function (p) { pins[p.reserva_id] = p.pin; });
    var deuda = (await sb.rpc('mi_deuda')).data; deuda = Array.isArray(deuda) ? deuda[0] : deuda;

    function tarjeta(x) {
      var horas = (new Date(x.empieza) - Date.now()) / 3600000;
      var cancelable = ['pendiente', 'aceptada', 'en_camino'].indexOf(x.estado) >= 0;
      return '<div class="reserva"><div class="reserva-cab"><div><b>' + esc(x.servicio) + '</b> con ' + esc((x.otra_parte_nombre || '').split(' ')[0]) +
        '<div class="meta">' + fecha(x.empieza) + ' · ' + euros(x.precio_total_cent) + ' · ' + (x.metodo_pago === 'efectivo' ? '💶 efectivo' : '💳 tarjeta') + '</div></div>' +
        '<span class="insignia ' + (COLOR_ESTADO[x.estado] || '') + '">' + (TEXTO_ESTADO[x.estado] || esc(x.estado)) + '</span></div>' +
        '<div class="meta">📍 ' + esc(x.direccion) + '</div>' +
        (pins[x.id] ? '<div class="pin">Tu PIN para empezar el servicio: <b>' + esc(pins[x.id]) + '</b><div class="nota-peq">Dáselo a la profesional al llegar. No lo compartas antes.</div></div>' : '') +
        (x.pago_error && ['cancelada', 'rechazada'].indexOf(x.estado) < 0 ? '<div class="alerta-pago"><b>Tu banco no ha confirmado el pago de esta cita.</b><span>Vuelve a pagar para mantenerla.</span><button class="boton peq" data-repagar="' + esc(x.id) + '" type="button">Pagar ahora</button></div>' : '') +
        (x.en_disputa ? '<p class="nota-peq" style="color:#B91C1C">Pago en disputa con el banco: lo estamos revisando.</p>' : '') +
        (x.cargo_cancelacion_cent > 0 ? '<p class="nota-peq">Cargo por cancelación: ' + euros(x.cargo_cancelacion_cent) + (x.metodo_pago === 'efectivo' && !x.cargo_pagado ? ' (pendiente de pago)' : '') + '</p>' : '') +
        (x.estado === 'completada' && !x.yo_valore ? '<p class="nota-peq">⭐ Valora el servicio desde la app de Rizú.</p>' : '') +
        (cancelable ? '<div class="acciones"><button class="boton peq peligro" type="button" data-cancelar="' + esc(x.id) + '" data-tarde="' + (x.estado === 'en_camino' || (x.estado === 'aceptada' && horas < estado.reglas.cancel_horas)) + '">Cancelar reserva</button></div>' : '') +
        '</div>';
    }
    pintar('<h1 style="margin-top:0">Mis reservas</h1>' +
      (deuda && deuda.cliente_cent > 0 ? '<div class="alerta-pago" style="margin-bottom:16px"><b>Tienes ' + euros(deuda.cliente_cent) + ' pendientes por cancelaciones tardías.</b><span>Págalo para poder volver a reservar.</span><button class="boton peq" id="pagar-deuda" type="button">Pagar ' + euros(deuda.cliente_cent) + '</button></div>' : '') +
      '<h2 class="seccion-t">Próximas</h2>' + (activas.length ? activas.map(tarjeta).join('') : '<div class="vacio">No tienes reservas próximas. <a href="#/">Busca un profesional</a>.</div>') +
      '<h2 class="seccion-t">Anteriores</h2>' + (lista.length - activas.length ? lista.filter(function (x) { return activas.indexOf(x) < 0; }).map(tarjeta).join('') : '<div class="vacio">Aquí verás tu historial.</div>'));

    vista.querySelectorAll('[data-cancelar]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var tarde = b.dataset.tarde === 'true';
        if (!confirm(tarde ? 'Faltan menos de ' + estado.reglas.cancel_horas + ' h: se cobrará el 50 % del servicio para compensar a la profesional. ¿Cancelar igualmente?' : '¿Seguro que quieres cancelar? Es gratis.')) return;
        b.disabled = true;
        var r = await sb.rpc('cambiar_estado_reserva', { p_reserva: b.dataset.cancelar, p_estado: 'cancelada' });
        if (r.error) { alert(r.error.message); b.disabled = false; return; }
        llamarFuncion('cancelar-pago', { reserva_id: b.dataset.cancelar }).catch(function () {});
        vistaReservas();
      });
    });
    vista.querySelectorAll('[data-repagar]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        try {
          var p = await llamarFuncion('crear-pago', { reserva_id: b.dataset.repagar });
          var ok = await hojaDePago(p.client_secret, 'Pagar tu cita', 'Tu banco no confirmó el pago anterior.', 'Pagar', false);
          if (ok) { alert('¡Pago listo! Tu reserva sigue en pie.'); setTimeout(vistaReservas, 2000); }
        } catch (e) { alert(e.message); }
        b.disabled = false;
      });
    });
    var pd = $('#pagar-deuda');
    if (pd) pd.addEventListener('click', async function () {
      pd.disabled = true;
      try {
        var p = await llamarFuncion('pagar-deuda', { tipo: 'cliente' });
        var ok = await hojaDePago(p.client_secret, 'Pagar cargos pendientes', 'Cargos por cancelaciones tardías.', 'Pagar', false);
        if (ok) { alert('¡Pagado! Ya puedes volver a reservar.'); setTimeout(vistaReservas, 2500); }
      } catch (e) { alert(e.message); }
      pd.disabled = false;
    });
  }

  // ---------- Mi cuenta y membresías ----------
  async function vistaCuenta() {
    pintar('<div class="cargando">Cargando…</div>');
    var r = await Promise.all([
      sb.from('planes').select('id, para, nombre, precio_cent, precio_anual_cent, ventajas, comparativa').eq('activo', true).eq('para', 'cliente'),
      sb.rpc('mis_planes')
    ]);
    var plan = (r[0].data || [])[0], mios = r[1].data || [];
    var mio = plan && mios.find(function (m) { return m.plan_id === plan.id; });
    var periodo = 'anual';
    var u = estado.sesion.user;

    function htmlPlan() {
      if (!plan) return '';
      var anual = periodo === 'anual' && plan.precio_anual_cent;
      var totalP = anual ? plan.precio_anual_cent : plan.precio_cent;
      var alMes = anual ? Math.round(totalP / 12) : totalP;
      var filas = (plan.comparativa || []).map(function (f) { return '<tr><th scope="row">' + esc(f.ventaja) + '</th><td>' + esc(f.gratis) + '</td><td class="si">' + esc(f.plan) + '</td></tr>'; }).join('');
      var activo = mio && mio.activo;
      return '<div class="plan" style="max-width:560px"><div class="plan-cab"><h3>' + esc(plan.nombre) + (activo ? ' <span class="regalo" style="background:#fff;color:#15803D">ACTIVO</span>' : anual ? ' <span class="regalo">4 meses gratis</span>' : '') + '</h3>' +
        '<div class="precio">' + euros(alMes) + ' <small>/ mes</small></div><p class="detalle">' + (anual ? euros(totalP) + ' al año · ahorras ' + euros(plan.precio_cent * 12 - plan.precio_anual_cent) : 'Sin permanencia') + '</p></div>' +
        '<table class="compara"><thead><tr><th scope="col">Ventaja</th><th scope="col">Gratis</th><th scope="col">Club</th></tr></thead><tbody>' + filas + '</tbody></table>' +
        '<div style="padding:18px 22px 22px;display:grid;gap:10px">' +
        (activo ? '<p class="nota-peq">Plan ' + esc(mio.periodo) + ' · ' + (mio.cancela_al_final ? 'se cancelará' : 'se renueva') + ' el ' + (mio.renueva_en ? new Date(mio.renueva_en).toLocaleDateString('es-ES') : '—') + '</p>' +
          (mio.cancela_al_final ? '' : '<button class="boton secundario" id="cancelar-plan" type="button">Cancelar membresía</button>')
          : '<button class="boton" id="unirme" type="button">Unirme por ' + euros(totalP) + (anual ? '/año' : '/mes') + '</button>') +
        '</div></div>';
    }
    function pintarCuenta() {
      pintar('<h1 style="margin-top:0">Mi cuenta</h1>' +
        '<div class="tarjeta" style="margin-bottom:24px"><b>' + esc(estado.perfil && estado.perfil.nombre || '') + '</b><div class="meta">' + esc(u.email) + '</div>' +
        '<div class="acciones" style="margin-top:12px"><button class="boton peq secundario" id="salir" type="button">Cerrar sesión</button><a class="boton peq peligro" href="eliminar-cuenta.html">Eliminar cuenta</a></div></div>' +
        (plan ? '<h2 class="seccion-t">Rizú Club</h2><p class="nota-peq" style="margin-bottom:14px">Opcional y sin permanencia.</p>' +
          (mio && mio.activo ? '' : '<div class="periodo" role="group" aria-label="Forma de pago"><button type="button" data-p="mensual" aria-pressed="' + (periodo === 'mensual') + '">Mensual</button><button type="button" data-p="anual" aria-pressed="' + (periodo === 'anual') + '">Anual <span class="ahorro">−33 %</span></button></div>') +
          htmlPlan() : '') +
        '<h2 class="seccion-t">¿Eres profesional?</h2><p>Gestiona tu agenda, cobros y Rizú Pro+ desde la app de Rizú. <a href="./#profesionales">Solicita unirte</a>.</p>');
      $('#salir').addEventListener('click', async function () { await sb.auth.signOut(); await cargarUsuario(); location.hash = '#/entrar'; });
      vista.querySelectorAll('[data-p]').forEach(function (b) { b.addEventListener('click', function () { periodo = b.dataset.p; pintarCuenta(); }); });
      var un = $('#unirme');
      if (un) un.addEventListener('click', async function () {
        un.disabled = true;
        try {
          var s = await llamarFuncion('crear-suscripcion', { plan_id: plan.id, periodo: periodo });
          var ok = await hojaDePago(s.client_secret, 'Unirte a ' + plan.nombre, periodo === 'anual' ? 'Pago anual. Se renueva cada año; cancela cuando quieras.' : 'Pago mensual. Cancela cuando quieras.', 'Pagar y unirme', true);
          if (ok) { alert('¡Bienvenido a ' + plan.nombre + '! Tus ventajas se activan en unos segundos.'); setTimeout(async function () { await cargarUsuario(); vistaCuenta(); }, 3000); }
        } catch (e) { alert(e.message); }
        un.disabled = false;
      });
      var cp = $('#cancelar-plan');
      if (cp) cp.addEventListener('click', async function () {
        if (!confirm('¿Cancelar ' + plan.nombre + '? Mantendrás las ventajas hasta el final del periodo pagado.')) return;
        cp.disabled = true;
        try { await llamarFuncion('cancelar-suscripcion', { plan_id: plan.id }); vistaCuenta(); } catch (e) { alert(e.message); cp.disabled = false; }
      });
    }
    pintarCuenta();
  }

  // ---------- Arranque ----------
  document.getElementById('anio').textContent = new Date().getFullYear();
  sb.auth.onAuthStateChange(function (evento) {
    if (evento === 'PASSWORD_RECOVERY') {
      var nueva = prompt('Escribe tu nueva contraseña (mínimo 6 caracteres):');
      if (nueva && nueva.length >= 6) sb.auth.updateUser({ password: nueva }).then(function (r) { alert(r.error ? r.error.message : 'Contraseña cambiada.'); });
    }
  });
  cargarUsuario().then(function () {
    // Tras confirmar el email, Supabase deja los datos de sesión en la URL: se limpian
    if (/access_token|error_description|type=recovery/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/');
    navegar();
  });
  window.addEventListener('hashchange', navegar);
})();

// Envío de formularios de Rizú a Supabase (solo inserción; nadie puede leer lo enviado salvo el equipo).
(function () {
  var URL_BASE = 'https://jljuuytjivrxhjugxjaz.supabase.co/rest/v1/';
  var CLAVE = 'sb_publishable_O9HxRqA9a-VTyEogOj6cgg__E0dhlQO';

  function mostrar(aviso, tipo, texto) {
    aviso.className = 'aviso ' + tipo;
    aviso.textContent = texto;
  }

  document.querySelectorAll('form[data-tabla]').forEach(function (form) {
    var aviso = form.querySelector('.aviso');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var datos = new FormData(form);
      if (datos.get('web_sitio')) { mostrar(aviso, 'ok', '¡Gracias! Lo hemos recibido.'); form.reset(); return; }

      var cuerpo = {};
      form.querySelectorAll('[data-campo]').forEach(function (el) {
        var clave = el.getAttribute('data-campo');
        cuerpo[clave] = el.type === 'checkbox' ? el.checked : el.value.trim();
      });
      var fijo = form.getAttribute('data-tipo');
      if (fijo) cuerpo.tipo = fijo;

      var boton = form.querySelector('button[type=submit]');
      boton.disabled = true;
      var textoBoton = boton.textContent;
      boton.textContent = 'Enviando…';

      fetch(URL_BASE + form.getAttribute('data-tabla'), {
        method: 'POST',
        headers: {
          apikey: CLAVE,
          Authorization: 'Bearer ' + CLAVE,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(cuerpo)
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        mostrar(aviso, 'ok', form.getAttribute('data-ok') || '¡Gracias! Lo hemos recibido y te responderemos por email.');
        form.reset();
      }).catch(function () {
        mostrar(aviso, 'error', 'No se ha podido enviar ahora mismo. Inténtalo de nuevo en unos minutos.');
      }).finally(function () {
        boton.disabled = false;
        boton.textContent = textoBoton;
      });
    });
  });

  // Membresías: cambiar entre precio mensual y anual
  var botones = document.querySelectorAll('.periodo button');
  function verPeriodo(periodo) {
    botones.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-periodo') === periodo)); });
    document.querySelectorAll('[data-' + periodo + ']').forEach(function (el) { el.textContent = el.getAttribute('data-' + periodo); });
    document.querySelectorAll('[data-solo]').forEach(function (el) { el.hidden = el.getAttribute('data-solo') !== periodo; });
  }
  botones.forEach(function (b) { b.addEventListener('click', function () { verPeriodo(b.getAttribute('data-periodo')); }); });

  var anio = document.getElementById('anio');
  if (anio) anio.textContent = new Date().getFullYear();
})();

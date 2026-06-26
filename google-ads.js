(function () {
  'use strict';

  var cfg = window.GADS_CONFIG;

  if (!cfg || !cfg.conversionId || !cfg.sendTo) {
    console.error('[gads-bridge] window.GADS_CONFIG ausente ou incompleto. Script não iniciado.');
    return;
  }

  var DEBUG = !!cfg.debug;

  function log() {
    if (DEBUG) {
      console.log.apply(console, ['[gads-bridge]'].concat(Array.prototype.slice.call(arguments)));
    }
  }

  window.dataLayer = window.dataLayer || [];

  function ensureGtag() {
    if (typeof window.gtag === 'function') return;

    window.gtag = function () {
      window.dataLayer.push(arguments);
    };

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + cfg.conversionId;
    document.head.appendChild(s);

    window.gtag('js', new Date());
    window.gtag('config', cfg.conversionId);
  }

  function extractEcommerceParams(evt) {
    var src = evt.ecommerce || evt;
    var params = {};

    if (src.value !== undefined) params.value = src.value;
    if (src.currency) params.currency = src.currency;
    if (src.transaction_id) params.transaction_id = src.transaction_id;

    return params;
  }

  // Dispara a conversão no Google Ads para um evento específico.
  function sendConversion(eventName, evt) {
    var label = cfg.sendTo[eventName];
    if (!label) {
      log('Evento "' + eventName + '" recebido mas sem label configurado — ignorado.');
      return;
    }

    ensureGtag();

    var params = extractEcommerceParams(evt);
    params.send_to = cfg.conversionId + '/' + label;

    if (eventName === 'purchase' && !params.transaction_id) {
      log('AVISO: evento "purchase" sem transaction_id — risco de contagem duplicada.');
    }

    window.gtag('event', 'conversion', params);
    log('Conversão enviada:', eventName, params);
  }

  var originalPush = window.dataLayer.push;

  window.dataLayer.push = function () {
    var args = Array.prototype.slice.call(arguments);

    args.forEach(function (evt) {
      if (evt && typeof evt === 'object' && evt.event && cfg.sendTo.hasOwnProperty(evt.event)) {
        sendConversion(evt.event, evt);
      }
    });

    return originalPush.apply(window.dataLayer, args);
  };

  log('Inicializado. Conversion ID:', cfg.conversionId, '| Eventos monitorados:', Object.keys(cfg.sendTo));
})();

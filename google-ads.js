(function () {
  'use strict';

  var BRIDGE_EVENT_NAME = 'gads_conversion';

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

  function extractEcommerceParams(evt) {
    var src = evt.ecommerce || evt;
    var params = {};

    if (src.value !== undefined) params.value = src.value;
    if (src.currency) params.currency = src.currency;
    if (src.transaction_id) params.transaction_id = src.transaction_id;

    return params;
  }

  // Empacota e envia o evento-ponte para o GTM processar.
  function pushBridgeEvent(eventName, evt) {
    var label = cfg.sendTo[eventName];
    if (!label) {
      log('Evento "' + eventName + '" recebido mas sem label configurado — ignorado.');
      return;
    }

    var ecommerceParams = extractEcommerceParams(evt);

    // purchase é o único evento onde duplicidade é crítica:
    // o Google Ads usa transaction_id para deduplicar automaticamente.
    if (eventName === 'purchase' && !ecommerceParams.transaction_id) {
      log('AVISO: evento "purchase" sem transaction_id — risco de contagem duplicada.');
    }

    var bridgePayload = {
      event: BRIDGE_EVENT_NAME,
      gads_conversion_id: cfg.conversionId,
      gads_conversion_label: label,
      gads_source_event: eventName, // útil para debug e para diferenciar triggers no GTM, se quiser
      value: ecommerceParams.value,
      currency: ecommerceParams.currency,
      transaction_id: ecommerceParams.transaction_id
    };

    window.dataLayer.push(bridgePayload);
    log('Evento-ponte enviado ao dataLayer:', bridgePayload);
  }

  var originalPush = window.dataLayer.push;

  window.dataLayer.push = function () {
    var args = Array.prototype.slice.call(arguments);

    args.forEach(function (evt) {
      if (
        evt &&
        typeof evt === 'object' &&
        evt.event &&
        evt.event !== BRIDGE_EVENT_NAME && // nunca reagir ao próprio evento-ponte
        cfg.sendTo.hasOwnProperty(evt.event)
      ) {
        pushBridgeEvent(evt.event, evt);
      }
    });

    return originalPush.apply(window.dataLayer, args);
  };

  log('Inicializado. Conversion ID:', cfg.conversionId, '| Eventos monitorados:', Object.keys(cfg.sendTo));
})();

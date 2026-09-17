(function () {
  'use strict';

  if (window.__metaPixelLoaderLoaded) return;
  window.__metaPixelLoaderLoaded = true;

  var PIXEL_ID          = window.meta_pixel_id          || '';
  var DEBUG             = window.meta_debug             || false;
  var SKIP_OPENBRIDGE   = window.meta_skip_openbridge   || false;

  if (!PIXEL_ID) {
    console.warn('[meta-pixel-loader] window.meta_pixel_id não definido. Abortando.');
    return;
  }

  function log(label, data) {
    if (!DEBUG) return;
    var serialized;
    try { serialized = JSON.stringify(data); } catch (e) { serialized = '[não serializável: ' + e.message + ']'; }
    console.log('[Meta Pixel] ' + label + ' ->', serialized);
  }

  function clean(obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v !== undefined && v !== null && v !== '') out[k] = v;
    });
    return out;
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : '';
  }

  // ---------------------------------------------------------------------
  // fbq base loader (snippet oficial do Meta Pixel)
  // ---------------------------------------------------------------------
  function loadFbq() {
    if (window.fbq) return;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  }

  // ---------------------------------------------------------------------
  // Advanced Matching (user_data)
  // ---------------------------------------------------------------------
  var USER_DATA_KEY = 'meta_user_data';

  function lsGetUserData() {
    try { return JSON.parse(localStorage.getItem(USER_DATA_KEY)) || {}; } catch (e) { return {}; }
  }
  function lsSetUserData(data) {
    try { localStorage.setItem(USER_DATA_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function mergeUserData(patch) {
    var current = lsGetUserData();
    var updated = clean({
      email:      patch.email      || current.email,
      first_name: patch.first_name || current.first_name,
      last_name:  patch.last_name  || current.last_name,
      phone:      patch.phone      || current.phone,
      taxvat:     patch.taxvat     || current.taxvat,
      city:       patch.city       || current.city,
      region:     patch.region     || current.region,
      zip_code:   patch.zip_code   || current.zip_code,
      country:    patch.country    || current.country || 'Brazil'
    });
    lsSetUserData(updated);
    log('user_data atualizado', updated);
    refreshAdvancedMatching();
    return updated;
  }

  function saveCustomer(customer) {
    if (!customer) return;
    mergeUserData({
      email:      customer.email      || '',
      first_name: customer.first_name || '',
      last_name:  customer.last_name  || '',
      phone:      (customer.phone || '').replace(/\D/g, ''),
      taxvat:     (customer.taxvat || '').replace(/\D/g, '')
    });
  }

  function saveShipping(shipping) {
    if (!shipping) return;
    mergeUserData({
      city:     shipping.delivery_city   || '',
      region:   shipping.delivery_region || '',
      zip_code: shipping.zip_code        || '',
      country:  shipping.delivery_country === 'BR' ? 'Brazil' : (shipping.delivery_country || '')
    });
  }

  function buildMatchData() {
    var stored = lsGetUserData();
    return clean({
      em:          stored.email,
      ph:          stored.phone,
      fn:          stored.first_name,
      ln:          stored.last_name,
      ct:          stored.city,
      st:          stored.region,
      zp:          stored.zip_code,
      external_id: stored.taxvat,
      country:     stored.country || 'Brazil'
    });
  }

  function refreshAdvancedMatching() {
    if (!window.fbq) return;
    var matchData = buildMatchData();
    if (Object.keys(matchData).length) {
      fbq('init', PIXEL_ID, matchData);
      log('Advanced Matching reforçado no init', matchData);
    }
  }

  function initPixel() {
    loadFbq();
    fbq('init', PIXEL_ID, buildMatchData());
    if (SKIP_OPENBRIDGE) {
      fbq('skipOpenbridge', PIXEL_ID);
      log('OpenBridge desativado para este pixel', { pixel_id: PIXEL_ID });
    }
    fbq('track', 'PageView');
    log('Pixel inicializado', { pixel_id: PIXEL_ID, skip_openbridge: SKIP_OPENBRIDGE });
  }

  // ---------------------------------------------------------------------
  // event_id — o time de dev vai mandar via dataLayer (eventModel.event_id).
  // Deixamos duas variações de nome cobertas até confirmarem o campo exato.
  // ---------------------------------------------------------------------
  function getEventId(eventModel) {
    var id = eventModel && (eventModel.event_id || eventModel.eventId);
    if (!id) {
      log('⚠️ event_id ausente no eventModel — dedupe com a CAPI pode falhar', eventModel);
    }
    return id || undefined;
  }

  function track(pixelEvent, customData, eventId) {
    var data = clean(customData);
    if (eventId) {
      fbq('track', pixelEvent, data, { eventID: eventId });
    } else {
      fbq('track', pixelEvent, data);
    }
    log('Disparado: ' + pixelEvent, { customData: data, eventID: eventId });
  }

  function firstVariantId(item) {
    if (item && Array.isArray(item.variantion) && item.variantion.length && item.variantion[0].variant_id) {
      return String(item.variantion[0].variant_id);
    }
    return null;
  }

  function buildContents(items) {
    var contentIds = [];
    var contents   = [];
    var numItems   = 0;

    (items || []).forEach(function (item) {
      var variantId = firstVariantId(item) || String(item.item_id);
      contentIds.push(variantId);
      contents.push(clean({
        id:         variantId,
        quantity:   item.quantity || 1,
        item_price: item.price
      }));
      numItems += (item.quantity || 1);
    });

    return { content_ids: contentIds, contents: contents, num_items: numItems };
  }

  // ---------------------------------------------------------------------
  // Handlers por evento do dataLayer
  // ---------------------------------------------------------------------

  // view_item -> ViewContent (content_type = product_group, id = produto pai)
  function handleViewItem(eventModel) {
    var items = eventModel && eventModel.items;
    if (!items || !items.length) { log('ViewContent | ABORTADO — items ausente', eventModel); return; }
    var item = items[0];

    track('ViewContent', {
      content_type: 'product_group',
      content_ids:  [String(item.item_id)],
      content_name: item.item_name,
      value:        eventModel.value,
      currency:     eventModel.currency || 'BRL',
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc')
    }, getEventId(eventModel));
  }

  // add_to_cart -> AddToCart (content_type = product, id = variação adicionada)
  function handleAddToCart(eventModel) {
    var items = eventModel && eventModel.items;
    if (!items || !items.length) { log('AddToCart | ABORTADO — items ausente', eventModel); return; }
    var item      = items[0];
    var variantId = firstVariantId(item);

    if (!variantId) {
      log('AddToCart | ⚠️ variant_id ausente em variantion — conferir payload', item);
    }

    track('AddToCart', {
      content_type: 'product',
      content_ids:  [variantId || String(item.item_id)],
      content_name: item.item_name,
      value:        eventModel.value,
      currency:     eventModel.currency || 'BRL',
      num_items:    item.quantity || 1,
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc')
    }, getEventId(eventModel));
  }

  // begin_checkout / add_shipping_info / add_payment_info -> content_type =
  // product, ids = TODAS as variações do carrinho
  function handleCheckoutFamily(pixelEvent, eventModel) {
    var items = eventModel && eventModel.items;
    if (!items || !items.length) { log(pixelEvent + ' | ABORTADO — items ausente', eventModel); return; }

    var built = buildContents(items);

    track(pixelEvent, {
      content_type: 'product',
      content_ids:  built.content_ids,
      contents:     built.contents,
      num_items:    built.num_items,
      value:        eventModel.value,
      currency:     eventModel.currency || 'BRL',
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc')
    }, getEventId(eventModel));
  }

  function handleAddShippingInfo(eventModel) {
    saveShipping(eventModel && eventModel.shipping);
    handleCheckoutFamily('AddShippingInfo', eventModel);
  }

  // purchase -> Purchase (mesmo padrão de contents/content_ids do checkout)
  var _purchaseFired = {};

  function handlePurchase(eventModel) {
    var items = eventModel && eventModel.items;
    if (!items || !items.length) { log('Purchase | ABORTADO — items ausente', eventModel); return; }

    var transactionId = eventModel.transaction_id;
    if (transactionId) {
      if (_purchaseFired[transactionId]) {
        log('Purchase | ABORTADO — pedido já disparado nesta sessão', { transaction_id: transactionId });
        return;
      }
      _purchaseFired[transactionId] = true;
    }

    if (eventModel.customer) saveCustomer(eventModel.customer);
    if (eventModel.shipping) saveShipping(eventModel.shipping);

    var built = buildContents(items);

    track('Purchase', {
      content_type: 'product',
      content_ids:  built.content_ids,
      contents:     built.contents,
      num_items:    built.num_items,
      value:        eventModel.value,
      currency:     eventModel.currency || 'BRL',
      order_id:     eventModel.transaction_id,
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc')
    }, getEventId(eventModel));
  }

  function handleLoginSuccess(eventModel) {
    if (eventModel && eventModel.customer) saveCustomer(eventModel.customer);
  }

  // ---------------------------------------------------------------------
  // Intercepta window.dataLayer.push (mesmo mecanismo do edrone-loader)
  // ---------------------------------------------------------------------

  function extractEventPayload(item) {
    if (!item) return null;

    // Formato "objeto simples", conforme a documentação: {event: 'x', eventModel: {...}}
    if (item.event) {
      return { eventName: item.event, eventModel: item.eventModel || item };
    }

    if (item.length >= 2 && item[0] === 'event') {
      var params = item[2] || {};
      return { eventName: item[1], eventModel: params.eventModel || params };
    }

    return null;
  }

  function processDataLayerItem(item, source) {
    if (!item) return;
    var payload = extractEventPayload(item);

    // Diagnóstico bruto — mostra exatamente o formato recebido, casando ou não
    var raw = {
      is_array:  Array.isArray(item),
      length:    item.length,
      item0:     item[0],
      item1:     item[1],
      has_dot_event: !!item.event
    };

    if (!payload) {
      log('dataLayer ' + source + ' — IGNORADO (formato não reconhecido)', raw);
      return;
    }

    var eventName  = payload.eventName;
    var eventModel = payload.eventModel || {};

    log('dataLayer ' + source, {
      event: eventName,
      is_array: raw.is_array,
      length: raw.length,
      item0: raw.item0,
      item1: raw.item1,
      has_dot_event: raw.has_dot_event
    });

    switch (eventName) {
      case 'view_item':         handleViewItem(eventModel);        break;
      case 'add_to_cart':       handleAddToCart(eventModel);       break;
      case 'begin_checkout':    handleCheckoutFamily('InitiateCheckout', eventModel); break;
      case 'add_shipping_info': handleAddShippingInfo(eventModel); break;
      case 'add_payment_info':  handleCheckoutFamily('AddPaymentInfo', eventModel);   break;
      case 'purchase':          handlePurchase(eventModel);        break;
      case 'login_success':     handleLoginSuccess(eventModel);    break;
    }
  }

  function interceptDataLayer() {
    window.dataLayer = window.dataLayer || [];

    var backlog = window.dataLayer.slice();
    backlog.forEach(function (item) { processDataLayerItem(item, 'no backlog (já estava no array)'); });

    var _originalPush = window.dataLayer.push.bind(window.dataLayer);

    window.dataLayer.push = function () {
      var result = _originalPush.apply(window.dataLayer, arguments);

      Array.prototype.forEach.call(arguments, function (item) {
        processDataLayerItem(item, 'interceptado');
      });

      return result;
    };

    log('dataLayer.push interceptado com sucesso', { itens_no_backlog: backlog.length });
  }

  initPixel();
  interceptDataLayer();

  log('meta-pixel-loader inicializado', { pixel_id: PIXEL_ID, debug: DEBUG });

})();

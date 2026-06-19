(function () {
  'use strict';

  function getMerchantId() {
    return window.merchant_id || null;
  }

  function formatDateToYYYYMMDD(date) {
    var yyyy = date.getFullYear();
    var mm = String(date.getMonth() + 1).padStart(2, '0');
    var dd = String(date.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function loadGoogleApiScript(callback) {
    if (window.gapi) {
      callback();
      return;
    }
    if (document.getElementById('google-survey-optin-script')) {

      document.getElementById('google-survey-optin-script').addEventListener('load', callback);
      return;
    }
    var script = document.createElement('script');
    script.id = 'google-survey-optin-script';
    script.src = 'https://apis.google.com/js/platform.js';
    script.async = true;
    script.defer = true;
    script.onload = callback;
    document.head.appendChild(script);
  }

  function renderGoogleSurveyOptIn(eventModel) {
    if (!eventModel) return;

    var merchantId = getMerchantId();
    if (!merchantId) {
      console.warn('[Google Survey OptIn] window.merchant_id não foi definido antes deste script carregar. Renderização cancelada.');
      return;
    }

    var shipping = eventModel.shipping || {};
    var customer = eventModel.customer || {};

    var deliveryOffset = parseInt(shipping.estimated_delivery_date, 10) || 1;
    var today = new Date();
    today.setDate(today.getDate() + deliveryOffset);
    var estimatedDeliveryDate = formatDateToYYYYMMDD(today);

    loadGoogleApiScript(function () {
      window.gapi.load('surveyoptin', function () {
        window.gapi.surveyoptin.render({
          // CAMPOS OBRIGATÓRIOS
          merchant_id: merchantId,
          order_id: eventModel.transaction_id,
          email: customer.email,
          delivery_country: shipping.delivery_country,
          estimated_delivery_date: estimatedDeliveryDate
        });
      });
    });
  }

  function handlePurchaseEvent(eventModel) {
    try {
      renderGoogleSurveyOptIn(eventModel);
    } catch (err) {
      console.error('[Google Survey OptIn] Erro ao renderizar:', err);
    }
  }

  window.dataLayer = window.dataLayer || [];

  window.dataLayer.forEach(function (item) {
    if (item && item.event === 'purchase') {
      handlePurchaseEvent(item.eventModel);
    }
  });

  var originalPush = window.dataLayer.push;
  window.dataLayer.push = function () {
    var result = originalPush.apply(window.dataLayer, arguments);
    for (var i = 0; i < arguments.length; i++) {
      var item = arguments[i];
      if (item && item.event === 'purchase') {
        handlePurchaseEvent(item.eventModel);
      }
    }
    return result;
  };
})();

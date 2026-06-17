(function () {
  if (window.__bloomieAnalyticsLoaded) return;
  window.__bloomieAnalyticsLoaded = true;

  var endpoint = '/api/analytics/collect';
  var site = 'bloomiestaffing.com';
  var sessionKey = 'bloomie_analytics_session_id';
  var visitorKey = 'bloomie_analytics_visitor_id';
  var startTime = Date.now();

  function id(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getStored(key, prefix) {
    try {
      var existing = localStorage.getItem(key);
      if (existing) return existing;
      var next = id(prefix);
      localStorage.setItem(key, next);
      return next;
    } catch (e) {
      return id(prefix);
    }
  }

  function getSession() {
    try {
      var raw = sessionStorage.getItem(sessionKey);
      if (raw) return raw;
      var next = id('s');
      sessionStorage.setItem(sessionKey, next);
      return next;
    } catch (e) {
      return id('s');
    }
  }

  var visitorId = getStored(visitorKey, 'v');
  var sessionId = getSession();

  function payload(type, extra) {
    return Object.assign({
      site: site,
      eventType: type,
      pageUrl: location.href,
      pagePath: location.pathname,
      pageTitle: document.title || '',
      referrer: document.referrer || '',
      sessionId: sessionId,
      visitorId: visitorId,
      browserLang: navigator.language || '',
      screenSize: (screen && screen.width && screen.height) ? screen.width + 'x' + screen.height : '',
      deviceType: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
    }, extra || {});
  }

  function send(type, extra, useBeacon) {
    var body = JSON.stringify(payload(type, extra));
    if (useBeacon && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
        return;
      } catch (e) {}
    }
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: !!useBeacon
      }).catch(function () {});
    } catch (e) {}
  }

  send('page_view');

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('a, button') : null;
    if (!target) return;
    var text = (target.innerText || target.getAttribute('aria-label') || target.href || '').trim().replace(/\s+/g, ' ');
    var href = target.href || '';
    var lowered = text.toLowerCase();
    var isCta = href.indexOf('tel:') === 0 ||
      href.indexOf('book-demo') !== -1 ||
      lowered.indexOf('call') !== -1 ||
      lowered.indexOf('demo') !== -1 ||
      lowered.indexOf('interview') !== -1 ||
      lowered.indexOf('ai employee') !== -1 ||
      lowered.indexOf('schedule') !== -1;
    if (!isCta) return;
    send('cta_click', { linkText: text, linkUrl: href });
  }, true);

  function sendTimeOnPage() {
    var seconds = Math.round((Date.now() - startTime) / 1000);
    if (seconds < 3) return;
    send('time_on_page', { durationSeconds: seconds }, true);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendTimeOnPage();
  });
  window.addEventListener('pagehide', sendTimeOnPage);
})();

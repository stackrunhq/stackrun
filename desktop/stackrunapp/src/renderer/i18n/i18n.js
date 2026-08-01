import zhCN from './zh-CN.js';
import enUS from './en-US.js';

const LANGUAGES = {
  'zh-CN': zhCN,
  'en-US': enUS
};

const LANGUAGE_KEY = 'stackrun_language';

let currentLang = 'zh-CN';

function getSystemLanguage() {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language.toLowerCase();
    if (lang.includes('zh')) return 'zh-CN';
    if (lang.includes('en')) return 'en-US';
  }
  return 'zh-CN';
}

function init() {
  const savedLang = localStorage.getItem(LANGUAGE_KEY);
  if (savedLang && LANGUAGES[savedLang]) {
    currentLang = savedLang;
  } else {
    currentLang = getSystemLanguage();
  }
}

function setLanguage(lang) {
  if (LANGUAGES[lang]) {
    currentLang = lang;
    localStorage.setItem(LANGUAGE_KEY, lang);
    return true;
  }
  return false;
}

function getLanguage() {
  return currentLang;
}

function t(key, params) {
  const parts = key.split('.');
  let value = LANGUAGES[currentLang];
  
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return key;
    }
  }
  
  if (typeof value === 'string' && params) {
    return value.replace(/{(\w+)}/g, (match, paramName) => {
      return params[paramName] !== undefined ? params[paramName] : match;
    });
  }
  
  return value;
}

function getAvailableLanguages() {
  return Object.keys(LANGUAGES).map(key => ({
    code: key,
    name: LANGUAGES[key].settings[key === 'zh-CN' ? 'chinese' : 'english']
  }));
}

function refreshUI() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const value = t(key);
    if (value && typeof value === 'string') {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (!el.hasAttribute('data-i18n-textonly')) {
          el.placeholder = value;
        } else {
          el.textContent = value;
        }
      } else if (el.tagName === 'OPTION') {
        el.textContent = value;
      } else if (el.hasAttribute('data-i18n-title')) {
        el.title = value;
        el.textContent = value;
      } else {
        const preserved = [];
        el.querySelectorAll(':scope > span.required').forEach(span => {
          preserved.push(span.cloneNode(true));
        });
        el.textContent = value;
        preserved.forEach(span => el.appendChild(span));
      }
    }
  });

  document.querySelectorAll('[data-i18n-template]').forEach(el => {
    const key = el.getAttribute('data-i18n-template');
    const tmpl = t(key);
    if (tmpl && typeof tmpl === 'string') {
      const spanMap = {};
      const spans = el.querySelectorAll(':scope > span[id], :scope > *');
      spans.forEach(s => { if (s.id) spanMap[s.id] = s.outerHTML; });
      let html = tmpl;
      Object.keys(spanMap).forEach(spanId => {
        const placeholder = `{${spanId}}`;
        if (html.includes(placeholder)) {
          html = html.replace(placeholder, spanMap[spanId]);
        }
      });
      const placeholders = html.match(/\{(\w+)\}/g);
      if (placeholders) {
        placeholders.forEach(ph => {
          const id = ph.slice(1, -1);
          if (document.getElementById(id)) {
            html = html.replace(ph, document.getElementById(id).outerHTML);
          }
        });
      }
      if (placeholders || Object.keys(spanMap).length > 0) {
        el.innerHTML = html;
      } else {
        el.textContent = tmpl;
      }
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const value = t(key);
    if (value && typeof value === 'string') {
      el.placeholder = value;
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    if (el.hasAttribute('data-i18n')) return;
    const key = el.getAttribute('data-i18n-title');
    const value = t(key);
    if (value && typeof value === 'string') {
      el.title = value;
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
        if (el.textContent && el.textContent.trim() && !el.querySelector(':scope > *')) {
          el.textContent = value;
        }
      }
    }
  });

  const titleEl = document.querySelector('title');
  if (titleEl) {
    const titleText = t('app.title');
    titleEl.textContent = titleText;
    if (typeof document !== 'undefined') {
      try { document.title = titleText; } catch (_) {}
    }
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.setTitle === 'function') {
      try { window.electronAPI.setTitle(titleText); } catch (_) {}
    }
  }
  const htmlEl = document.documentElement;
  if (htmlEl) {
    htmlEl.setAttribute('lang', currentLang.toLowerCase());
  }
}

export {
  init,
  setLanguage,
  getLanguage,
  t,
  getAvailableLanguages,
  refreshUI
};
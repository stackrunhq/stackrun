const fs = require('fs');
const path = require('path');

let currentLang = 'zh-CN';
let translations = {};
let userDataPath = null;

function resolveRendererI18nDir() {
  const appRoot = path.resolve(__dirname, '..', '..');
  const dir = path.join(appRoot, 'src', 'renderer', 'i18n');
  if (fs.existsSync(dir)) return dir;
  const asarUnpack = path.join(appRoot, 'app.asar.unpacked', 'src', 'renderer', 'i18n');
  if (fs.existsSync(asarUnpack)) return asarUnpack;
  const bundleDir = path.join(appRoot, 'bundle', 'renderer', 'i18n');
  if (fs.existsSync(bundleDir)) return bundleDir;
  const resourcesDir = path.join(process.resourcesPath || '', 'renderer', 'i18n');
  if (fs.existsSync(resourcesDir)) return resourcesDir;
  return dir;
}

function getLangFilePath(lang) {
  const i18nDir = resolveRendererI18nDir();
  return path.join(i18nDir, `${lang}.js`);
}

function parseTranslationsFromJS(raw) {
  try {
    const fnBody = raw
      .replace(/^\s*export\s+default\s+/m, 'module.exports = ')
      .replace(/^\s*const\s+translations\s*=\s*/m, '')
      .replace(/;\s*$/m, '');
    const wrapped = `(function() { var module = {exports:{}}; ${fnBody}; return module.exports || {}; })()`;
    // eslint-disable-next-line no-eval
    const obj = eval(wrapped);
    return obj;
  } catch (e) {
    try {
      const startBrace = raw.indexOf('{');
      const endBrace = raw.lastIndexOf('}');
      if (startBrace >= 0 && endBrace > startBrace) {
        const jsonStr = raw.slice(startBrace, endBrace + 1)
          .replace(/\/\/.*$/gm, '')
          .replace(/(\w+)\s*:/g, '"$1":')
          .replace(/,\s*([\]}])/g, '$1');
        // eslint-disable-next-line no-eval
        return eval(`(${jsonStr})`);
      }
    } catch (_) { /* ignore */ }
    console.error('[main-i18n] parse translation failed:', e.message);
    return {};
  }
}

function loadTranslations(lang) {
  const fp = getLangFilePath(lang);
  try {
    if (!fs.existsSync(fp)) return {};
    const raw = fs.readFileSync(fp, 'utf-8');
    return parseTranslationsFromJS(raw);
  } catch (e) {
    console.error(`[main-i18n] load ${lang} failed:`, e.message);
    return {};
  }
}

function settingsFilePath() {
  if (!userDataPath) return null;
  return path.join(userDataPath, 'app-settings.json');
}

function readPersistedLang() {
  try {
    const fp = settingsFilePath();
    if (!fp || !fs.existsSync(fp)) return null;
    const s = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    return s.language || s.lang || null;
  } catch (_) { return null; }
}

function writePersistedLang(lang) {
  try {
    const fp = settingsFilePath();
    if (!fp) return;
    let s = {};
    try { if (fs.existsSync(fp)) s = JSON.parse(fs.readFileSync(fp, 'utf-8')) || {}; } catch (_) {}
    s.language = lang;
    fs.writeFileSync(fp, JSON.stringify(s, null, 2));
  } catch (_) { /* ignore */ }
}

function resolve(obj, pathStr) {
  return pathStr.split('.').reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
}

function t(key, params = {}) {
  let value = resolve(translations, key);
  if (value == null || typeof value !== 'string') {
    const fallback = resolve(loadTranslations('zh-CN'), key);
    if (fallback && typeof fallback === 'string') value = fallback;
  }
  if (value && typeof value === 'string' && Object.keys(params).length > 0) {
    return value.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
  }
  return value || key;
}

function init(userDataPathArg) {
  userDataPath = userDataPathArg || null;
  const persisted = readPersistedLang();
  if (persisted && (persisted === 'zh-CN' || persisted === 'en-US')) {
    currentLang = persisted;
  } else {
    const candidates = [
      process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG, process.env.LANGUAGE
    ].filter(Boolean).map(s => String(s).toLowerCase());
    const all = candidates.join(' ');
    const looksEnglish = candidates.some(v =>
      v.startsWith('en_') || v.startsWith('en-') || /^en($|[^a-z])/i.test(v)
    ) && !all.includes('zh');
    currentLang = looksEnglish ? 'en-US' : 'zh-CN';
  }
  translations = loadTranslations(currentLang);
}

function getLanguage() {
  return currentLang;
}

function setLanguage(lang) {
  if (lang !== 'zh-CN' && lang !== 'en-US') return;
  currentLang = lang;
  translations = loadTranslations(lang);
  writePersistedLang(lang);
}

module.exports = {
  init,
  t,
  getLanguage,
  setLanguage
};

/* АРХИТЕКТОР КАПИТАЛА PRO — единый файл приложения v2.0 */
(function () {
  'use strict';

  /* ============================================================
     1. STORE — данные, расчёты, шифрование, форматирование
     ============================================================ */

  const STORAGE_KEY = 'capital-architect:v2';
  const VERSION = 2;
  const PALETTE = ['#00ff66', '#22d3ee', '#facc15', '#a78bfa', '#fb7185', '#f97316', '#a855f7', '#f472b6'];
  const ACCENTS = ['green', 'red', 'cyan', 'purple', 'orange', 'pink'];
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  /* ---------- IndexedDB хранилище ---------- */

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open('capital-architect-db', 1);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('state')) {
          db.createObjectStore('state', { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet() {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction('state', 'readonly');
        const store = tx.objectStore('state');
        const req = store.get(STORAGE_KEY);
        req.onsuccess = function () {
          resolve(req.result ? req.result.value : null);
        };
        req.onerror = function () { reject(req.error); };
        tx.oncomplete = function () { db.close(); };
      });
    });
  }

  function idbSet(value) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction('state', 'readwrite');
        const store = tx.objectStore('state');
        const req = store.put({ id: STORAGE_KEY, value: value });
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { reject(req.error); };
        tx.oncomplete = function () { db.close(); };
      });
    });
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function num(value, fallback) {
    if (typeof value === 'number' && isFinite(value)) return value;
    const n = parseFloat(String(value == null ? '' : value).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : (fallback == null ? 0 : fallback);
  }
  function round2(value) {
    return Math.round((num(value) + Number.EPSILON) * 100) / 100;
  }
  function parseISO(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return null;
    const parts = String(iso).split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function iso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  function todayISO() { return iso(new Date()); }
  function shiftISO(isoStr, days) {
    const d = parseISO(isoStr) || new Date();
    d.setDate(d.getDate() + days);
    return iso(d);
  }
  function weekday(isoStr) {
    const d = parseISO(isoStr);
    return d ? WEEKDAYS[d.getDay()] : '';
  }
  function monthKey(isoStr) {
    const d = parseISO(isoStr);
    return d ? String(d.getFullYear()) + '-' + String(d.getMonth() + 1).padStart(2, '0') : '';
  }
  function formatDate(isoStr, style) {
    const d = parseISO(isoStr);
    if (!d) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    if (style === 'short') return dd + '.' + mm;
    if (style === 'day') return d.getDate() + ' ' + MONTHS[d.getMonth()];
    if (style === 'month') return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  function formatMoney(value, currency, opts) {
    const v = num(value);
    const sign = opts && opts.sign && v > 0 ? '+' : '';
    const sym = currency === 'BYN' ? 'BYN' : (currency || '₽');
    return sign + nf.format(v) + '\u00A0' + sym;
  }
  function convertCurrency(value, fromCurrency, toCurrency) {
    const v = num(value);
    if (fromCurrency === toCurrency) return v;
    const rates = state.settings.currencyRates || {};
    const base = state.settings.baseCurrency || '₽';
    let rate = 1;
    if (fromCurrency === base && rates[toCurrency]) {
      rate = rates[toCurrency];
    } else if (toCurrency === base && rates[fromCurrency]) {
      rate = 1 / rates[fromCurrency];
    } else if (rates[fromCurrency] && rates[toCurrency]) {
      rate = rates[toCurrency] / rates[fromCurrency];
    }
    return round2(v * rate);
  }
  function fetchCurrencyRates() {
    const base = state.settings.baseCurrency || '₽';
    return fetch('https://www.nbrb.by/API/ExRates/Rates?Periodicity=0')
      .then(function (response) { return response.json(); })
      .then(function (data) {
        // НБРБ возвращает курсы относительно BYN
        // Cur_OfficialRate - курс за Cur_Scale единиц валюты к BYN
        const nbrbRates = {}; // валюта -> 1 единица валюты в BYN
        data.forEach(function (item) {
          var code = item.Cur_Abbreviation;
          var scale = item.Cur_Scale || 1;
          var rate = item.Cur_OfficialRate || 0;
          if (rate > 0) {
            nbrbRates[code] = rate / scale; // 1 единица валюты в BYN
          }
        });
        // BYN всегда = 1 BYN
        nbrbRates['BYN'] = 1;

        const symbolMap = { USD: '$', EUR: '€', RUB: '₽', BYN: 'BYN' };
        const rates = {};

        // Курс базовой валюты в BYN
        var baseCode = base === '₽' ? 'RUB' : (base === '$' ? 'USD' : (base === '€' ? 'EUR' : 'BYN'));
        var baseRateInBYN = nbrbRates[baseCode] || 1;

        Object.keys(symbolMap).forEach(function (code) {
          var sym = symbolMap[code];
          var rateInBYN = nbrbRates[code];
          if (rateInBYN && baseRateInBYN) {
            // 1 базовая валюта = rateInBYN / baseRateInBYN целевой валюты
            rates[sym] = round2(rateInBYN / baseRateInBYN);
          }
        });

        rates[base] = 1;
        state.settings.currencyRates = rates;
        return rates;
      })
      .catch(function (e) {
        console.warn('Не удалось загрузить курсы валют из НБРБ, используются ручные:', e);
        return state.settings.currencyRates || {};
      });
  }
  function formatPercent(value, digits) {
    const d = digits == null ? 1 : digits;
    const f = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 });
    return f.format(num(value)) + '%';
  }
  function formatCompact(value) {
    const v = num(value);
    const abs = Math.abs(v);
    const trim = function (s) { return s.replace('.', ','); };
    if (abs >= 1e9) return trim((v / 1e9).toFixed(1)) + 'млрд';
    if (abs >= 1e6) return trim((v / 1e6).toFixed(1)) + 'млн';
    if (abs >= 1e3) return trim((v / 1e3).toFixed(1)) + 'к';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v);
  }
  function parseTags(value) {
    if (!value) return [];
    return String(value).split(',').map(function (t) { return t.trim(); }).filter(Boolean);
  }
  function tagsString(tags) {
    return Array.isArray(tags) ? tags.join(', ') : '';
  }

  /* Шифрование localStorage (AES-GCM + PBKDF2) */
  function encryptString(text, password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    return crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (key) {
        return crypto.subtle.deriveKey({
          name: 'PBKDF2', salt: encoder.encode('capital-architect-salt'),
          iterations: 100000, hash: 'SHA-256'
        }, key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      })
      .then(function (aesKey) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, aesKey, data);
      })
      .then(function (ciphertext) {
        const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
        combined.set(new Uint8Array(iv), 0);
        combined.set(new Uint8Array(ciphertext), iv.byteLength);
        let binary = '';
        for (let i = 0; i < combined.byteLength; i++) binary += String.fromCharCode(combined[i]);
        return btoa(binary);
      });
  }
  function decryptString(ciphertextB64, password) {
    const encoder = new TextEncoder();
    return crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (key) {
        return crypto.subtle.deriveKey({
          name: 'PBKDF2', salt: encoder.encode('capital-architect-salt'),
          iterations: 100000, hash: 'SHA-256'
        }, key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      })
      .then(function (aesKey) {
        const combined = Uint8Array.from(atob(ciphertextB64), function (c) { return c.charCodeAt(0); });
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, aesKey, ciphertext);
      })
      .then(function (plaintext) {
        return new TextDecoder().decode(plaintext);
      });
  }

  /* Модели */
  function defaultStrategies() {
    return [
      { id: 'sport', name: 'Спорт-беттинг', phase: 1, color: '#00ff66', note: 'Ставки на спорт', monthlyBudget: 0 },
      { id: 'crypto', name: 'Крипто-активы', phase: 2, color: '#22d3ee', note: 'Спот и стейкинг', monthlyBudget: 0 },
      { id: 'stocks', name: 'Фондовый рынок', phase: 2, color: '#facc15', note: 'Акции и ETF', monthlyBudget: 0 },
      { id: 'passive', name: 'Пассивный доход', phase: 3, color: '#a78bfa', note: 'Дивиденды и аренда', monthlyBudget: 0 }
    ];
  }
  function defaultState(seed) {
    const state = {
      version: VERSION,
      settings: {
        projectName: 'АРХИТЕКТОР КАПИТАЛА PRO',
        currency: '₽', startCapital: 10000, goal: 100000, monthlyGoal: 0,
        riskFlat: 3, startDate: todayISO(), accent: 'green', demo: false,
        notifyGoal: true, notifyDrawdown: true, notifyMonthly: false,
        csvSeparator: ';', encryptData: false, encryptPassword: '',
        theme: 'dark',
        baseCurrency: '₽',
        currencyRates: {}
      },
      strategies: defaultStrategies(), bets: [], operations: [], archive: []
    };
    if (seed) seedDemo(state);
    return state;
  }
  function seedDemo(state) {
    const t = todayISO();
    const now = new Date().toISOString();
    const demoBets = [
      [-62,'Реал Мадрид — Бетис','Ла Лига','П1',1.85,300,'won',0,'фаворит'],
      [-60,'Манчестер Сити — Арсенал','АПЛ','ТБ 2.5',1.95,250,'lost',0,'лайв'],
      [-57,'Бостон Селтикс — Нью-Йорк','НБА','П1',1.72,300,'won',0,'экспресс'],
      [-54,'Бавария — Боруссия Д','Бундеслига','ОЗ',1.65,350,'won',0,'фаворит'],
      [-51,'Атлетико — Севилья','Ла Лига','ТМ 3.5',1.80,250,'won',0,'статистика'],
      [-47,'Лейкерс — Голден Стэйт','НБА','ТБ 220.5',1.90,300,'lost',0,'лайв'],
      [-44,'ПСЖ — Марсель','Лига 1','П1',1.55,400,'won',0,'фаворит'],
      [-40,'Интер — Милан','Серия А','ОЗ',1.75,300,'void',0,'дерби'],
      [-37,'Тампа-Бэй — Бостон','НХЛ','П1',2.05,200,'won',0,'статистика'],
      [-34,'Арсенал — Челси','АПЛ','ТБ 2.5',1.88,350,'won',0,'дерби'],
      [-31,'Барселона — Атлетико','Ла Лига','П1',1.70,400,'lost',0,'экспресс'],
      [-28,'Милуоки — Майами','НБА','П1',1.62,450,'won',0,'фаворит'],
      [-25,'Наполи — Ювентус','Серия А','ТМ 2.5',1.78,350,'won',0,'статистика'],
      [-22,'Рейнджерс — Пингвины','НХЛ','ТБ 5.5',1.92,250,'lost',0,'лайв'],
      [-19,'Реал Мадрид — Севилья','Ла Лига','П1',1.45,500,'won',0,'фаворит'],
      [-16,'Денвер — Финикс','НБА','ТБ 225.5',1.85,300,'won',0,'экспресс'],
      [-13,'Бавария — Лейпциг','Бундеслига','П1',1.58,400,'won',0,'фаворит'],
      [-10,'Милан — Рома','Серия А','ОЗ',1.72,300,'cashout',390,'дерби'],
      [-7,'Бостон Селтикс — Майами','НБА','П1',1.68,350,'lost',0,'лайв'],
      [-4,'ПСЖ — Ланс','Лига 1','ТБ 2.5',1.80,300,'won',0,'статистика'],
      [-3,'Манчестер Сити — Ливерпуль','АПЛ','ОЗ',1.74,400,'won',0,'дерби'],
      [-2,'Лейкерс — Денвер','НБА','ТБ 228.5',1.86,300,'lost',0,'экспресс'],
      [-1,'Реал Мадрид — Валенсия','Ла Лига','П1',1.50,450,'won',0,'фаворит'],
      [0,'Арсенал — Тоттенхэм','АПЛ','ТБ 2.5',1.90,400,'pending',0,'дерби'],
      [1,'Барселона — Бетис','Ла Лига','П1',1.55,350,'pending',0,'фаворит'],
      [2,'Бостон Селтикс — Нью-Йорк','НБА','П1',1.70,300,'pending',0,'лайв']
    ];
    state.settings.startDate = shiftISO(t, -64);
    state.settings.demo = true;
    state.bets = demoBets.map(function (b, i) {
      return { id: 'demo_bet_' + i, date: shiftISO(t, b[0]), strategyId: 'sport', event: b[1], league: b[2], market: b[3], odds: b[4], stake: b[5], status: b[6], payout: b[7] || 0, tags: b[8] ? [b[8]] : [], note: '', archived: false, createdAt: now };
    });
    state.operations = [
      { id: 'demo_op_1', date: shiftISO(t, -23), type: 'profit', strategyId: 'crypto', amount: 1500, note: 'Спот BTC → USDT, фиксация', tags: ['крипто'], archived: false, createdAt: now },
      { id: 'demo_op_2', date: shiftISO(t, -15), type: 'profit', strategyId: 'stocks', amount: 620, note: 'Дивиденды + рост ETF', tags: ['акции'], archived: false, createdAt: now },
      { id: 'demo_op_3', date: shiftISO(t, -5), type: 'withdraw', strategyId: null, amount: 1500, note: 'Вывод в резерв', tags: [], archived: false, createdAt: now }
    ];
  }

  function sanitizeBet(b) {
    if (!b || typeof b !== 'object') return null;
    const statuses = ['pending', 'won', 'lost', 'void', 'cashout'];
    const tags = Array.isArray(b.tags) ? b.tags : parseTags(b.tags || '');
    return {
      id: String(b.id || uid('bet')), date: parseISO(b.date) ? String(b.date) : todayISO(),
      strategyId: String(b.strategyId || 'sport'), event: String(b.event || 'Событие').slice(0, 80),
      league: String(b.league || '').slice(0, 40), market: String(b.market || '').slice(0, 30),
      odds: Math.max(1, num(b.odds, 1)), stake: Math.max(0, num(b.stake, 0)),
      status: statuses.indexOf(b.status) !== -1 ? b.status : 'pending',
      payout: Math.max(0, num(b.payout, 0)), tags: tags.slice(0, 10),
      note: String(b.note || '').slice(0, 200), archived: Boolean(b.archived),
      createdAt: String(b.createdAt || new Date().toISOString())
    };
  }
  function sanitizeOp(o) {
    if (!o || typeof o !== 'object') return null;
    const types = ['deposit', 'withdraw', 'profit', 'loss'];
    const type = types.indexOf(o.type) !== -1 ? o.type : 'profit';
    const tags = Array.isArray(o.tags) ? o.tags : parseTags(o.tags || '');
    return {
      id: String(o.id || uid('op')), date: parseISO(o.date) ? String(o.date) : todayISO(),
      type: type, strategyId: (type === 'profit' || type === 'loss') ? String(o.strategyId || 'sport') : null,
      amount: Math.max(0, num(o.amount, 0)), tags: tags.slice(0, 10),
      note: String(o.note || '').slice(0, 200), archived: Boolean(o.archived),
      createdAt: String(o.createdAt || new Date().toISOString())
    };
  }
  /**
   * Нормализация и миграция состояния
   * @param {object} obj
   * @returns {import('./types.ts').AppState}
   */
  function normalize(obj) {
    const base = defaultState(false);
    const src = (obj && typeof obj === 'object') ? obj : {};
    const settings = Object.assign({}, base.settings, src.settings || {});
    const state = {
      version: VERSION, settings: settings,
      strategies: Array.isArray(src.strategies) && src.strategies.length ? src.strategies : base.strategies,
      bets: Array.isArray(src.bets) ? src.bets : [],
      operations: Array.isArray(src.operations) ? src.operations : [],
      archive: Array.isArray(src.archive) ? src.archive : []
    };
    if (!state.strategies.some(function (s) { return s.id === 'sport'; })) {
      state.strategies.unshift(base.strategies[0]);
    }
    state.strategies = state.strategies.map(function (s) {
      return {
        id: String(s && s.id || uid('strat')),
        name: String(s && s.name || 'Без названия').slice(0, 40),
        phase: [1, 2, 3].indexOf(Number(s && s.phase)) !== -1 ? Number(s.phase) : 2,
        color: /^#[0-9a-f]{6}$/i.test(String(s && s.color)) ? s.color : PALETTE[0],
        note: String(s && s.note || '').slice(0, 80),
        monthlyBudget: Math.max(0, num(s && s.monthlyBudget, 0))
      };
    });
    const st = state.settings;
    st.projectName = String(st.projectName || 'АРХИТЕКТОР КАПИТАЛА PRO').slice(0, 48);
    st.currency = String(st.currency || '₽').slice(0, 4);
    st.startCapital = Math.max(0, num(st.startCapital, 0));
    st.goal = Math.max(0, num(st.goal, 0));
    st.monthlyGoal = Math.max(0, num(st.monthlyGoal, 0));
    st.riskFlat = Math.min(100, Math.max(0.1, num(st.riskFlat, 3)));
    st.startDate = parseISO(st.startDate) ? String(st.startDate) : todayISO();
    st.accent = ACCENTS.indexOf(st.accent) !== -1 ? st.accent : 'green';
    st.demo = Boolean(st.demo);
    st.notifyGoal = Boolean(st.notifyGoal);
    st.notifyDrawdown = Boolean(st.notifyDrawdown);
    st.notifyMonthly = Boolean(st.notifyMonthly);
    st.csvSeparator = st.csvSeparator || ';';
    st.encryptData = Boolean(st.encryptData);
    st.encryptPassword = String(st.encryptPassword || '');
    st.theme = ['dark', 'light', 'matrix'].indexOf(st.theme) !== -1 ? st.theme : 'dark';
    st.baseCurrency = String(st.baseCurrency || '₽').slice(0, 4);
    st.currencyRates = (st.currencyRates && typeof st.currencyRates === 'object') ? st.currencyRates : {};
    const validStrategy = function (id) { return state.strategies.some(function (s) { return s.id === id; }); };
    state.bets = state.bets.map(sanitizeBet).filter(Boolean);
    state.operations = state.operations.map(sanitizeOp).filter(Boolean);
    state.archive = state.archive.map(function (item) {
      if (item.kind === 'bet') return { kind: 'bet', data: sanitizeBet(item.data) };
      if (item.kind === 'op') return { kind: 'op', data: sanitizeOp(item.data) };
      return null;
    }).filter(Boolean);
    state.bets.forEach(function (b) { if (!validStrategy(b.strategyId)) b.strategyId = 'sport'; });
    state.operations.forEach(function (o) { if (o.strategyId && !validStrategy(o.strategyId)) o.strategyId = 'sport'; });
    return state;
  }

  let loadedState = null;
  /**
   * Загрузка состояния из IndexedDB
   * @returns {Promise<import('./types.ts').AppState>}
   */
  function load() {
    return idbGet().then(function (raw) {
      if (!raw) return defaultState(true);

      // Пытаемся распарсить как обычный JSON
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        // Не валидный JSON — возможно, данные зашифрованы
        const password = prompt('Введите пароль для расшифровки данных:');
        if (!password) return defaultState(true);
        return decryptString(raw, password).then(function (decrypted) {
          return normalize(JSON.parse(decrypted));
        }).catch(function () {
          toast('Неверный пароль', 'error');
          return defaultState(true);
        });
      }

      const state = normalize(parsed);
      loadedState = state;
      return state;
    }).catch(function (e) {
      console.warn('Не удалось прочитать данные из IndexedDB, загружен демо-набор.', e);
      return defaultState(true);
    });
  }
  /**
   * Сохранение состояния в IndexedDB
   * @param {import('./types.ts').AppState} state
   * @returns {Promise<boolean>}
   */
  function save(state) {
    try {
      let data = JSON.stringify(state);
      if (state.settings.encryptData && state.settings.encryptPassword) {
        return encryptString(data, state.settings.encryptPassword).then(function (encrypted) {
          return idbSet(encrypted).then(function () { return true; }).catch(function (e) {
            console.error('Ошибка сохранения в IndexedDB:', e);
            return false;
          });
        }).catch(function (e) {
          console.error('Ошибка шифрования:', e);
          return false;
        });
      }
      return idbSet(data).then(function () { return true; }).catch(function (e) {
        console.error('Ошибка сохранения в IndexedDB:', e);
        return false;
      });
    } catch (e) {
      console.error('Не удалось сохранить данные.', e);
      return Promise.resolve(false);
    }
  }

  /* Расчёты */
  /**
   * Расчёт прибыли по ставке
   * @param {import('./types.ts').Bet} bet
   * @returns {number}
   */
  function betProfit(bet) {
    const stake = num(bet.stake);
    const odds = num(bet.odds);
    switch (bet.status) {
      case 'won': return round2(stake * Math.max(0, odds - 1));
      case 'lost': return -stake;
      case 'cashout': return round2(num(bet.payout) - stake);
      default: return 0;
    }
  }
  /**
   * Знаковое значение операции капитала
   * @param {import('./types.ts').Operation} op
   * @returns {number}
   */
  function opSigned(op) {
    const amount = num(op.amount);
    return round2((op.type === 'withdraw' || op.type === 'loss') ? -amount : amount);
  }
  /**
   * Основные расчёты капитала и статистики
   * @param {import('./types.ts').AppState} state
   * @returns {import('./types.ts').CalcResult}
   */
  function calc(state) {
    const st = state.settings;
    const startCapital = num(st.startCapital);
    let betsProfit = 0, pendingStake = 0, turnover = 0;
    let won = 0, lost = 0, voided = 0, cashouts = 0;
    let oddsSum = 0, oddsCount = 0, settledCount = 0;
    state.bets.forEach(function (b) {
      if (b.archived) return;
      const stake = num(b.stake);
      if (b.status === 'pending') { pendingStake += stake; return; }
      settledCount++;
      betsProfit += betProfit(b);
      if (b.status !== 'void') { turnover += stake; oddsSum += num(b.odds); oddsCount++; }
      if (b.status === 'won') won++;
      else if (b.status === 'lost') lost++;
      else if (b.status === 'void') voided++;
      else if (b.status === 'cashout') cashouts++;
    });
    let deposits = 0, withdrawals = 0, pnl = 0;
    state.operations.forEach(function (o) {
      if (o.archived) return;
      const amount = num(o.amount);
      if (o.type === 'deposit') deposits += amount;
      else if (o.type === 'withdraw') withdrawals += amount;
      else if (o.type === 'profit') pnl += amount;
      else if (o.type === 'loss') pnl -= amount;
    });
    const profit = betsProfit + pnl;
    const capital = startCapital + deposits - withdrawals + profit;
    const invested = startCapital + deposits;
    const available = capital - pendingStake;
    const roi = invested > 0 ? (profit / invested) * 100 : 0;
    const goal = num(st.goal);
    const goalPct = goal > 0 ? Math.max(0, (capital / goal) * 100) : 0;
    const winrate = (won + lost) > 0 ? (won / (won + lost)) * 100 : 0;
    const avgOdds = oddsCount > 0 ? oddsSum / oddsCount : 0;
    const turnoverRoi = turnover > 0 ? (betsProfit / turnover) * 100 : 0;
    const pendingPct = capital > 0 ? (pendingStake / capital) * 100 : 0;
    const flatStake = capital * num(st.riskFlat) / 100;
    const monthKeyNow = todayISO().slice(0, 7);
    const prevMonthKey = monthKey(shiftISO(todayISO().slice(0, 7) + '-01', -1));
    let monthProfit = 0;
    let prevMonthProfit = 0;
    state.bets.forEach(function (b) {
      if (b.archived || b.status === 'pending') return;
      const mk = monthKey(b.date);
      if (mk === monthKeyNow) monthProfit += betProfit(b);
      else if (mk === prevMonthKey) prevMonthProfit += betProfit(b);
    });
    state.operations.forEach(function (o) {
      if (o.archived) return;
      if (o.type === 'profit' || o.type === 'loss') {
        const mk = monthKey(o.date);
        if (mk === monthKeyNow) monthProfit += opSigned(o);
        else if (mk === prevMonthKey) prevMonthProfit += opSigned(o);
      }
    });
    const allSeries = equitySeries(state, 'all');
    let peak = -Infinity, maxDrawdown = 0;
    allSeries.forEach(function (p) {
      peak = Math.max(peak, p.performance);
      if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - p.performance) / peak) * 100);
    });
    const settledBets = state.bets
      .filter(function (b) { return !b.archived && (b.status === 'won' || b.status === 'lost'); })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return String(a.createdAt) < String(b.createdAt) ? -1 : 1;
      });
    let streak = 0, streakType = null;
    for (let i = settledBets.length - 1; i >= 0; i--) {
      if (!streakType) { streakType = settledBets[i].status; streak = 1; }
      else if (settledBets[i].status === streakType) { streak++; }
      else { break; }
    }
    return {
      startCapital, deposits, withdrawals, pnl, betsProfit, profit, capital, invested,
      available, roi, goal, goalPct, monthlyGoal: num(st.monthlyGoal), monthProfit, prevMonthProfit,
      winrate, avgOdds, turnover, turnoverRoi, pendingStake, pendingPct, flatStake,
      maxDrawdown, won, lost, voided, cashouts, settledCount, streak, streakType
    };
  }
  function equitySeries(state, range) {
    const st = state.settings;
    const today = todayISO();
    const events = [];
    state.bets.forEach(function (b) {
      if (b.archived || b.status === 'pending') return;
      events.push({ date: b.date, delta: betProfit(b), perf: betProfit(b) });
    });
    state.operations.forEach(function (o) {
      if (o.archived) return;
      const signed = opSigned(o);
      const perf = (o.type === 'profit' || o.type === 'loss') ? signed : 0;
      events.push({ date: o.date, delta: signed, perf: perf });
    });
    const dates = events.map(function (e) { return e.date; }).filter(Boolean).sort();
    const startISO = [st.startDate, dates[0] || st.startDate, today].sort()[0];
    const start = parseISO(startISO) || new Date();
    const end = parseISO(today) || new Date();
    if (start > end) start.setTime(end.getTime());
    const byDay = {};
    events.forEach(function (e) {
      if (!e.date || e.date < startISO || e.date > today) return;
      if (!byDay[e.date]) byDay[e.date] = { delta: 0, perf: 0 };
      byDay[e.date].delta += e.delta;
      byDay[e.date].perf += e.perf;
    });
    const points = [];
    let value = num(st.startCapital);
    let perf = 0;
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    let guard = 0;
    while (cursor <= endDay && guard < 6000) {
      const dayISO = iso(cursor);
      const ev = byDay[dayISO];
      if (ev) { value += ev.delta; perf += ev.perf; }
      points.push({ date: dayISO, value, profit: perf, performance: num(st.startCapital) + perf });
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
    if (!points.length) points.push({ date: today, value, profit: 0, performance: value });
    if (range === '30' || range === '90') {
      const n = Number(range);
      let sliced = points.slice(Math.max(0, points.length - n));
      if (sliced.length === 1) {
        sliced = [Object.assign({}, sliced[0], { date: shiftISO(sliced[0].date, -1) })].concat(sliced);
      }
      return sliced;
    }
    return points;
  }
  function strategyStats(state) {
    const stats = state.strategies.map(function (s) {
      return Object.assign({}, s, { profit: 0, count: 0, bets: 0, ops: 0, pending: 0, stake: 0 });
    });
    const byId = {};
    stats.forEach(function (s) { byId[s.id] = s; });
    state.bets.forEach(function (b) {
      if (b.archived) return;
      const target = byId[b.strategyId] || byId.sport;
      if (!target) return;
      if (b.status === 'pending') { target.pending++; target.stake += num(b.stake); return; }
      target.profit += betProfit(b); target.count++; target.bets++;
    });
    state.operations.forEach(function (o) {
      if (o.archived) return;
      if (o.type !== 'profit' && o.type !== 'loss') return;
      const target = byId[o.strategyId] || byId.sport;
      if (!target) return;
      target.profit += opSigned(o); target.count++; target.ops++;
    });
    const total = stats.reduce(function (sum, s) { return sum + s.profit; }, 0);
    stats.forEach(function (s) { s.share = total !== 0 ? (s.profit / total) * 100 : 0; });
    return stats;
  }
  function oddsRange(odds) {
    const o = num(odds);
    if (o < 1.5) return '1.01–1.50';
    if (o < 2.0) return '1.51–2.00';
    if (o < 3.0) return '2.01–3.00';
    return '3.01+';
  }
  function analytics(state) {
    const bets = state.bets.filter(function (b) { return !b.archived && b.status !== 'pending' && b.status !== 'void'; });
    const byLeague = {}, byMarket = {}, byOdds = {}, byWeekday = {}, byMonth = {}, byTag = {};
    bets.forEach(function (b) {
      const p = betProfit(b);
      const stake = num(b.stake);
      [byLeague, byMarket, byOdds, byWeekday, byMonth].forEach(function (map, idx) {
        let key;
        if (idx === 0) key = b.league || '—';
        if (idx === 1) key = b.market || '—';
        if (idx === 2) key = oddsRange(b.odds);
        if (idx === 3) key = weekday(b.date) || '—';
        if (idx === 4) key = monthKey(b.date) || '—';
        if (!map[key]) map[key] = { n: 0, won: 0, profit: 0, turnover: 0 };
        map[key].n++; map[key].turnover += stake; map[key].profit += p;
        if (b.status === 'won') map[key].won++;
      });
      (b.tags || []).forEach(function (tag) {
        if (!byTag[tag]) byTag[tag] = { n: 0, won: 0, profit: 0, turnover: 0 };
        byTag[tag].n++; byTag[tag].turnover += stake; byTag[tag].profit += p;
        if (b.status === 'won') byTag[tag].won++;
      });
    });
    function sortEntries(obj) {
      return Object.entries(obj).map(function ([key, val]) {
        return { key, n: val.n, won: val.won, profit: val.profit, turnover: val.turnover,
          winrate: val.n > 0 ? (val.won / val.n) * 100 : 0, roi: val.turnover > 0 ? (val.profit / val.turnover) * 100 : 0 };
      }).sort(function (a, b) { return b.profit - a.profit; });
    }
    return { leagues: sortEntries(byLeague), markets: sortEntries(byMarket), odds: sortEntries(byOdds),
      weekdays: sortEntries(byWeekday), months: sortEntries(byMonth), tags: sortEntries(byTag) };
  }

  function csvEscape(cell) { return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"'; }
  function betsToCSV(state) {
    const sep = state.settings.csvSeparator || ';';
    const rows = [['Дата', 'Направление', 'Событие', 'Турнир', 'Рынок', 'Кэф', 'Ставка', 'Статус', 'P&L', 'Теги', 'Заметка']];
    state.bets.forEach(function (b) {
      if (b.archived) return;
      rows.push([b.date, strategyName(state, b.strategyId), b.event, b.league, b.market,
        num(b.odds).toFixed(2), num(b.stake), b.status, betProfit(b), tagsString(b.tags), b.note]);
    });
    return '\uFEFF' + rows.map(function (row) { return row.map(csvEscape).join(sep); }).join('\r\n');
  }
  function operationsToCSV(state) {
    const sep = state.settings.csvSeparator || ';';
    const rows = [['Дата', 'Тип', 'Направление', 'Сумма', 'Теги', 'Заметка']];
    state.operations.forEach(function (o) {
      if (o.archived) return;
      rows.push([o.date, o.type, o.strategyId ? strategyName(state, o.strategyId) : '—',
        opSigned(o), tagsString(o.tags), o.note]);
    });
    return '\uFEFF' + rows.map(function (row) { return row.map(csvEscape).join(sep); }).join('\r\n');
  }
  function importCSV(text) {
    const sep = state.settings.csvSeparator || ';';
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return null;
    const header = lines[0].split(sep).map(function (h) { return h.replace(/"/g, '').trim(); });
    const bets = [], operations = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep).map(function (c) { return c.replace(/^"|"$/g, '').trim(); });
      const obj = {};
      header.forEach(function (h, idx) { obj[h] = cols[idx] || ''; });
      const type = (obj['Тип'] || obj['TYPE'] || '').toLowerCase();
      if (type === 'прибыль' || type === 'убыток' || type === 'пополнение' || type === 'вывод' || type === 'profit' || type === 'loss' || type === 'deposit' || type === 'withdraw') {
        operations.push({ date: obj['Дата'] || todayISO(), type, strategyId: obj['Направление'] || null,
          amount: num(obj['Сумма'] || 0), tags: parseTags(obj['Теги'] || ''), note: obj['Заметка'] || '' });
      } else {
        bets.push({ date: obj['Дата'] || todayISO(), strategyId: obj['Направление'] || 'sport',
          event: obj['Событие'] || 'Событие', league: obj['Турнир'] || '', market: obj['Рынок'] || '',
          odds: num(obj['Кэф'] || 1), stake: num(obj['Ставка'] || 0),
          status: (obj['Статус'] || 'pending').toLowerCase(),
          payout: num(obj['P&L'] || obj['Выплата'] || 0), tags: parseTags(obj['Теги'] || ''), note: obj['Заметка'] || '' });
      }
    }
    return { bets, operations };
  }
  function strategyName(state, id) {
    const s = state.strategies.find(function (st) { return st.id === id; });
    return s ? s.name : 'Без направления';
  }

  /* ============================================================
     2. CHARTS — SVG-графики
     ============================================================ */

  function escHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shortDate(iso) {
    if (!iso) return '';
    const p = String(iso).split('-');
    return p[2] + '.' + p[1];
  }
  function lineChart(container, points, opts) {
    if (!container) return;
    opts = opts || {};
    const metric = opts.metric === 'profit' ? 'profit' : 'value';
    const accent = opts.accent || '#00ff66';
    const width = Math.max(320, Math.floor(container.clientWidth || 820));
    const height = opts.height || 300;
    const compact = opts.compact || function (v) { return String(Math.round(v)); };
    const format = opts.format || function (v) { return String(v); };
    if (!points || !points.length) {
      container.innerHTML = '<div class="chart-empty"><div class="chart-empty-mark">∅</div><p>НЕТ ДАННЫХ ДЛЯ ПОСТРОЕНИЯ КРИВОЙ</p><span>Добавьте ставку или операцию.</span></div>';
      return;
    }
    const pad = { l: 58, r: 18, t: 20, b: 32 };
    const iw = width - pad.l - pad.r;
    const ih = height - pad.t - pad.b;
    const values = points.map(function (p) { return metric === 'profit' ? p.profit : p.value; });
    let min = Math.min.apply(null, values);
    let max = Math.max.apply(null, values);
    if (metric === 'profit') { min = Math.min(min, 0); max = Math.max(max, 0); }
    if (min === max) { const bump = Math.max(1, Math.abs(min) * 0.1); min -= bump; max += bump; }
    const padV = (max - min) * 0.12; min -= padV; max += padV;
    const span = (max - min) || 1;
    const x = function (i) { return points.length === 1 ? pad.l + iw / 2 : pad.l + (i / (points.length - 1)) * iw; };
    const y = function (v) { return pad.t + (1 - (v - min) / span) * ih; };
    const linePath = points.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + x(i).toFixed(2) + ',' + y(values[i]).toFixed(2);
    }).join(' ');
    const baseY = pad.t + ih;
    const areaPath = linePath + ' L' + x(points.length - 1).toFixed(2) + ',' + baseY + ' L' + x(0).toFixed(2) + ',' + baseY + ' Z';
    let grid = '';
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = min + span * (i / ticks);
      const gy = y(v);
      grid += '<line class="chart-grid-line" x1="' + pad.l + '" y1="' + gy.toFixed(2) + '" x2="' + (width - pad.r) + '" y2="' + gy.toFixed(2) + '"/>';
      grid += '<text class="chart-axis" x="' + (pad.l - 10) + '" y="' + (gy + 4).toFixed(2) + '" text-anchor="end">' + escHtml(compact(v)) + '</text>';
    }
    if (metric === 'profit' && min < 0 && max > 0) {
      const zeroY = y(0);
      grid += '<line class="chart-zero" x1="' + pad.l + '" y1="' + zeroY.toFixed(2) + '" x2="' + (width - pad.r) + '" y2="' + zeroY.toFixed(2) + '"/>';
    }
    let xLabels = '';
    const labelCount = Math.min(5, points.length);
    for (let i = 0; i < labelCount; i++) {
      const idx = labelCount === 1 ? 0 : Math.round(i * (points.length - 1) / (labelCount - 1));
      const anchor = i === 0 ? 'start' : (i === labelCount - 1 ? 'end' : 'middle');
      xLabels += '<text class="chart-axis" x="' + x(idx).toFixed(2) + '" y="' + (height - 9) + '" text-anchor="' + anchor + '">' + shortDate(points[idx].date) + '</text>';
    }
    const lastIndex = points.length - 1;
    const lastX = x(lastIndex);
    const lastY = y(values[lastIndex]);
    container.innerHTML =
      '<svg class="line-svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="График капитала">' +
        '<defs>' +
          '<linearGradient id="caAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" style="stop-color:' + accent + ';stop-opacity:.26"/>' +
            '<stop offset="70%" style="stop-color:' + accent + ';stop-opacity:.05"/>' +
            '<stop offset="100%" style="stop-color:' + accent + ';stop-opacity:0"/>' +
          '</linearGradient>' +
          '<filter id="caGlow" x="-30%" y="-30%" width="160%" height="160%">' +
            '<feGaussianBlur stdDeviation="2.6" result="blur"/>' +
            '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
          '</filter>' +
        '</defs>' +
        grid +
        '<path class="chart-area" d="' + areaPath + '" fill="url(#caAreaGrad)"/>' +
        '<path class="chart-line" d="' + linePath + '" fill="none" stroke="' + accent + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" filter="url(#caGlow)" pathLength="1"/>' +
        '<circle class="chart-pulse" cx="' + lastX.toFixed(2) + '" cy="' + lastY.toFixed(2) + '" r="7" fill="none" stroke="' + accent + '" stroke-width="1"/>' +
        '<circle cx="' + lastX.toFixed(2) + '" cy="' + lastY.toFixed(2) + '" r="3.2" fill="' + accent + '"/>' +
        '<line class="chart-cross" x1="0" y1="' + pad.t + '" x2="0" y2="' + baseY + '" opacity="0"/>' +
        '<circle class="chart-hover-dot" r="4" fill="#03100a" stroke="' + accent + '" stroke-width="2" opacity="0"/>' +
        '<rect class="chart-hit" x="' + pad.l + '" y="' + pad.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/>' +
        xLabels +
      '</svg>' +
      '<div class="chart-tip" aria-hidden="true"></div>';
    const svg = container.querySelector('svg');
    const tip = container.querySelector('.chart-tip');
    const cross = container.querySelector('.chart-cross');
    const dot = container.querySelector('.chart-hover-dot');
    function hide() {
      tip.classList.remove('is-visible');
      cross.setAttribute('opacity', '0');
      dot.setAttribute('opacity', '0');
    }
    function move(ev) {
      const rect = svg.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, (px - pad.l) / iw));
      const idx = Math.round(ratio * (points.length - 1));
      const p = points[idx];
      const v = metric === 'profit' ? p.profit : p.value;
      const cx = x(idx);
      const cy = y(v);
      cross.setAttribute('x1', cx.toFixed(2));
      cross.setAttribute('x2', cx.toFixed(2));
      cross.setAttribute('opacity', '0.55');
      dot.setAttribute('cx', cx.toFixed(2));
      dot.setAttribute('cy', cy.toFixed(2));
      dot.setAttribute('opacity', '1');
      tip.innerHTML = '<span class="tip-date">' + escHtml(opts.dateFormat ? opts.dateFormat(p.date) : p.date) + '</span><strong>' + escHtml(format(v)) + '</strong>';
      tip.classList.add('is-visible');
      const tipWidth = 170;
      const left = Math.max(6, Math.min(width - tipWidth - 6, cx - tipWidth / 2));
      const top = Math.max(6, cy - 66);
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', hide);
  }
  function donutChart(container, slices, opts) {
    if (!container) return;
    opts = opts || {};
    const size = 184;
    const cx = size / 2;
    const cy = size / 2;
    const r = 66;
    const stroke = 17;
    const circumference = 2 * Math.PI * r;
    const positive = (slices || []).filter(function (s) { return s.value > 0; });
    const total = positive.reduce(function (sum, s) { return sum + s.value; }, 0);
    let segments = '';
    let offset = 0;
    positive.forEach(function (s) {
      const frac = s.value / total;
      const len = Math.max(0, frac * circumference - 3);
      segments += '<circle class="donut-seg" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + escHtml(s.color) + '" stroke-width="' + stroke + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (circumference - len).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      offset += frac * circumference;
    });
    const centerValue = opts.centerValue || '';
    const centerLabel = opts.centerLabel || '';
    container.innerHTML =
      '<div class="donut">' +
        '<svg class="donut-svg" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + escHtml(opts.ariaLabel || 'Структура прибыли') + '">' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="' + stroke + '" stroke-dasharray="2 7"/>' +
          segments +
        '</svg>' +
        '<div class="donut-center"><strong>' + escHtml(centerValue) + '</strong><span>' + escHtml(centerLabel) + '</span></div>' +
      '</div>';
  }

  /* ============================================================
     3. CORE — состояние, утилиты, инициализация
     ============================================================ */

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function debounce(fn, ms) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  const STATUS = {
    pending: { label: 'В ИГРЕ', cls: 'pending' },
    won: { label: 'ВЫИГРЫШ', cls: 'won' },
    lost: { label: 'ПРОИГРЫШ', cls: 'lost' },
    void: { label: 'ВОЗВРАТ', cls: 'void' },
    cashout: { label: 'КЭШАУТ', cls: 'cashout' }
  };
  const OP = {
    deposit: { label: 'ПОПОЛНЕНИЕ', short: 'ДЕПОЗИТ', cls: 'deposit' },
    withdraw: { label: 'ВЫВОД', short: 'ВЫВОД', cls: 'withdraw' },
    profit: { label: 'ПРИБЫЛЬ', short: 'P&L +', cls: 'profit' },
    loss: { label: 'УБЫТОК', short: 'P&L −', cls: 'loss' }
  };

  let state = defaultState(true);
  const ui = {
    tab: 'dashboard', chartMetric: 'value', chartRange: 'all',
    betFilter: 'all', betSearch: '', journalFilter: 'all', journalSearch: '',
    archiveFilter: 'all', archiveSearch: '', editingBet: null, editingOp: null,
    calendarDate: null, calendarSelectedDate: null,
    betSort: { field: 'date', dir: 'desc' }
  };

  function money(value, opts) {
    opts = opts || {};
    const v = num(value);
    const cur = opts.currency || state.settings.currency;
    const base = state.settings.baseCurrency || '₽';
    let converted = v;
    if (cur !== base) {
      converted = convertCurrency(v, base, cur);
    }
    return formatMoney(converted, cur, opts);
  }
  function signedMoney(value) { return money(value, { sign: true }); }
  function pct(value, digits) { return formatPercent(value, digits == null ? 1 : digits); }
  function signedPct(value, digits) { return (value > 0 ? '+' : '') + pct(value, digits); }
  function compactMoney(value) { return (value > 0 ? '+' : '') + formatCompact(value) + ' ' + state.settings.currency; }
  function plural(n, one, few, many) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }
  function strategyById(id) { return state.strategies.filter(function (s) { return s.id === id; })[0] || null; }
  function strategyNameLocal(id) { const s = strategyById(id); return s ? s.name : 'Без направления'; }

  /* Уведомления */
  function requestNotifications() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return null;
  }
  function askNotifications() {
    if (!('Notification' in window)) return;
    Notification.requestPermission();
  }
  function notify(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: body, icon: 'neo-kannep-mark.svg' });
    }
  }
  function checkNotifications(m) {
    const st = state.settings;
    if (!st.notifyGoal && !st.notifyDrawdown && !st.notifyMonthly) return;
    const perm = requestNotifications();
    if (perm !== true) return;
    if (st.notifyGoal && st.goal > 0 && m.capital >= st.goal) {
      notify('Цель проекта достигнута', 'Капитал ' + money(m.capital) + ' превысил цель ' + money(st.goal));
    }
    if (st.notifyDrawdown && m.maxDrawdown >= 10) {
      notify('Просадка ' + pct(m.maxDrawdown), 'Максимальная просадка достигла ' + pct(m.maxDrawdown));
    }
    if (st.notifyMonthly && st.monthlyGoal > 0 && m.monthProfit >= st.monthlyGoal) {
      notify('Месячная цель прибыли', 'Прибыль за месяц: ' + signedMoney(m.monthProfit));
    }
  }

  function toast(message, type, undoFn) {
    const toasts = $('#toasts');
    if (!toasts) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    let undoHtml = '';
    if (undoFn) {
      undoHtml = '<button class="toast-undo" data-undo>ОТМЕНА</button>';
    }
    el.innerHTML = '<span class="toast-mark">▶</span><span>' + escHtml(message) + '</span>' + undoHtml;
    toasts.appendChild(el);
    if (undoFn) {
      const undoBtn = el.querySelector('[data-undo]');
      undoBtn.addEventListener('click', function () {
        undoFn();
        el.classList.add('is-out');
        setTimeout(function () { el.remove(); }, 300);
      });
    }
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 300);
    }, undoFn ? 5000 : 3000);
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
  }

  function openDialog(dlg) {
    if (!dlg) return;
    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
  }

  /* ============================================================
     4. ИНИЦИАЛИЗАЦИЯ И ЗАПУСК
     ============================================================ */

  function init() {
    const perm = requestNotifications();
    if (perm === null) askNotifications();

    const loadResult = load();
    if (typeof loadResult === 'then' || (loadResult && typeof loadResult.then === 'function')) {
      loadResult.then(function (loadedState) {
        state = loadedState;
        renderChrome();
        bindEvents();
        renderActive();
        startClock();
        startMatrix();
        fetchCurrencyRates();
        hideLoadingOverlay();
      }).catch(function () {
        state = defaultState(true);
        renderChrome();
        bindEvents();
        renderActive();
        startClock();
        startMatrix();
        fetchCurrencyRates();
        hideLoadingOverlay();
      });
    } else {
      state = loadResult;
      renderChrome();
      bindEvents();
      renderActive();
      startClock();
      startMatrix();
      hideLoadingOverlay();
    }
  }

  function hideLoadingOverlay() {
    const overlay = $('#loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function bindEvents() {
    document.addEventListener('click', onClick);

    const betForm = $('#betForm');
    if (betForm) {
      betForm.addEventListener('submit', submitBet);
      ['odds', 'stake', 'payout', 'status'].forEach(function (name) {
        const field = betForm.elements[name];
        if (!field) return;
        field.addEventListener('input', updateBetFormState);
        field.addEventListener('change', updateBetFormState);
      });
    }
    const opForm = $('#opForm');
    if (opForm) {
      opForm.addEventListener('submit', submitOp);
      if (opForm.elements.type) opForm.elements.type.addEventListener('change', updateOpFormState);
    }
    const strategyForm = $('#strategyForm');
    if (strategyForm) strategyForm.addEventListener('submit', submitStrategy);
    const settingsForm = $('#settingsForm');
    if (settingsForm) settingsForm.addEventListener('submit', submitSettings);
    const betSearch = $('#betSearch');
    if (betSearch) betSearch.addEventListener('input', function (e) {
      ui.betSearch = e.target.value;
      renderBets();
    });
    const journalSearch = $('#journalSearch');
    if (journalSearch) journalSearch.addEventListener('input', function (e) {
      ui.journalSearch = e.target.value;
      renderJournal();
    });
    const archiveSearch = $('#archiveSearch');
    if (archiveSearch) archiveSearch.addEventListener('input', function (e) {
      ui.archiveSearch = e.target.value;
      renderArchive();
    });

    /* ---------- групповые действия со ставками ---------- */
    ui.selectedBets = [];

    function updateBulkCounter() {
      const el = $('#bulkCount');
      if (el) el.textContent = String(ui.selectedBets.length);
    }

    document.addEventListener('change', function (e) {
      if (e.target.matches('.bet-checkbox')) {
        const id = e.target.dataset.id;
        const row = e.target.closest('tr');
        if (e.target.checked) {
          if (ui.selectedBets.indexOf(id) === -1) ui.selectedBets.push(id);
          if (row) row.classList.add('selected-row');
        } else {
          ui.selectedBets = ui.selectedBets.filter(function (x) { return x !== id; });
          if (row) row.classList.remove('selected-row');
        }
        updateBulkCounter();
      }
      if (e.target.id === 'selectAllBets') {
        const checkboxes = document.querySelectorAll('.bet-checkbox');
        const checkAll = e.target.checked;
        checkboxes.forEach(function (cb) {
          cb.checked = checkAll;
          const id = cb.dataset.id;
          const row = cb.closest('tr');
          if (checkAll) {
            if (ui.selectedBets.indexOf(id) === -1) ui.selectedBets.push(id);
            if (row) row.classList.add('selected-row');
          } else {
            ui.selectedBets = ui.selectedBets.filter(function (x) { return x !== id; });
            if (row) row.classList.remove('selected-row');
          }
        });
        updateBulkCounter();
      }
    });

    const importFile = $('#importFile');
    if (importFile) importFile.addEventListener('change', importFileJson);
    const importFileCsv = $('#importFileCsv');
    if (importFileCsv) importFileCsv.addEventListener('change', importCsvFile);
    window.addEventListener('resize', debounce(function () {
      if (ui.tab === 'dashboard') renderDashboard();
      else if (ui.tab === 'analytics') renderAnalytics();
      else if (ui.tab === 'calendar') renderCalendar();
    }, 180));

    /* Подтверждение при закрытии вкладки, если есть данные */
    window.addEventListener('beforeunload', function (e) {
      try {
        if (state && state.bets && state.bets.length > 0) {
          e.preventDefault();
          e.returnValue = '';
        }
      } catch (e) { /* ignore */ }
    });

    /* Глобальный поиск по Ctrl+K */
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openGlobalSearchDialog();
      }
    });

    const globalSearchForm = $('#globalSearchForm');
    if (globalSearchForm) {
      globalSearchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const query = globalSearchForm.elements.query.value;
        renderGlobalSearchResults(query);
      });
      const globalSearchInput = globalSearchForm.elements.query;
      if (globalSearchInput) {
        globalSearchInput.addEventListener('input', function (e) {
          renderGlobalSearchResults(e.target.value);
        });
      }
    }

    /* Обработка кликов по результатам глобального поиска */
    document.addEventListener('click', function (e) {
      const gotoBtn = e.target.closest('[data-action="goto-bet"], [data-action="goto-op"]');
      if (gotoBtn) {
        const action = gotoBtn.dataset.action;
        const id = gotoBtn.dataset.id;
        if (action === 'goto-bet') gotoBet(id);
        else if (action === 'goto-op') gotoOp(id);
      }
    });
  }

  function onClick(e) {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) {
      const dlg = closeBtn.closest('dialog');
      if (dlg) dlg.close();
      return;
    }
    if (e.target.tagName === 'DIALOG') {
      e.target.close();
      return;
    }
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) { handleAction(actionBtn.dataset.action, actionBtn); return; }
    const betFilter = e.target.closest('[data-bet-filter]');
    if (betFilter) { ui.betFilter = betFilter.dataset.betFilter; renderBets(); return; }
    const journalFilter = e.target.closest('[data-journal-filter]');
    if (journalFilter) { ui.journalFilter = journalFilter.dataset.journalFilter; renderJournal(); return; }
    const archiveFilter = e.target.closest('[data-archive-filter]');
    if (archiveFilter) { ui.archiveFilter = archiveFilter.dataset.archiveFilter; renderArchive(); return; }
    const metricBtn = e.target.closest('[data-metric]');
    if (metricBtn) { ui.chartMetric = metricBtn.dataset.metric; renderDashboard(); return; }
    const rangeBtn = e.target.closest('[data-range]');
    if (rangeBtn) { ui.chartRange = rangeBtn.dataset.range; renderDashboard(); return; }
    const quickBtn = e.target.closest('[data-quick]');
    if (quickBtn) {
      if (quickBtn.dataset.quick === 'kelly') applyKellyStake();
      else applyQuickStake(num(quickBtn.dataset.quick));
      return;
    }
    const bulkStatusBtn = e.target.closest('[data-bulk-status]');
    if (bulkStatusBtn) {
      $$('[data-bulk-status]').forEach(function (btn) {
        btn.classList.toggle('is-active', btn === bulkStatusBtn);
      });
      return;
    }
    const calendarDay = e.target.closest('[data-date]');
    if (calendarDay && e.target.closest('#calendarGrid')) {
      const date = calendarDay.dataset.date;
      if (date) {
        ui.calendarSelectedDate = date;
        renderCalendarDayDetail(date);
      }
      return;
    }
    const sortHeader = e.target.closest('th.sortable');
    if (sortHeader) {
      const field = sortHeader.dataset.sort;
      if (ui.betSort.field === field) {
        ui.betSort.dir = ui.betSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        ui.betSort.field = field;
        ui.betSort.dir = 'desc';
      }
      renderSortIndicators();
      renderBets();
      return;
    }
  }

  function setTab(tab) {
    if (!document.getElementById('view-' + tab)) return;
    ui.tab = tab;
    $$('.tab').forEach(function (btn) {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    $$('.view').forEach(function (view) {
      view.classList.toggle('is-active', view.dataset.view === tab);
    });
    renderActive();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderActive() {
    renderChrome();
    checkNotifications(calc(state));
    if (ui.tab === 'dashboard') renderDashboard();
    else if (ui.tab === 'bets') renderBets();
    else if (ui.tab === 'capital') renderCapital();
    else if (ui.tab === 'analytics') renderAnalytics();
    else if (ui.tab === 'journal') renderJournal();
    else if (ui.tab === 'archive') renderArchive();
    else if (ui.tab === 'calendar') renderCalendar();
    else if (ui.tab === 'settings') renderSettings();
  }

  function commit(message, type) {
    state.settings.demo = false;
    const saveResult = save(state);
    if (typeof saveResult === 'then' || (saveResult && typeof saveResult.then === 'function')) {
      saveResult.then(function (ok) {
        if (!ok) return toast('Не удалось сохранить данные в браузере', 'error');
        renderActive();
        if (message) toast(message, type || 'success');
      }).catch(function () {
        toast('Ошибка сохранения', 'error');
      });
    } else {
      if (!saveResult) return toast('Не удалось сохранить данные в браузере', 'error');
      renderActive();
      if (message) toast(message, type || 'success');
    }
  }

  function renderChrome() {
    const st = state.settings;
    document.title = st.projectName + ' // ТРЕКЕР КАПИТАЛА PRO';
    document.body.dataset.accent = st.accent;
    document.body.dataset.theme = st.theme;
    const title = $('#brandTitle');
    if (title) {
      title.textContent = st.projectName;
      title.setAttribute('data-text', st.projectName);
    }
    const accentBtn = $('#accentBtn');
    if (accentBtn) accentBtn.textContent = 'РЕЖИМ: ' + st.accent.toUpperCase();
    const demoBadge = $('#demoBadge');
    if (demoBadge) demoBadge.hidden = !st.demo;
    const stats = strategyStats(state);
    const phase2 = stats.some(function (s) { return s.id !== 'sport' && s.count > 0; });
    const phase3 = stats.some(function (s) { return s.phase === 3 && s.count > 0; });
    const phaseChip = $('#phaseChip');
    if (phaseChip) {
      phaseChip.textContent = phase3
        ? 'ФАЗА 03 // ПАССИВНЫЙ ДОХОД'
        : (phase2 ? 'ФАЗА 02 // МУЛЬТИ-КАПИТАЛ' : 'ФАЗА 01 // СТАВКИ');
    }
    if (window.__matrixAccent) window.__matrixAccent();
  }

  /* ============================================================
     5. ДАШБОРД
     ============================================================ */

  function renderDashboard() {
    const m = calc(state);
    const stats = strategyStats(state);
    const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#00ff66';
    $('#kpiGrid').innerHTML = kpiMarkup(m);
    $('#discipline').innerHTML = disciplineMarkup(m);
    lineChart($('#equityChart'), equitySeries(state, ui.chartRange), {
      metric: ui.chartMetric, height: 360, accent: accent,
      compact: formatCompact,
      format: function (v) { return money(v); },
      dateFormat: function (iso) { return formatDate(iso, 'full') + ' · ' + weekday(iso); }
    });
    renderProfitDonut(m, stats);
    renderRecent();
    renderRoadmap(stats);
    syncChartControls();
  }
  function kpiMarkup(m) {
    const profitClass = m.profit >= 0 ? 'up' : 'down';
    const goalPct = Math.min(100, Math.max(0, m.goalPct));
    const remaining = Math.max(0, m.goal - m.capital);
    const goalReached = m.goal > 0 && m.capital >= m.goal;
    return '' +
      '<article class="kpi">' +
        '<div class="kpi-top"><span class="kpi-label">[01] // КАПИТАЛ ПРОЕКТА</span><span class="kpi-glyph">◈</span></div>' +
        '<div class="kpi-value">' + money(m.capital) + '</div>' +
        '<div class="kpi-foot"><span class="' + profitClass + '">' + (m.roi >= 0 ? '▲' : '▼') + ' ' + pct(Math.abs(m.roi)) + ' ROI</span><span>вложено ' + money(m.invested) + '</span></div>' +
      '</article>' +
      '<article class="kpi">' +
        '<div class="kpi-top"><span class="kpi-label">[02] // ЧИСТАЯ ПРИБЫЛЬ</span><span class="kpi-glyph">▲</span></div>' +
        '<div class="kpi-value ' + profitClass + '">' + signedMoney(m.profit) + '</div>' +
        '<div class="kpi-foot"><span class="' + (m.monthProfit >= 0 ? 'up' : 'down') + '">' + (m.monthProfit >= 0 ? '▲' : '▼') + ' ' + signedMoney(m.monthProfit) + '</span><span>за месяц</span>' +
        (m.prevMonthProfit != null ? '<span class="compare">' + (m.monthProfit >= m.prevMonthProfit ? '▲' : '▼') + ' ' + pct(m.prevMonthProfit !== 0 ? ((m.monthProfit - m.prevMonthProfit) / Math.abs(m.prevMonthProfit)) * 100 : 0) + ' vs прошлый</span>' : '') +
        '</div>' +
      '</article>' +
      '<article class="kpi">' +
        '<div class="kpi-top"><span class="kpi-label">[03] // СВОБОДНЫЙ БАНК</span><span class="kpi-glyph">⚿</span></div>' +
        '<div class="kpi-value">' + money(m.available) + '</div>' +
        '<div class="kpi-foot"><span class="' + (m.pendingPct > 10 ? 'warn' : '') + '">в игре ' + money(m.pendingStake) + '</span><span>' + pct(m.pendingPct) + ' банка</span></div>' +
      '</article>' +
      '<article class="kpi">' +
        '<div class="kpi-top"><span class="kpi-label">[04] // ЦЕЛЬ ПРОЕКТА</span><span class="kpi-glyph">◎</span></div>' +
        '<div class="kpi-value">' + pct(m.goalPct) + '</div>' +
        '<div class="kpi-progress"><span style="width:' + goalPct + '%"></span></div>' +
        '<div class="kpi-foot"><span>' + (goalReached ? 'ЦЕЛЬ ДОСТИГНУТА' : 'осталось ' + money(remaining)) + '</span><span>' + money(m.goal) + '</span></div>' +
      '</article>';
  }
  function disciplineMarkup(m) {
    const circumference = 2 * Math.PI * 68;
    const progress = Math.min(1, Math.max(0, m.goalPct / 100));
    const offset = circumference * (1 - progress);
    const streakValue = m.streakType ? (m.streakType === 'won' ? '+' : '−') + m.streak : '—';
    const streakClass = m.streakType === 'won' ? 'up' : (m.streakType === 'lost' ? 'down' : '');
    const ddClass = m.maxDrawdown >= 10 ? 'warn' : '';
    return '' +
      '<div class="goal-ring-wrap">' +
        '<div class="goal-ring">' +
          '<svg viewBox="0 0 160 160" aria-hidden="true">' +
            '<circle class="ring-bg" cx="80" cy="80" r="68"/>' +
            '<circle class="ring-fg" cx="80" cy="80" r="68" stroke-dasharray="' + circumference.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"/>' +
          '</svg>' +
          '<div class="goal-ring-label"><strong>' + pct(m.goalPct) + '</strong><span>ДО ЦЕЛИ</span></div>' +
        '</div>' +
        '<div class="goal-copy">' +
          '<div class="kpi-label">ЦЕЛЬ ПРОЕКТА</div>' +
          '<div class="goal-value">' + money(m.goal) + '</div>' +
          '<div class="goal-sub">' + (m.goal > 0 && m.capital >= m.goal ? 'СИСТЕМА ВЗЛОМАНА // ЦЕЛЬ ДОСТИГНУТА' : 'осталось ' + money(Math.max(0, m.goal - m.capital))) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="protocol">' +
        '<div class="protocol-row"><span>Флэт-ставка (' + pct(state.settings.riskFlat) + ')</span><b>' + money(m.flatStake) + '</b></div>' +
        '<div class="protocol-row"><span>В игре</span><b class="' + (m.pendingPct > 10 ? 'warn' : '') + '">' + money(m.pendingStake) + ' <em>' + pct(m.pendingPct) + '</em></b></div>' +
        '<div class="protocol-row"><span>Макс. просадка</span><b class="' + ddClass + '">' + pct(m.maxDrawdown) + '</b></div>' +
        '<div class="protocol-row"><span>Winrate</span><b>' + pct(m.winrate) + '</b></div>' +
        '<div class="protocol-row"><span>Серия</span><b class="' + streakClass + '">' + streakValue + '</b></div>' +
      '</div>' +
      '<blockquote class="mascot-quote">' +
        '<div class="mascot-mini"><img src="neo-kannep-mark.svg" alt="Neo-Kannep"></div>' +
        '<div><p>«Система важнее эмоций. Капитал любит холодный расчёт.»</p><cite>NEO-KANNEP // THE ORACLE BROKER</cite></div>' +
      '</blockquote>';
  }
  function renderProfitDonut(m, stats) {
    const slices = stats.filter(function (s) { return s.profit > 0; })
      .map(function (s) { return { label: s.name, value: s.profit, color: s.color }; });
    const totalPositive = slices.reduce(function (sum, s) { return sum + s.value; }, 0);
    donutChart($('#profitDonut'), slices, {
      centerValue: compactMoney(m.profit), centerLabel: 'ПРИБЫЛЬ',
      ariaLabel: 'Структура прибыли по направлениям'
    });
    if (!slices.length) {
      $('#profitLegend').innerHTML = '<div class="legend-empty">// ПРИБЫЛИ ПОКА НЕТ — СИСТЕМА ЖДЁТ ПЕРВЫХ ДАННЫХ</div>';
      return;
    }
    $('#profitLegend').innerHTML = slices.map(function (s) {
      const share = totalPositive > 0 ? (s.value / totalPositive) * 100 : 0;
      return '<div class="legend-row">' +
        '<span class="legend-dot" style="--dot:' + escHtml(s.color) + '"></span>' +
        '<span class="legend-name">' + escHtml(s.label) + '</span>' +
        '<span class="legend-value">' + money(s.value) + '</span>' +
        '<span class="legend-share">' + pct(share) + '</span>' +
      '</div>';
    }).join('');
  }
  function renderRecent() {
    const entries = buildEntries().slice(0, 7);
    if (!entries.length) {
      $('#recentList').innerHTML = '<div class="empty-state"><div class="empty-glyph">// 0x00</div><p>ЛЕНТА ПУСТА</p><span>Добавьте первую ставку или операцию капитала.</span><button class="btn btn-ghost" type="button" data-action="new-bet">+ ДОБАВИТЬ СТАВКУ</button></div>';
      return;
    }
    $('#recentList').innerHTML = entries.map(function (e) {
      return '<div class="recent-row">' +
        '<span class="recent-date">' + formatDate(e.date, 'short') + '</span>' +
        '<span class="recent-icon ' + (e.kind === 'op' ? 'is-op' : '') + '">' + (e.kind === 'bet' ? '⚽' : '◈') + '</span>' +
        '<div class="recent-main"><div class="recent-title">' + escHtml(e.title) + '</div><div class="recent-meta">' + escHtml(e.meta) + '</div></div>' +
        '<div class="recent-amount ' + (e.pending ? 'is-pending' : (e.amount >= 0 ? 'up' : 'down')) + '">' + (e.pending ? '— ' + money(e.stake) : signedMoney(e.amount)) + '</div>' +
      '</div>';
    }).join('');
  }
  function renderRoadmap(stats) {
    const phase2 = stats.some(function (s) { return s.id !== 'sport' && s.count > 0; });
    const phase3 = stats.some(function (s) { return s.phase === 3 && s.count > 0; });
    const items = [
      { n: '01', title: 'СПОРТ-БЕТТИНГ', sub: 'Банкролл, флэт, дисциплина', cls: phase2 ? 'is-done' : 'is-active', status: phase2 ? 'ЗАВЕРШЕНА' : 'АКТИВНА' },
      { n: '02', title: 'МУЛЬТИ-КАПИТАЛ', sub: 'Крипто, акции, фонды', cls: phase3 ? 'is-done' : (phase2 ? 'is-active' : ''), status: phase3 ? 'ЗАВЕРШЕНА' : (phase2 ? 'АКТИВНА' : 'ОЖИДАЕТ') },
      { n: '03', title: 'ПАССИВНЫЙ ДОХОД', sub: 'Дивиденды, аренда, стейкинг', cls: phase3 ? 'is-active' : '', status: phase3 ? 'АКТИВНА' : 'ЗАБЛОКИРОВАНА' }
    ];
    $('#roadmap').innerHTML = items.map(function (item) {
      return '<div class="roadmap-item ' + item.cls + '">' +
        '<div class="roadmap-num">' + item.n + '</div>' +
        '<div><div class="roadmap-title">' + item.title + '</div><div class="roadmap-sub">' + item.sub + '</div><div class="roadmap-status">// ' + item.status + '</div></div>' +
      '</div>';
    }).join('');
  }
  function syncChartControls() {
    $$('[data-metric]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.metric === ui.chartMetric);
    });
    $$('[data-range]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.range === ui.chartRange);
    });
  }

  /* ============================================================
     6. СТАВКИ
     ============================================================ */

  function renderBets() {
    const m = calc(state);
    const pendingCount = state.bets.filter(function (b) { return !b.archived && b.status === 'pending'; }).length;
    const stats = [
      ['ВСЕГО СТАВОК', String(state.bets.filter(function (b) { return !b.archived; }).length), ''],
      ['В ИГРЕ', String(pendingCount), pendingCount ? 'warn' : ''],
      ['WINRATE', pct(m.winrate), m.winrate >= 50 ? 'up' : 'down'],
      ['ROI СТАВОК', signedPct(m.turnoverRoi), m.turnoverRoi >= 0 ? 'up' : 'down'],
      ['ОБОРОТ', money(m.turnover), ''],
      ['СРЕДНИЙ КЭФ', m.avgOdds ? m.avgOdds.toFixed(2).replace('.', ',') : '—', '']
    ];
    $('#betStats').innerHTML = stats.map(function (row) {
      return '<div class="stat-chip"><span>' + row[0] + '</span><b class="' + row[2] + '">' + row[1] + '</b></div>';
    }).join('');
    $$('[data-bet-filter]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.betFilter === ui.betFilter);
    });
    const query = ui.betSearch.trim().toLowerCase();
    const rows = state.bets.filter(function (b) {
      if (b.archived && ui.betFilter !== 'archived') return false;
      if (!b.archived && ui.betFilter === 'archived') return false;
      if (ui.betFilter !== 'all' && ui.betFilter !== 'archived' && b.status !== ui.betFilter) return false;
      if (!query) return true;
      return [b.event, b.league, b.market, b.note, tagsString(b.tags), formatDate(b.date), weekday(b.date)]
        .join(' ').toLowerCase().indexOf(query) !== -1;
    }).sort(function (a, b) {
      const s = ui.betSort;
      let cmp = 0;
      if (s.field === 'date') cmp = a.date.localeCompare(b.date);
      else if (s.field === 'event') cmp = String(a.event).localeCompare(String(b.event));
      else if (s.field === 'stake') cmp = num(a.stake) - num(b.stake);
      else if (s.field === 'odds') cmp = num(a.odds) - num(b.odds);
      else if (s.field === 'profit') cmp = betProfit(a) - betProfit(b);
      return s.dir === 'desc' ? -cmp : cmp;
    });
    const tbody = $('#betsTable tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state" style="border:0;background:none;padding:24px 10px">' +
        '<div class="empty-glyph">// 0x00</div><p>ЗАПИСЕЙ НЕ НАЙДЕНО</p><span>Измените фильтр или добавьте новую ставку.</span>' +
        '<button class="btn btn-ghost" type="button" data-action="new-bet">+ ДОБАВИТЬ СТАВКУ</button></div></td></tr>';
      $('#bulkActions').style.display = 'none';
      return;
    }
    $('#bulkActions').style.display = 'flex';
    tbody.innerHTML = rows.map(betRow).join('');
    renderSortIndicators();
  }
  function betRow(b) {
    const status = STATUS[b.status];
    const profit = betProfit(b);
    const pnl = b.status === 'pending'
      ? '<span class="pnl-flat">—</span>'
      : '<span class="' + (profit > 0 ? 'pnl-up' : (profit < 0 ? 'pnl-down' : 'pnl-flat')) + '">' + signedMoney(profit) + '</span>';
    const actions = [];
    if (b.status === 'pending' && !b.archived) {
      actions.push('<button class="mini-btn is-win" type="button" data-action="settle-bet" data-id="' + escHtml(b.id) + '" data-status="won" title="Отметить выигрыш" aria-label="Отметить выигрыш">✓</button>');
      actions.push('<button class="mini-btn is-loss" type="button" data-action="settle-bet" data-id="' + escHtml(b.id) + '" data-status="lost" title="Отметить проигрыш" aria-label="Отметить проигрыш">✕</button>');
      actions.push('<button class="mini-btn is-void" type="button" data-action="settle-bet" data-id="' + escHtml(b.id) + '" data-status="void" title="Отметить возврат" aria-label="Отметить возврат">↩</button>');
    }
    if (!b.archived) {
      actions.push('<button class="mini-btn" type="button" data-action="edit-bet" data-id="' + escHtml(b.id) + '" title="Редактировать" aria-label="Редактировать">✎</button>');
      actions.push('<button class="mini-btn is-del" type="button" data-action="archive-bet" data-id="' + escHtml(b.id) + '" title="В архив" aria-label="В архив">▭</button>');
      actions.push('<button class="mini-btn" type="button" data-action="export-bet-json" data-id="' + escHtml(b.id) + '" title="Экспортировать ставку в JSON">💾</button>');
    } else {
      actions.push('<button class="mini-btn is-del" type="button" data-action="restore-bet" data-id="' + escHtml(b.id) + '" title="Восстановить" aria-label="Восстановить">↻</button>');
      actions.push('<button class="mini-btn is-del" type="button" data-action="delete-bet" data-id="' + escHtml(b.id) + '" title="Удалить безвозвратно" aria-label="Удалить безвозвратно">×</button>');
      actions.push('<button class="mini-btn" type="button" data-action="export-bet-json" data-id="' + escHtml(b.id) + '" title="Экспортировать ставку в JSON">💾</button>');
    }
    const meta = [b.league, b.market].filter(Boolean).join(' · ') || '—';
    const tagsHtml = (b.tags || []).length ? '<span class="tag-row">' + (b.tags || []).map(function (t) { return '<span class="tag">' + escHtml(t) + '</span>'; }).join('') + '</span>' : '<span class="tag-row">—</span>';
    return '<tr>' +
      '<td class="select-col"><input type="checkbox" class="bet-checkbox" data-id="' + escHtml(b.id) + '"></td>' +
      '<td>' + formatDate(b.date, 'short') + '<div class="event-meta">' + weekday(b.date) + '</div></td>' +
      '<td class="event-cell"><div class="event-name">' + escHtml(b.event) + '</div><div class="event-meta">' + escHtml(meta) + '</div></td>' +
      '<td class="num odds-cell">' + num(b.odds).toFixed(2) + '</td>' +
      '<td class="num money-cell">' + money(b.stake) + '</td>' +
      '<td class="tags-cell">' + tagsHtml + '</td>' +
      '<td><span class="status ' + status.cls + '">' + status.label + '</span></td>' +
      '<td class="num">' + pnl + '</td>' +
      '<td class="actions-col"><div class="row-actions">' + actions.join('') + '</div></td>' +
    '</tr>';
  }

  function renderSortIndicators() {
    $$('th.sortable').forEach(function (th) {
      const field = th.dataset.sort;
      const indicator = th.querySelector('.sort-indicator');
      const isActive = ui.betSort.field === field;
      th.classList.toggle('active', isActive);
      if (indicator) {
        if (isActive) {
          indicator.textContent = ui.betSort.dir === 'asc' ? '▴' : '▾';
        } else {
          indicator.textContent = '';
        }
      }
    });
  }

  function openBetDialog(bet) {
    ui.editingBet = bet ? bet.id : null;
    const form = $('#betForm');
    form.reset();
    form.elements.strategyId.innerHTML = state.strategies.map(function (s) {
      return '<option value="' + escHtml(s.id) + '">' + escHtml(s.name) + '</option>';
    }).join('');
    form.elements.date.value = bet ? bet.date : todayISO();
    form.elements.strategyId.value = bet ? bet.strategyId : 'sport';
    form.elements.event.value = bet ? bet.event : '';
    form.elements.league.value = bet ? bet.league : '';
    form.elements.market.value = bet ? bet.market : '';
    form.elements.odds.value = bet ? bet.odds : '';
    form.elements.stake.value = bet ? bet.stake : '';
    form.elements.status.value = bet ? bet.status : 'pending';
    form.elements.payout.value = bet && bet.status === 'cashout' ? bet.payout : '';
    form.elements.tags.value = bet ? (bet.tags || []).join(', ') : '';
    form.elements.note.value = bet ? bet.note : '';
    $('#betDialogTitle').textContent = bet ? 'РЕДАКТИРОВАНИЕ СТАВКИ' : 'ВВОД В ИГРУ';
    $('#betSubmit').textContent = bet ? 'СОХРАНИТЬ ИЗМЕНЕНИЯ' : 'ЗАПИСАТЬ В МАТРИЦУ';
    updateBetFormState();
    openDialog($('#betDialog'));
    setTimeout(function () { form.elements.event.focus(); }, 60);
  }
  function applyKellyStake() {
    const form = $('#betForm');
    const odds = num(form.elements.odds.value);
    if (!(odds > 1)) return toast('Укажите коэффициент больше 1 для расчёта Келли', 'error');
    const m = calc(state);
    const p = m.winrate / 100 || 0.5;
    const q = 1 - p;
    const b = odds - 1;
    const kelly = (b * p - q) / b;
    const fraction = Math.max(0, Math.min(kelly, 0.25));
    const amount = Math.max(1, Math.round(m.capital * fraction));
    form.elements.stake.value = amount;
    updateBetFormState();
    toast('Критерий Келли: ' + pct(fraction * 100, 2) + ' банка = ' + money(amount));
  }
  function updateBetFormState() {
    const form = $('#betForm');
    const status = form.elements.status.value;
    $('#payoutField').classList.toggle('is-hidden', status !== 'cashout');
    const m = calc(state);
    $('#quickHint').textContent = 'банк ' + money(m.capital) + ' · флэт ' + pct(state.settings.riskFlat) + ' = ' + money(m.flatStake);
    const stake = num(form.elements.stake.value);
    const odds = num(form.elements.odds.value);
    let text;
    if (status === 'cashout') {
      const payout = num(form.elements.payout.value);
      text = 'ВЫПЛАТА: ' + money(payout) + ' · P&L: ' + signedMoney(payout - stake);
    } else if (stake > 0 && odds >= 1) {
      text = 'ПОТЕНЦИАЛЬНЫЙ ВЫИГРЫШ: ' + money(stake * odds) + ' · ЧИСТАЯ ПРИБЫЛЬ: ' + signedMoney(stake * (odds - 1));
    } else {
      text = 'УКАЖИТЕ СУММУ И КОЭФФИЦИЕНТ — СИСТЕМА ПОСЧИТАЕТ РАСЧЁТ';
    }
    $('#betCalc').textContent = text;
  }
  function applyQuickStake(percent) {
    const m = calc(state);
    const amount = Math.max(1, Math.round(m.capital * percent / 100));
    $('#betForm').elements.stake.value = amount;
    updateBetFormState();
  }
  function submitBet(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const get = function (name) { return String(fd.get(name) == null ? '' : fd.get(name)).trim(); };
    const date = get('date');
    const event = get('event');
    const odds = num(fd.get('odds'));
    const stake = num(fd.get('stake'));
    const status = ['pending', 'won', 'lost', 'void', 'cashout'].indexOf(get('status')) !== -1 ? get('status') : 'pending';
    const tags = parseTags(get('tags'));
    if (!parseISO(date)) return toast('Укажите корректную дату', 'error');
    if (!event) return toast('Укажите событие', 'error');
    if (!(odds >= 1.01)) return toast('Коэффициент должен быть не меньше 1.01', 'error');
    if (odds > 100) return toast('Коэффициент слишком высокий (макс. 100.00)', 'error');
    if (!(stake > 0)) return toast('Сумма ставки должна быть больше нуля', 'error');
    const m = calc(state);
    if (stake > m.available) {
      return toast('Ставка превышает свободный банк: ' + money(m.available), 'error');
    }
    const duplicate = state.bets.some(function (b) {
      if (b.archived || b.id === ui.editingBet) return false;
      return b.event.toLowerCase() === event.toLowerCase()
        && Math.abs(num(b.odds) - odds) < 0.001
        && b.date === date;
    });
    if (duplicate) return toast('Такая ставка уже существует на этот день', 'error');

    // Проверка месячного бюджета направления
    const strat = strategyById(get('strategyId'));
    if (strat && strat.monthlyBudget > 0) {
      const monthKeyNow = todayISO().slice(0, 7);
      let monthStake = 0;
      state.bets.forEach(function (b) {
        if (b.archived || b.strategyId !== strat.id || b.status === 'pending') return;
        if (monthKey(b.date) === monthKeyNow) monthStake += num(b.stake);
      });
      if (monthStake + stake > strat.monthlyBudget) {
        return toast('Превышен месячный бюджет направления «' + strat.name + '»: ' + money(strat.monthlyBudget) + ' · уже в игре ' + money(monthStake), 'error');
      }
    }

    let payout = 0;
    if (status === 'cashout') {
      payout = num(fd.get('payout'));
      if (payout < 0) return toast('Выплата не может быть отрицательной', 'error');
    }
    const strategyId = strategyById(get('strategyId')) ? get('strategyId') : 'sport';
    const payload = {
      date, strategyId, event: event.slice(0, 80), league: get('league').slice(0, 40),
      market: get('market').slice(0, 30), odds, stake, status, payout, tags,
      note: get('note').slice(0, 200), archived: false
    };
    if (ui.editingBet) {
      const bet = findBet(ui.editingBet);
      if (!bet) return;
      Object.assign(bet, payload);
      $('#betDialog').close();
      ui.editingBet = null;
      commit('Ставка обновлена');
    } else {
      state.bets.push(Object.assign({ id: uid('bet'), createdAt: new Date().toISOString() }, payload));
      $('#betDialog').close();
      commit(status === 'pending' ? 'Ставка добавлена в игру' : 'Ставка записана в журнал');
    }
  }
  function findBet(id) { return state.bets.filter(function (b) { return b.id === id; })[0] || null; }
  function findOp(id) { return state.operations.filter(function (o) { return o.id === id; })[0] || null; }
  function settleBet(id, status) {
    const bet = findBet(id);
    if (!bet || ['won', 'lost', 'void'].indexOf(status) === -1) return;
    bet.status = status;
    bet.payout = 0;
    commit('Ставка рассчитана: ' + signedMoney(betProfit(bet)));
  }

  /* ============================================================
     7. КАПИТАЛ
     ============================================================ */

  function renderCapital() {
    const stats = strategyStats(state);
    const m = calc(state);
    $('#strategyGrid').innerHTML = stats.map(strategyCard).join('') +
      '<button class="strategy-add" type="button" data-action="new-strategy">' +
        '<span>+</span><b>НОВОЕ НАПРАВЛЕНИЕ</b><small>Крипто, акции, фриланс, аренда...</small>' +
      '</button>';
    $('#reconciliation').innerHTML = reconciliationMarkup(m);
    renderLedger();
  }
  function strategyCard(s) {
    const active = s.count > 0 || s.pending > 0;
    const share = Math.max(0, Math.min(100, s.share));
    const profitClass = s.profit > 0 ? 'up' : (s.profit < 0 ? 'down' : '');
    const budget = num(s.monthlyBudget);
    const budgetWarn = budget > 0 && s.stake > budget;
    const deleteBtn = s.id !== 'sport'
      ? '<button class="mini-x" type="button" data-action="delete-strategy" data-id="' + escHtml(s.id) + '" title="Удалить направление" aria-label="Удалить направление">×</button>'
      : '';
    return '<article class="strategy-card" style="--strat:' + escHtml(s.color) + '">' +
      '<div class="strategy-top"><span class="strategy-phase">ФАЗА 0' + s.phase + ' // ' + (active ? 'ONLINE' : 'STANDBY') + '</span>' + deleteBtn + '</div>' +
      '<h3 class="strategy-name">' + escHtml(s.name) + '</h3>' +
      '<div class="strategy-profit ' + profitClass + '">' + signedMoney(s.profit) + '</div>' +
      (budget > 0 ? '<div class="strategy-budget"><span>БЮДЖЕТ МЕСЯЦ: ' + money(budget) + '</span><span class="' + (budgetWarn ? 'warn' : '') + '">в игре ' + money(s.stake) + '</span></div>' : '') +
      '<div class="strategy-meta">' + s.count + ' ' + plural(s.count, 'операция', 'операции', 'операций') + (s.pending ? ' · ' + s.pending + ' в игре' : '') + ' · доля ' + pct(s.share) + '</div>' +
      '<div class="strategy-bar"><span style="width:' + share + '%"></span></div>' +
      '<div class="strategy-foot"><span class="dot" style="background:' + escHtml(s.color) + ';color:' + escHtml(s.color) + '"></span>' + (active ? 'АКТИВНА' : 'ОЖИДАЕТ ВХОДА') + '<span class="strategy-note">' + escHtml(s.note || '') + '</span></div>' +
    '</article>';
  }
  function reconciliationMarkup(m) {
    const rows = [
      ['Стартовый капитал', money(m.startCapital), ''],
      ['Пополнения', signedMoney(m.deposits), m.deposits > 0 ? 'up' : ''],
      ['Выводы', m.withdrawals ? '−' + money(m.withdrawals) : money(0), m.withdrawals ? 'down' : ''],
      ['Прибыль ставок', signedMoney(m.betsProfit), m.betsProfit >= 0 ? 'up' : 'down'],
      ['P&L прочих направлений', signedMoney(m.pnl), m.pnl >= 0 ? 'up' : 'down']
    ];
    return rows.map(function (row) {
      return '<div class="recon-row"><span>' + row[0] + '</span><b class="' + row[2] + '">' + row[1] + '</b></div>';
    }).join('') +
      '<div class="recon-row is-total"><span>ИТОГО КАПИТАЛ</span><b>' + money(m.capital) + '</b></div>' +
      '<div class="recon-row is-sub"><span>В игре (зарезервировано)</span><b>' + money(m.pendingStake) + '</b></div>' +
      '<div class="recon-row is-sub"><span>Свободный банк</span><b>' + money(m.available) + '</b></div>' +
      '<p class="recon-note">// Вывод средств не считается убытком: он уменьшает капитал, но не прибыль.</p>';
  }
  function renderLedger() {
    const ops = state.operations.filter(function (o) { return !o.archived; }).slice().sort(function (a, b) {
      return b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt));
    });
    if (!ops.length) {
      $('#capitalLedger').innerHTML = '<div class="empty-state"><div class="empty-glyph">// 0x00</div><p>ОПЕРАЦИЙ КАПИТАЛА НЕТ</p><span>Зафиксируйте прибыль, убыток, пополнение или вывод.</span><button class="btn btn-ghost" type="button" data-action="new-op">+ ДОБАВИТЬ ОПЕРАЦИЮ</button></div>';
      return;
    }
    $('#capitalLedger').innerHTML = ops.map(opRow).join('');
  }
  function opRow(o) {
    const meta = OP[o.type];
    const signed = opSigned(o);
    const subtitle = [o.strategyId ? strategyNameLocal(o.strategyId) : 'Движение капитала', o.note, tagsString(o.tags)].filter(Boolean).join(' · ');
    return '<div class="ledger-row">' +
      '<span class="ledger-date">' + formatDate(o.date, 'short') + '</span>' +
      '<div class="ledger-main"><div class="ledger-title"><span class="status ' + meta.cls + '">' + meta.short + '</span></div><div class="ledger-meta">' + escHtml(subtitle) + '</div></div>' +
      '<span class="ledger-amount ' + (signed >= 0 ? 'up' : 'down') + '">' + signedMoney(signed) + '</span>' +
      '<div class="ledger-actions">' +
        '<button class="mini-btn" type="button" data-action="edit-op" data-id="' + escHtml(o.id) + '" title="Редактировать" aria-label="Редактировать">✎</button>' +
        '<button class="mini-btn is-del" type="button" data-action="archive-op" data-id="' + escHtml(o.id) + '" title="В архив" aria-label="В архив">▭</button>' +
        '<button class="mini-btn" type="button" data-action="export-op-json" data-id="' + escHtml(o.id) + '" title="Экспортировать операцию в JSON">💾</button>' +
      '</div>' +
    '</div>';
  }
  function openOpDialog(op) {
    ui.editingOp = op ? op.id : null;
    const form = $('#opForm');
    form.reset();
    form.elements.strategyId.innerHTML = state.strategies.map(function (s) {
      return '<option value="' + escHtml(s.id) + '">' + escHtml(s.name) + '</option>';
    }).join('');
    form.elements.type.value = op ? op.type : 'profit';
    form.elements.date.value = op ? op.date : todayISO();
    form.elements.amount.value = op ? op.amount : '';
    form.elements.tags.value = op ? (op.tags || []).join(', ') : '';
    form.elements.note.value = op ? op.note : '';
    if (op && op.strategyId) form.elements.strategyId.value = op.strategyId;
    $('#opDialogTitle').textContent = op ? 'РЕДАКТИРОВАНИЕ ОПЕРАЦИИ' : 'НОВАЯ ОПЕРАЦИЯ';
    $('#opSubmit').textContent = op ? 'СОХРАНИТЬ ИЗМЕНЕНИЯ' : 'ЗАПИСАТЬ ОПЕРАЦИЮ';
    updateOpFormState();
    openDialog($('#opDialog'));
    setTimeout(function () { form.elements.amount.focus(); }, 60);
  }
  function updateOpFormState() {
    const type = $('#opType').value;
    const showStrategy = type === 'profit' || type === 'loss';
    $('#opStrategyField').classList.toggle('is-hidden', !showStrategy);
    const hints = {
      profit: 'Зафиксированная прибыль по направлению увеличивает капитал и прибыль проекта.',
      loss: 'Зафиксированный убыток уменьшает капитал и прибыль проекта.',
      deposit: 'Пополнение увеличивает капитал и сумму вложенных средств.',
      withdraw: 'Вывод уменьшает капитал, но не считается убытком.'
    };
    $('#opHint').textContent = hints[type] || '';
  }
  function submitOp(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const get = function (name) { return String(fd.get(name) == null ? '' : fd.get(name)).trim(); };
    const type = ['deposit', 'withdraw', 'profit', 'loss'].indexOf(get('type')) !== -1 ? get('type') : 'profit';
    const date = get('date');
    const amount = num(fd.get('amount'));
    const isPnl = type === 'profit' || type === 'loss';
    const tags = parseTags(get('tags'));
    if (!parseISO(date)) return toast('Укажите корректную дату', 'error');
    if (!(amount > 0)) return toast('Сумма операции должна быть больше нуля', 'error');
    const m = calc(state);
    if (type === 'withdraw' && amount > m.capital) {
      return toast('Вывод превышает текущий капитал: ' + money(m.capital), 'error');
    }
    if (isPnl && !strategyById(get('strategyId'))) return toast('Выберите направление', 'error');
    const payload = {
      date, type, strategyId: isPnl ? get('strategyId') : null, amount, tags,
      note: get('note').slice(0, 200), archived: false
    };
    if (ui.editingOp) {
      const op = findOp(ui.editingOp);
      if (!op) return;
      Object.assign(op, payload);
      $('#opDialog').close();
      ui.editingOp = null;
      commit('Операция обновлена');
    } else {
      state.operations.push(Object.assign({ id: uid('op'), createdAt: new Date().toISOString() }, payload));
      $('#opDialog').close();
      commit('Операция записана в капитал');
    }
  }
  function openStrategyDialog() {
    const form = $('#strategyForm');
    form.reset();
    openDialog($('#strategyDialog'));
    setTimeout(function () { form.elements.name.focus(); }, 60);
  }
  function submitStrategy(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const phase = [1, 2, 3].indexOf(Number(fd.get('phase'))) !== -1 ? Number(fd.get('phase')) : 2;
    const note = String(fd.get('note') || '').trim().slice(0, 80);
    const monthlyBudget = num(fd.get('monthlyBudget'));
    const colorInput = form.querySelector('input[name="color"]:checked');
    const color = colorInput ? colorInput.value : '#00ff66';
    if (!name) return toast('Укажите название направления', 'error');
    if (name.length > 40) return toast('Название слишком длинное', 'error');
    const duplicate = state.strategies.some(function (s) { return s.name.toLowerCase() === name.toLowerCase(); });
    if (duplicate) return toast('Такое направление уже существует', 'error');
    state.strategies.push({ id: uid('strat'), name, phase, color, note, monthlyBudget });
    $('#strategyDialog').close();
    commit('Направление добавлено');
  }
  function removeStrategy(id) {
    if (id === 'sport') return toast('Базовое направление нельзя удалить', 'error');
    const strategy = strategyById(id);
    if (!strategy) return;
    const hasBets = state.bets.some(function (b) { return b.strategyId === id; });
    const hasOps = state.operations.some(function (o) { return o.strategyId === id; });
    if (hasBets || hasOps) return toast('Сначала переместите связанные ставки и операции в архив', 'error');
    if (!confirm('Удалить направление «' + strategy.name + '»?')) return;
    state.strategies = state.strategies.filter(function (s) { return s.id !== id; });
    commit('Направление удалено');
  }

  /* ============================================================
     8. АРХИВ
     ============================================================ */

  function buildEntries() {
    const entries = [];
    state.bets.forEach(function (b) {
      if (b.archived) return;
      entries.push({
        kind: 'bet', id: b.id, date: b.date, createdAt: b.createdAt || '',
        title: b.event,
        meta: [b.league, b.market, 'кэф ' + num(b.odds).toFixed(2), tagsString(b.tags)].filter(Boolean).join(' · '),
        amount: betProfit(b), pending: b.status === 'pending', stake: b.stake, status: b.status,
        search: [b.event, b.league, b.market, b.note, formatDate(b.date), strategyNameLocal(b.strategyId), tagsString(b.tags)].join(' ').toLowerCase()
      });
    });
    state.operations.forEach(function (o) {
      if (o.archived) return;
      const meta = OP[o.type];
      entries.push({
        kind: 'op', id: o.id, date: o.date, createdAt: o.createdAt || '',
        title: meta.label,
        meta: [o.strategyId ? strategyNameLocal(o.strategyId) : 'Движение капитала', o.note, tagsString(o.tags)].filter(Boolean).join(' · '),
        amount: opSigned(o), pending: false, stake: 0, status: o.type,
        search: [meta.label, o.note, o.strategyId ? strategyNameLocal(o.strategyId) : '', formatDate(o.date), tagsString(o.tags)].join(' ').toLowerCase()
      });
    });
    entries.sort(function (a, b) {
      return b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt));
    });
    return entries;
  }

  /* ---------- календарь ---------- */

  function renderCalendar() {
    const wrap = $('#calendarWrap');
    const grid = $('#calendarGrid');
    const header = $('#calendarHeader');
    const detail = $('#calendarDayDetail');
    if (!wrap || !grid || !header) return;

    if (!ui.calendarDate) ui.calendarDate = todayISO();

    const year = Number(ui.calendarDate.slice(0, 4));
    const month = Number(ui.calendarDate.slice(5, 7)) - 1;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay(); // 0 = вс
    const totalDays = lastDay.getDate();
    const today = todayISO();

    const monthNames = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ'];
    header.innerHTML = '<div class="calendar-title">' + monthNames[month] + ' ' + year + '</div>' +
      '<div class="calendar-nav">' +
      '<button class="calendar-nav-btn" type="button" data-action="calendar-prev">‹ ПРЕДЫДУЩИЙ</button>' +
      '<button class="calendar-nav-btn" type="button" data-action="calendar-next">СЛЕДУЮЩИЙ ›</button>' +
      '</div>';

    const weekdays = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
    let html = '';
    weekdays.forEach(function (w) {
      html += '<div class="calendar-weekday">' + w + '</div>';
    });

    // Пустые ячейки перед первым днём
    for (let i = 0; i < startOffset; i++) {
      html += '<div class="calendar-day empty"></div>';
    }

    // Группируем ставки по датам
    const betsByDate = {};
    state.bets.forEach(function (b) {
      if (b.archived) return;
      const d = b.date;
      if (!betsByDate[d]) betsByDate[d] = [];
      betsByDate[d].push(b);
    });

    for (let day = 1; day <= totalDays; day++) {
      const dateISO = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const isToday = dateISO === today;
      const dayBets = betsByDate[dateISO] || [];
      const wonCount = dayBets.filter(function (b) { return b.status === 'won'; }).length;
      const lostCount = dayBets.filter(function (b) { return b.status === 'lost'; }).length;
      const pendingCount = dayBets.filter(function (b) { return b.status === 'pending'; }).length;

      let betMarkup = '';
      if (dayBets.length > 0) {
        const showCount = Math.min(dayBets.length, 3);
        for (let i = 0; i < showCount; i++) {
          const b = dayBets[i];
          var st = STATUS[b.status] || {};
betMarkup += '<span class="calendar-day-bet ' + b.status + '">' + escHtml(st.label || b.status) + '</span>';
        }
        if (dayBets.length > 3) {
          betMarkup += '<span class="calendar-day-bet">+' + (dayBets.length - 3) + '</span>';
        }
      }

      html += '<div class="calendar-day' + (isToday ? ' today' : '') + '" data-date="' + escHtml(dateISO) + '">' +
        '<div class="calendar-day-date">' + day + '</div>' +
        betMarkup +
        (dayBets.length > 0 ? '<div class="calendar-day-more">' + dayBets.length + ' ставок</div>' : '') +
        '</div>';
    }

    grid.innerHTML = html;

    // Детали выбранного дня
    if (detail && ui.calendarSelectedDate) {
      renderCalendarDayDetail(ui.calendarSelectedDate);
    } else if (detail) {
      detail.style.display = 'none';
    }
  }

  function renderCalendarDayDetail(dateISO) {
    const detail = $('#calendarDayDetail');
    if (!detail) return;
    ui.calendarSelectedDate = dateISO;

    const dayBets = state.bets.filter(function (b) {
      return !b.archived && b.date === dateISO;
    });

    detail.style.display = dayBets.length > 0 ? 'block' : 'none';
    if (dayBets.length === 0) return;

    const dateObj = new Date(dateISO + 'T00:00:00');
    const weekdayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const dayName = weekdayNames[dateObj.getDay()];
    const totalProfit = dayBets.reduce(function (sum, b) { return sum + betProfit(b); }, 0);

    detail.innerHTML =
      '<div class="calendar-day-detail-header">' +
      '<div class="calendar-day-detail-date">' + formatDate(dateISO, 'full') + ' · ' + dayName + '</div>' +
      '<button class="calendar-day-detail-close" type="button" data-action="calendar-close-detail">ЗАКРЫТЬ</button>' +
      '</div>' +
      '<div class="calendar-day-detail-list">' +
      dayBets.map(function (b) {
        const profit = betProfit(b);
        const status = STATUS[b.status];
        return '<div class="calendar-day-detail-item ' + b.status + '">' +
          '<div class="calendar-day-detail-info">' +
          '<div class="calendar-day-detail-event">' + escHtml(b.event) + '</div>' +
          '<div class="calendar-day-detail-meta">' + [b.league, b.market, status.label].filter(Boolean).join(' · ') + '</div>' +
          '</div>' +
          '<div class="calendar-day-detail-amount ' + (profit > 0 ? 'up' : (profit < 0 ? 'down' : 'flat')) + '">' + signedMoney(profit) + '</div>' +
          '</div>';
      }).join('') +
      '<div class="calendar-day-detail-item" style="border:none;background:transparent;margin-top:8px;">' +
      '<div class="calendar-day-detail-info">' +
      '<div class="calendar-day-detail-meta" style="color:var(--accent);font-weight:700;">ИТОГО ЗА ДЕНЬ</div>' +
      '</div>' +
      '<div class="calendar-day-detail-amount ' + (totalProfit >= 0 ? 'up' : 'down') + '">' + signedMoney(totalProfit) + '</div>' +
      '</div>' +
      '</div>';
  }

  function renderArchive() {
    $$('[data-archive-filter]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.archiveFilter === ui.archiveFilter);
    });
    const query = ui.archiveSearch.trim().toLowerCase();
    const items = state.archive.filter(function (item) {
      if (ui.archiveFilter !== 'all' && item.kind !== ui.archiveFilter) return false;
      if (!query) return true;
      const d = item.data;
      const haystack = [d.event || '', d.league || '', d.market || '', d.note || '', d.strategyId || '', d.type || ''].join(' ').toLowerCase();
      return haystack.indexOf(query) !== -1;
    }).sort(function (a, b) {
      return b.data.createdAt.localeCompare(a.data.createdAt);
    });
    const el = $('#archiveList');
    if (!items.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-glyph">// 0x00</div><p>АРХИВ ПУСТ</p><span>Удалённые записи появятся здесь.</span></div>';
      return;
    }
    el.innerHTML = items.map(function (item) {
      const d = item.data;
      const isBet = item.kind === 'bet';
      const status = isBet ? STATUS[d.status] : OP[d.type];
      const amount = isBet ? betProfit(d) : opSigned(d);
      return '<div class="archive-row ' + (isBet ? 'bet-row' : 'op-row') + '">' +
        '<div class="archive-main">' +
          '<div class="archive-title">' + escHtml(isBet ? d.event : (d.note || d.type)) + '</div>' +
          '<div class="archive-meta">' + [
            d.date,
            isBet ? (d.league || '') : (d.strategyId ? strategyNameLocal(d.strategyId) : '—'),
            status.label || status.short
          ].filter(Boolean).join(' · ') + '</div>' +
        '</div>' +
        '<div class="archive-amount ' + (amount >= 0 ? 'up' : 'down') + '">' + signedMoney(amount) + '</div>' +
        '<div class="archive-actions">' +
          '<button class="mini-btn" type="button" data-action="restore-item" data-kind="' + item.kind + '" data-id="' + escHtml(d.id) + '" title="Восстановить">↻</button>' +
          '<button class="mini-btn is-del" type="button" data-action="purge-item" data-kind="' + item.kind + '" data-id="' + escHtml(d.id) + '" title="Безвозвратно удалить">×</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ============================================================
     9. ЖУРНАЛ
     ============================================================ */

  function renderJournal() {
    $$('[data-journal-filter]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.journalFilter === ui.journalFilter);
    });
    const query = ui.journalSearch.trim().toLowerCase();
    const entries = buildEntries().filter(function (e) {
      if (ui.journalFilter === 'bets' && e.kind !== 'bet') return false;
      if (ui.journalFilter === 'ops' && e.kind !== 'op') return false;
      if (!query) return true;
      return e.search.indexOf(query) !== -1;
    });
    if (!entries.length) {
      $('#journalList').innerHTML = '<div class="empty-state"><div class="empty-glyph">// 0x00</div><p>ЖУРНАЛ ПУСТ</p><span>Здесь появятся все ставки и движения капитала.</span><button class="btn btn-ghost" type="button" data-action="new-bet">+ ДОБАВИТЬ СТАВКУ</button></div>';
      return;
    }
    const groups = [];
    entries.forEach(function (e) {
      let group = groups[groups.length - 1];
      if (!group || group.date !== e.date) {
        group = { date: e.date, items: [], net: 0, hasSettled: false };
        groups.push(group);
      }
      group.items.push(e);
      if (!e.pending) { group.net += e.amount; group.hasSettled = true; }
    });
    $('#journalList').innerHTML = groups.map(function (g) {
      const netMarkup = g.hasSettled
        ? '<b class="' + (g.net >= 0 ? 'up' : 'down') + '">' + signedMoney(g.net) + '</b>'
        : '<b class="warn">В ИГРЕ</b>';
      return '<div class="journal-group">' +
        '<div class="journal-day"><span>' + formatDate(g.date, 'full') + ' · ' + weekday(g.date) + '</span>' + netMarkup + '</div>' +
        g.items.map(journalRow).join('') +
      '</div>';
    }).join('');
  }
  function journalRow(e) {
    const status = e.kind === 'bet' ? STATUS[e.status] : OP[e.status];
    const badge = e.kind === 'bet'
      ? '<span class="status ' + status.cls + '">' + status.label + '</span>'
      : '<span class="status ' + status.cls + '">' + status.short + '</span>';
    const actions = e.kind === 'bet'
      ? '<button class="mini-btn" type="button" data-action="edit-bet" data-id="' + escHtml(e.id) + '" title="Редактировать" aria-label="Редактировать">✎</button>' +
        '<button class="mini-btn is-del" type="button" data-action="archive-bet" data-id="' + escHtml(e.id) + '" title="В архив" aria-label="В архив">▭</button>'
      : '<button class="mini-btn" type="button" data-action="edit-op" data-id="' + escHtml(e.id) + '" title="Редактировать" aria-label="Редактировать">✎</button>' +
        '<button class="mini-btn is-del" type="button" data-action="archive-op" data-id="' + escHtml(e.id) + '" title="В архив" aria-label="В архив">▭</button>';
    return '<div class="journal-row">' +
      '<span class="journal-icon ' + (e.kind === 'op' ? 'is-op' : '') + '">' + (e.kind === 'bet' ? '⚽' : '◈') + '</span>' +
      '<div class="journal-main"><div class="journal-title">' + escHtml(e.title) + ' ' + badge + '</div><div class="journal-meta">' + escHtml(e.meta) + '</div></div>' +
      '<span class="journal-amount ' + (e.pending ? 'is-pending' : (e.amount >= 0 ? 'up' : 'down')) + '">' + (e.pending ? '— ' + money(e.stake) + ' в игре' : signedMoney(e.amount)) + '</span>' +
      '<div class="journal-actions">' + actions + '</div>' +
    '</div>';
  }

  /* ============================================================
     10. АНАЛИТИКА
     ============================================================ */

  function renderAnalytics() {
    const an = analytics(state);
    const renderTable = function (id, data, emptyMsg) {
      const el = $(id);
      if (!data.length) {
        el.innerHTML = '<div class="empty-state" style="padding:18px"><p>' + (emptyMsg || 'НЕТ ДАННЫХ') + '</p></div>';
        return;
      }
      el.innerHTML = '<table class="data-table" style="min-width:auto"><thead><tr><th>ПАРАМЕТР</th><th class="num">СТАВОК</th><th class="num">ВЫИГРЫшей</th><th class="num">WINRATE</th><th class="num">ОБОРОТ</th><th class="num">P&L</th><th class="num">ROI</th></tr></thead><tbody>' +
        data.map(function (d) {
          return '<tr>' +
            '<td>' + escHtml(d.key) + '</td>' +
            '<td class="num">' + d.n + '</td>' +
            '<td class="num">' + d.won + '</td>' +
            '<td class="num ' + (d.winrate >= 50 ? 'up' : 'down') + '">' + pct(d.winrate) + '</td>' +
            '<td class="num">' + money(d.turnover) + '</td>' +
            '<td class="num ' + (d.profit >= 0 ? 'up' : 'down') + '">' + signedMoney(d.profit) + '</td>' +
            '<td class="num ' + (d.roi >= 0 ? 'up' : 'down') + '">' + signedPct(d.roi) + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';
    };
    renderTable('#analyticsLeagues', an.leagues, 'Нет ставок по турнирам');
    renderTable('#analyticsMarkets', an.markets, 'Нет ставок по рынкам');
    renderTable('#analyticsOdds', an.odds, 'Нет ставок по коэффициентам');
    renderTable('#analyticsWeekdays', an.weekdays, 'Нет ставок по дням');
    renderTable('#analyticsTags', an.tags, 'Нет ставок с тегами');
    renderTable('#analyticsMonths', an.months, 'Нет ставок по месяцам');
  }
  function exportAnalyticsCSV() {
    const an = analytics(state);
    const section = function (title, rows) {
      let out = '// ' + title + '\r\n';
      out += 'Параметр;Ставок;Выиграно;Winrate;Оборот;P&L;ROI\r\n';
      rows.forEach(function (r) {
        out += escHtml(r.key) + ';' + r.n + ';' + r.won + ';' + r.winrate.toFixed(1) + ';' + r.turnover + ';' + r.profit + ';' + r.roi.toFixed(1) + '\r\n';
      });
      return out + '\r\n';
    };
    let csv = '\uFEFF';
    csv += section('ТУРНИРЫ', an.leagues);
    csv += section('РЫНКИ', an.markets);
    csv += section('КОЭФФИЦИЕНТЫ', an.odds);
    csv += section('ДНИ НЕДЕЛИ', an.weekdays);
    csv += section('ТЕГИ', an.tags);
    csv += section('МЕСЯЦЫ', an.months);
    download('capital-architect-analytics-' + todayISO() + '.csv', csv, 'text/csv;charset=utf-8');
    toast('Аналитика экспортирована в CSV');
  }
    function printAnalytics() {
    const c = calc(state);
    const st = state.settings;
    const stats = strategyStats(state);
    const dateStr = todayISO();

    const winHtml = function (v) {
      if (v > 0) return '<span style="color:#00ff66">+' + signedMoney(v) + '</span>';
      if (v < 0) return '<span style="color:#ff3b5c">' + signedMoney(v) + '</span>';
      return '<span style="color:#7fa98d">—</span>';
    };

    const betsRows = state.bets.filter(function (b) { return !b.archived; }).map(function (b) {
      var s = strategyNameLocal(b.strategyId);
      var p = betProfit(b);
      var stt = STATUS[b.status] || {};
      return '<tr>' +
        '<td>' + escHtml(b.date) + '</td>' +
        '<td>' + escHtml(s) + '</td>' +
        '<td>' + escHtml(b.event) + '</td>' +
        '<td>' + escHtml(b.market) + '</td>' +
        '<td>' + num(b.odds).toFixed(2) + '</td>' +
        '<td>' + formatMoney(b.stake, st.currency) + '</td>' +
        '<td><span class="badge badge-' + b.status + '">' + escHtml(stt.label || b.status) + '</span></td>' +
        '<td>' + winHtml(p) + '</td>' +
        '</tr>';
    }).join('');

    const opsRows = state.operations.filter(function (o) { return !o.archived; }).map(function (o) {
      var s = o.strategyId ? strategyNameLocal(o.strategyId) : '—';
      var signed = opSigned(o);
      return '<tr>' +
        '<td>' + escHtml(o.date) + '</td>' +
        '<td>' + escHtml(o.type) + '</td>' +
        '<td>' + escHtml(s) + '</td>' +
        '<td>' + winHtml(signed) + '</td>' +
        '<td>' + escHtml(o.note || '') + '</td>' +
        '</tr>';
    }).join('');

    var html = '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Отчёт за всё время — ' + escHtml(st.projectName) + '</title><style>' +
      '@page { size: A4; margin: 16mm; }' +
      'body { background:#030806; color:#d8ffe6; font-family:"Cascadia Mono","JetBrains Mono","Consolas",monospace; font-size:10px; margin:0; }' +
      '@media print { .no-print { display:none !important; } .report-btn { display:none; } }' +
      '.report { padding:20px; }' +
      '.report-head { border:1px solid var(--line); padding:18px; margin-bottom:22px; background:rgba(5,18,12,0.7); }' +
      '.report-title { font-size:21px; color:#00ff66; text-transform:uppercase; letter-spacing:0.12em; margin:0 0 6px 0; }' +
      '.report-sub { color:#7fa98d; font-size:10px; margin:0; }' +
      '.kpi { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:22px; }' +
      '.kpi-item { flex:1 1 130px; border:1px solid var(--line); padding:12px 10px; background:rgba(5,18,12,0.6); }' +
      '.kpi-label { font-size:8px; color:#7fa98d; text-transform:uppercase; margin-bottom:3px; letter-spacing:0.05em; }' +
      '.kpi-value { font-size:14px; font-weight:700; color:#d8ffe6; }' +
      '.kpi-value.up { color:#00ff66; } .kpi-value.down { color:#ff3b5c; }' +
      'table { width:100%; border-collapse:collapse; margin-bottom:22px; }' +
      'th, td { border:1px solid var(--line); padding:5px 7px; text-align:left; font-size:9px; }' +
      'th { background:rgba(0,255,102,0.12); color:#00ff66; text-transform:uppercase; font-size:8px; }' +
      'tr:nth-child(even) td { background:rgba(255,255,255,0.03); }' +
      '.section { margin-bottom:24px; }' +
      '.section-title { font-size:13px; color:#00ff66; border-bottom:1px solid var(--line); padding-bottom:5px; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.08em; }' +
      '.badge { display:inline-block; padding:1px 6px; border-radius:2px; font-size:8px; font-weight:700; text-transform:uppercase; }' +
      '.badge.won { background:rgba(0,255,102,0.15); color:#00ff66; border:1px solid rgba(0,255,102,0.35); }' +
      '.badge.lost { background:rgba(255,59,92,0.15); color:#ff3b5c; border:1px solid rgba(255,59,92,0.35); }' +
      '.badge.pending { background:rgba(255,204,77,0.15); color:#ffcc4d; border:1px solid rgba(255,204,77,0.35); }' +
      '.badge.void { background:rgba(127,169,141,0.15); color:#7fa98d; border:1px solid rgba(127,169,141,0.35); }' +
      '.badge.cashout { background:rgba(34,211,238,0.15); color:#22d3ee; border:1px solid rgba(34,211,238,0.35); }' +
      '.strategies { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:22px; }' +
      '.strategy-card { flex:1 1 150px; border:1px solid var(--line); padding:11px 9px; background:rgba(5,18,12,0.6); }' +
      '.strategy-name { font-weight:700; color:#d8ffe6; margin-bottom:5px; font-size:11px; }' +
      '.strategy-stat { font-size:9px; color:#7fa98d; margin-bottom:2px; }' +
      '.report-btn { display:inline-block; margin-top:16px; padding:10px 18px; background:#00ff66; color:#021008; text-decoration:none; font-weight:700; font-size:11px; text-transform:uppercase; border-radius:2px; cursor:pointer; border:none; font-family:inherit; }' +
      '.report-btn:hover { box-shadow:0 0 20px rgba(0,255,102,0.5); }' +
      '</style></head><body><div class="report">' +
      '<div class="report-head">' +
      '<h1 class="report-title">АРХИТЕКТОР КАПИТАЛА PRO — ОТЧЁТ ЗА ВСЁ ВРЕМЯ</h1>' +
      '<p class="report-sub">' + escHtml(st.projectName) + ' &middot; ' + dateStr + ' &middot; Капитал: ' + formatMoney(c.capital, st.currency) + '</p>' +
      '</div>' +

      '<div class="kpi">' +
      '<div class="kpi-item"><div class="kpi-label">Стартовый капитал</div><div class="kpi-value">' + formatMoney(c.startCapital, st.currency) + '</div></div>' +
      '<div class="kpi-item"><div class="kpi-label">Текущий капитал</div><div class="kpi-value ' + (c.profit >= 0 ? 'up' : 'down') + '">' + formatMoney(c.capital, st.currency) + '</div></div>' +
      '<div class="kpi-item"><div class="kpi-label">Чистая прибыль</div><div class="kpi-value ' + (c.profit >= 0 ? 'up' : 'down') + '">' + signedMoney(c.profit) + '</div></div>' +
      '<div class="kpi-item"><div class="kpi-label">ROI</div><div class="kpi-value">' + pct(c.roi) + '</div></div>' +
      '<div class="kpi-item"><div class="kpi-label">Ставок</div><div class="kpi-value">' + c.settledCount + '</div></div>' +
      '<div class="kpi-item"><div class="kpi-label">Винрейт</div><div class="kpi-value">' + pct(c.winrate) + '</div></div>' +
      '<div class="kpi-item"><div class="kpi-label">Макс. просадка</div><div class="kpi-value">' + pct(c.maxDrawdown) + '</div></div>' +
      '<div class="kpi-item"><div class="kpi-label">Оборот</div><div class="kpi-value">' + formatMoney(c.turnover, st.currency) + '</div></div>' +
      '</div>' +

      '<div class="section"><div class="section-title">Направления</div><div class="strategies">' +
      stats.map(function (s) {
        return '<div class="strategy-card">' +
          '<div class="strategy-name">' + escHtml(s.name) + '</div>' +
          '<div class="strategy-stat">Прибыль: ' + signedMoney(s.profit) + '</div>' +
          '<div class="strategy-stat">Ставок: ' + s.bets + ' &middot; Операций: ' + s.ops + '</div>' +
          '<div class="strategy-stat">Доля: ' + pct(s.share) + '</div>' +
          '</div>';
      }).join('') +
      '</div></div>' +

      '<div class="section"><div class="section-title">Все ставки (' + state.bets.filter(function (b) { return !b.archived; }).length + ')</div>' +
      '<table><thead><tr><th>Дата</th><th>Направление</th><th>Событие</th><th>Рынок</th><th>Кэф</th><th>Ставка</th><th>Статус</th><th>P&L</th></tr></thead><tbody>' +
      betsRows +
      '</tbody></table></div>' +

      '<div class="section"><div class="section-title">Операции капитала (' + state.operations.filter(function (o) { return !o.archived; }).length + ')</div>' +
      '<table><thead><tr><th>Дата</th><th>Тип</th><th>Направление</th><th>Сумма</th><th>Заметка</th></tr></thead><tbody>' +
      opsRows +
      '</tbody></table></div>' +

      '<button class="report-btn no-print" onclick="window.print()">РАСПЕЧАТАТЬ / СОХРАНИТЬ PDF</button>' +
      '</div><script>window.onload=function(){window.print();}</script>' +
      '</body></html>';

    var w = window.open('', '_blank', 'width=1000,height=800');
    w.document.write(html);
    w.document.close();
  }
    const printContent =
      '<h1>ОТЧЁТ АНАЛИТИКИ — ' + escHtml(state.settings.projectName) + '</h1>' +
      '<p>Сформировано ' + new Date().toLocaleString('ru-RU') + '</p>' +
      '<h2>Кратко</h2>' +
      '<p>Капитал: ' + money(m.capital) + ' · Прибыль: ' + signedMoney(m.profit) + ' · ROI: ' + pct(m.roi) + ' · Winrate: ' + pct(m.winrate) + '</p>' +
      sectionHtml('Турниры', an.leagues) +
      sectionHtml('Рынки', an.markets) +
      sectionHtml('Коэффициенты', an.odds) +
      sectionHtml('Дни недели', an.weekdays) +
      sectionHtml('Теги', an.tags) +
      sectionHtml('Месяцы', an.months);
    const win = window.open('', '_blank');
    win.document.write(
      '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Отчёт аналитики</title>' +
      '<style>' +
      'body{font-family:"Cascadia Mono","JetBrains Mono",monospace;background:#030806;color:#d8ffe6;padding:24px;}' +
      'h1{color:#00ff66;text-shadow:0 0 12px rgba(0,255,102,.3);}' +
      'h2{color:#22d3ee;margin-top:24px;}' +
      'h3{color:#facc15;margin-top:18px;font-size:13px;}' +
      'table{border-collapse:collapse;width:100%;margin-top:8px;font-size:11px;}' +
      'th,td{border:1px solid rgba(0,255,102,.2);padding:6px 8px;text-align:left;}' +
      'th{background:rgba(0,255,102,.1);color:#00ff66;}' +
      'td.num{text-align:right;}' +
      '@media print{body{background:#fff;color:#000;}h1{color:#000;}h2{color:#333;}h3{color:#555;}th{background:#eee;color:#000;}td{color:#000;}}' +
      '</style></head><body>' + printContent + '<script>window.print();</script></body></html>'
    );
    win.document.close();
  }

  /* ============================================================
     11. ДЕЙСТВИЯ (архив, экспорт/импорт, настройки, прочее)
     ============================================================ */

  function archiveBet(id) {
    const bet = findBet(id);
    if (!bet) return;
    if (!confirm('Переместить ставку «' + bet.event + '» в архив?')) return;
    bet.archived = true;
    state.archive.push({ kind: 'bet', data: Object.assign({}, bet) });
    state.bets = state.bets.filter(function (b) { return b.id !== id; });
    commit('Ставка перемещена в архив');
    toast('Ставка перемещена в архив', null, function () {
      restoreItem('bet', id);
    });
  }
  function restoreBet(id) {
    const idx = state.archive.findIndex(function (item) { return item.kind === 'bet' && item.data.id === id; });
    if (idx === -1) return;
    const item = state.archive[idx];
    item.data.archived = false;
    state.bets.push(item.data);
    state.archive.splice(idx, 1);
    commit('Ставка восстановлена из архива');
    toast('Ставка восстановлена из архива', null, function () {
      archiveBet(id);
    });
  }
  function purgeBet(id) {
    const bet = findBet(id);
    if (!bet) return;
    if (!confirm('Удалить ставку «' + bet.event + '» безвозвратно?')) return;
    const copy = Object.assign({}, bet);
    state.bets = state.bets.filter(function (b) { return b.id !== id; });
    commit('Ставка удалена');
    toast('Ставка удалена безвозвратно', null, function () {
      state.bets.push(copy);
      commit('Ставка восстановлена');
    });
  }
  function archiveOp(id) {
    const op = findOp(id);
    if (!op) return;
    if (!confirm('Переместить операцию капитала в архив?')) return;
    op.archived = true;
    state.archive.push({ kind: 'op', data: Object.assign({}, op) });
    state.operations = state.operations.filter(function (o) { return o.id !== id; });
    commit('Операция перемещена в архив');
    toast('Операция перемещена в архив', null, function () {
      restoreItem('op', id);
    });
  }
  function restoreOp(id) {
    const idx = state.archive.findIndex(function (item) { return item.kind === 'op' && item.data.id === id; });
    if (idx === -1) return;
    const item = state.archive[idx];
    item.data.archived = false;
    state.operations.push(item.data);
    state.archive.splice(idx, 1);
    commit('Операция восстановлена из архива');
    toast('Операция восстановлена из архива', null, function () {
      archiveOp(id);
    });
  }
  function purgeOp(id) {
    const op = findOp(id);
    if (!op) return;
    if (!confirm('Удалить операцию капитала безвозвратно?')) return;
    const copy = Object.assign({}, op);
    state.operations = state.operations.filter(function (o) { return o.id !== id; });
    commit('Операция удалена');
    toast('Операция удалена безвозвратно', null, function () {
      state.operations.push(copy);
      commit('Операция восстановлена');
    });
  }

  function restoreItem(kind, id) {
    const idx = state.archive.findIndex(function (item) { return item.kind === kind && item.data.id === id; });
    if (idx === -1) return;
    const item = state.archive[idx];
    item.data.archived = false;
    if (kind === 'bet') state.bets.push(item.data);
    else state.operations.push(item.data);
    state.archive.splice(idx, 1);
    commit('Запись восстановлена из архива');
  }

  function purgeItem(kind, id) {
    const item = state.archive.find(function (i) { return i.kind === kind && i.data.id === id; });
    if (!item) return;
    if (!confirm('Удалить запись безвозвратно?')) return;
    state.archive = state.archive.filter(function (i) { return !(i.kind === kind && i.data.id === id); });
    commit('Запись безвозвратно удалена');
  }

  function archiveItem(kind, id) {
    if (kind === 'bet') archiveBet(id);
    else archiveOp(id);
  }
  function restoreAllArchive() {
    if (state.archive.length === 0) return toast('Архив пуст', 'error');
    if (!confirm('Восстановить все ' + state.archive.length + ' записей из архива?')) return;
    state.archive.forEach(function (item) {
      item.data.archived = false;
      if (item.kind === 'bet') state.bets.push(item.data);
      else state.operations.push(item.data);
    });
    state.archive = [];
    commit('Все записи восстановлены из архива');
  }

  /* ---------- глобальный поиск ---------- */

  function openGlobalSearchDialog() {
    const dlg = $('#globalSearchDialog');
    const form = $('#globalSearchForm');
    const input = form.elements.query;
    const results = $('#globalSearchResults');
    if (!dlg || !form || !input || !results) return;
    form.reset();
    results.innerHTML = '';
    openDialog(dlg);
    setTimeout(function () { input.focus(); }, 60);
  }

  function renderGlobalSearchResults(query) {
    const results = $('#globalSearchResults');
    if (!results) return;
    const q = query.trim().toLowerCase();
    if (!q) {
      results.innerHTML = '';
      return;
    }

    const betResults = [];
    const opResults = [];

    state.bets.forEach(function (b) {
      if (b.archived) return;
      const haystack = [b.event, b.league, b.market, b.note, tagsString(b.tags), strategyNameLocal(b.strategyId), formatDate(b.date)].join(' ').toLowerCase();
      if (haystack.indexOf(q) !== -1) {
        betResults.push({ kind: 'bet', data: b });
      }
    });

    state.operations.forEach(function (o) {
      if (o.archived) return;
      const haystack = [o.note, o.strategyId ? strategyNameLocal(o.strategyId) : '', tagsString(o.tags), formatDate(o.date), o.type].join(' ').toLowerCase();
      if (haystack.indexOf(q) !== -1) {
        opResults.push({ kind: 'op', data: o });
      }
    });

    let html = '';
    if (betResults.length) {
      html += '<div class="search-result-group"><div class="search-group-title">СТАВКИ (' + betResults.length + ')</div>';
      betResults.forEach(function (item) {
        const b = item.data;
        const status = STATUS[b.status];
        html += '<div class="search-result-item" data-action="goto-bet" data-id="' + escHtml(b.id) + '">' +
          '<div class="search-result-icon">⚽</div>' +
          '<div class="search-result-info">' +
          '<div class="search-result-title">' + escHtml(b.event) + '</div>' +
          '<div class="search-result-meta">' + [formatDate(b.date), strategyNameLocal(b.strategyId), status.label].filter(Boolean).join(' · ') + '</div>' +
          '</div>' +
          '</div>';
      });
      html += '</div>';
    }
    if (opResults.length) {
      html += '<div class="search-result-group"><div class="search-group-title">ОПЕРАЦИИ КАПИТАЛА (' + opResults.length + ')</div>';
      opResults.forEach(function (item) {
        const o = item.data;
        const meta = OP[o.type];
        html += '<div class="search-result-item" data-action="goto-op" data-id="' + escHtml(o.id) + '">' +
          '<div class="search-result-icon">◈</div>' +
          '<div class="search-result-info">' +
          '<div class="search-result-title">' + escHtml(o.note || meta.label) + '</div>' +
          '<div class="search-result-meta">' + [formatDate(o.date), o.strategyId ? strategyNameLocal(o.strategyId) : '—', meta.label].filter(Boolean).join(' · ') + '</div>' +
          '</div>' +
          '</div>';
      });
      html += '</div>';
    }
    if (!betResults.length && !opResults.length) {
      html = '<div class="search-result-group"><div class="search-group-title">РЕЗУЛЬТАТЫ</div>' +
        '<div class="search-result-item" style="cursor:default;color:var(--text-faint)">' +
        '<div class="search-result-icon">∅</div>' +
        '<div class="search-result-info">' +
        '<div class="search-result-title">Ничего не найдено</div>' +
        '</div>' +
        '</div>' +
        '</div>';
    }
    results.innerHTML = html;
  }

  function gotoBet(id) {
    const dlg = $('#globalSearchDialog');
    if (dlg) dlg.close();
    setTab('bets');
    // Подсветить ставку в таблице — просто перерендерим, выделение по id можно добавить позже
    const bet = findBet(id);
    if (bet) {
      // Открыть диалог редактирования для удобства
      openBetDialog(bet);
    }
  }

  function gotoOp(id) {
    const dlg = $('#globalSearchDialog');
    if (dlg) dlg.close();
    setTab('capital');
    const op = findOp(id);
    if (op) {
      openOpDialog(op);
    }
  }

  /* ---------- grupповые действия ---------- */

  function bulkArchiveBets() {
    if (ui.selectedBets.length === 0) return toast('Не выбрано ни одной ставки', 'error');
    if (!confirm('Архивировать ' + ui.selectedBets.length + ' ставок?')) return;
    ui.selectedBets.forEach(function (id) { archiveBet(id); });
    ui.selectedBets = [];
    updateBulkCounter();
    const cb = $('#selectAllBets');
    if (cb) cb.checked = false;
    toast('Архивировано ставок: ' + ui.selectedBets.length);
  }

  function bulkDeleteBets() {
    if (ui.selectedBets.length === 0) return toast('Не выбрано ни одной ставки', 'error');
    if (!confirm('Удалить ' + ui.selectedBets.length + ' ставок безвозвратно?')) return;
    ui.selectedBets.forEach(function (id) { purgeBet(id); });
    ui.selectedBets = [];
    updateBulkCounter();
    const cb = $('#selectAllBets');
    if (cb) cb.checked = false;
    toast('Удалено ставок: ' + ui.selectedBets.length);
  }

  function bulkSettleBets() {
    if (ui.selectedBets.length === 0) return toast('Не выбрано ни одной ставки', 'error');
    const statusBtn = document.querySelector('[data-bulk-status].is-active');
    const status = statusBtn ? statusBtn.dataset.bulkStatus : 'won';
    if (!confirm('Пометить ' + ui.selectedBets.length + ' ставок как «' + STATUS[status].label + '»?')) return;
    ui.selectedBets.forEach(function (id) { settleBet(id, status); });
    ui.selectedBets = [];
    updateBulkCounter();
    const cb = $('#selectAllBets');
    if (cb) cb.checked = false;
    toast('Обновлено ставок: ' + ui.selectedBets.length);
  }

  function exportBetJson(id) {
    const bet = findBet(id);
    if (!bet) return;
    const payload = Object.assign({}, bet, { exportedAt: new Date().toISOString(), app: 'capital-architect', type: 'bet' });
    download('bet-' + id + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Ставка экспортирована в JSON');
  }

  function exportOpJson(id) {
    const op = findOp(id);
    if (!op) return;
    const payload = Object.assign({}, op, { exportedAt: new Date().toISOString(), app: 'capital-architect', type: 'operation' });
    download('op-' + id + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Операция экспортирована в JSON');
  }

  function calendarPrevMonth() {
    if (!ui.calendarDate) ui.calendarDate = todayISO();
    const y = Number(ui.calendarDate.slice(0, 4));
    const m = Number(ui.calendarDate.slice(5, 7)) - 1;
    const prev = new Date(y, m - 1, 1);
    ui.calendarDate = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0') + '-01';
    ui.calendarSelectedDate = null;
    renderCalendar();
  }

  function calendarNextMonth() {
    if (!ui.calendarDate) ui.calendarDate = todayISO();
    const y = Number(ui.calendarDate.slice(0, 4));
    const m = Number(ui.calendarDate.slice(5, 7)) - 1;
    const next = new Date(y, m + 1, 1);
    ui.calendarDate = next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0') + '-01';
    ui.calendarSelectedDate = null;
    renderCalendar();
  }

  function resetDemo() {
    if (!confirm('Загрузить демо-данные? Текущие ставки и операции будут заменены.')) return;
    state = defaultState(true);
    commit('Демо-данные загружены');
  }
  function clearData() {
    if (!confirm('Удалить все ставки, операции и пользовательские направления? Настройки сохранятся.')) return;
    state.bets = [];
    state.operations = [];
    state.archive = [];
    state.strategies = defaultStrategies();
    state.settings.demo = false;
    state.settings.startDate = todayISO();
    commit('Данные очищены');
  }

  function exportJSON() {
    const payload = Object.assign({}, state, { exportedAt: new Date().toISOString(), app: 'capital-architect' });
    download('capital-architect-' + todayISO() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('JSON-копия сохранена');
  }
  function exportCSV() {
    const betsCsv = betsToCSV(state);
    const opsCsv = operationsToCSV(state);
    const content = '// СТАВКИ\r\n' + betsCsv + '\r\n\r\n// ОПЕРАЦИИ КАПИТАЛА\r\n' + opsCsv;
    download('capital-architect-' + todayISO() + '.csv', content, 'text/csv;charset=utf-8');
    toast('CSV-файл сохранён');
  }
  function exportArchiveCSV() {
    const bets = state.archive.filter(function (i) { return i.kind === 'bet'; }).map(function (i) { return i.data; });
    const ops = state.archive.filter(function (i) { return i.kind === 'op'; }).map(function (i) { return i.data; });
    let csv = '\uFEFF';
    csv += '// АРХИВ СТАВОК\r\nДата;Событие;Турнир;Рынок;Кэф;Ставка;Статус;P&L;Теги\r\n';
    bets.forEach(function (b) {
      csv += b.date + ';' + escHtml(b.event) + ';' + escHtml(b.league) + ';' + escHtml(b.market) + ';' + b.odds + ';' + b.stake + ';' + b.status + ';' + betProfit(b) + ';' + tagsString(b.tags) + '\r\n';
    });
    csv += '\r\n// АРХИВ ОПЕРАЦИЙ\r\nДата;Тип;Направление;Сумма;Теги;Заметка\r\n';
    ops.forEach(function (o) {
      csv += o.date + ';' + o.type + ';' + escHtml(o.strategyId ? strategyNameLocal(o.strategyId) : '—') + ';' + opSigned(o) + ';' + tagsString(o.tags) + ';' + escHtml(o.note) + '\r\n';
    });
    download('capital-architect-archive-' + todayISO() + '.csv', csv, 'text/csv;charset=utf-8');
    toast('Архив экспортирован в CSV');
  }

  /* ---------- экспорт в Excel/XLSX ---------- */

  function betsToSheet(state) {
    const rows = [['Дата', 'Направление', 'Событие', 'Турнир', 'Рынок', 'Кэф', 'Ставка', 'Статус', 'P&L', 'Теги', 'Заметка']];
    state.bets.forEach(function (b) {
      if (b.archived) return;
      rows.push([
        b.date, strategyNameLocal(b.strategyId), b.event, b.league, b.market,
        num(b.odds).toFixed(2), num(b.stake), b.status, betProfit(b), tagsString(b.tags), b.note
      ]);
    });
    return XLSX.utils.aoa_to_sheet(rows);
  }

  function operationsToSheet(state) {
    const rows = [['Дата', 'Тип', 'Направление', 'Сумма', 'Теги', 'Заметка']];
    state.operations.forEach(function (o) {
      if (o.archived) return;
      rows.push([
        o.date, o.type, o.strategyId ? strategyNameLocal(o.strategyId) : '—',
        opSigned(o), tagsString(o.tags), o.note
      ]);
    });
    return XLSX.utils.aoa_to_sheet(rows);
  }

  function archiveToSheets(state) {
    const bets = state.archive.filter(function (i) { return i.kind === 'bet'; }).map(function (i) { return i.data; });
    const ops = state.archive.filter(function (i) { return i.kind === 'op'; }).map(function (i) { return i.data; });

    const betRows = [['Дата', 'Событие', 'Турнир', 'Рынок', 'Кэф', 'Ставка', 'Статус', 'P&L', 'Теги']];
    bets.forEach(function (b) {
      betRows.push([b.date, b.event, b.league, b.market, b.odds, b.stake, b.status, betProfit(b), tagsString(b.tags)]);
    });

    const opRows = [['Дата', 'Тип', 'Направление', 'Сумма', 'Теги', 'Заметка']];
    ops.forEach(function (o) {
      opRows.push([o.date, o.type, o.strategyId ? strategyNameLocal(o.strategyId) : '—', opSigned(o), tagsString(o.tags), o.note]);
    });

    return {
      bets: XLSX.utils.aoa_to_sheet(betRows),
      ops: XLSX.utils.aoa_to_sheet(opRows)
    };
  }

  function exportXlsxBets() {
    if (typeof XLSX === 'undefined') return toast('Библиотека Excel не загружена', 'error');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, betsToSheet(state), 'Ставки');
    XLSX.writeFile(wb, 'capital-architect-bets-' + todayISO() + '.xlsx');
    toast('Ставки экспортированы в XLSX');
  }

  function exportXlsxOps() {
    if (typeof XLSX === 'undefined') return toast('Библиотека Excel не загружена', 'error');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, operationsToSheet(state), 'Операции');
    XLSX.writeFile(wb, 'capital-architect-ops-' + todayISO() + '.xlsx');
    toast('Операции экспортированы в XLSX');
  }

  function exportXlsxAll() {
    if (typeof XLSX === 'undefined') return toast('Библиотека Excel не загружена', 'error');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, betsToSheet(state), 'Ставки');
    XLSX.utils.book_append_sheet(wb, operationsToSheet(state), 'Операции');
    const arch = archiveToSheets(state);
    XLSX.utils.book_append_sheet(wb, arch.bets, 'Архив_Ставки');
    XLSX.utils.book_append_sheet(wb, arch.ops, 'Архив_Операции');
    XLSX.writeFile(wb, 'capital-architect-all-' + todayISO() + '.xlsx');
    toast('Все данные экспортированы в XLSX');
  }

  function importFileJson(e) {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!obj || typeof obj !== 'object' || !obj.settings || !Array.isArray(obj.bets) || !Array.isArray(obj.operations)) {
          throw new Error('bad-format');
        }
        if (!confirm('Импортировать данные? Текущее состояние будет заменено.')) {
          input.value = '';
          return;
        }
        const loaded = normalize(obj);
        state = loaded;
        commit('Данные импортированы');
      } catch (err) {
        toast('Не удалось прочитать файл: неверный формат', 'error');
      } finally {
        input.value = '';
      }
    };
    reader.onerror = function () {
      toast('Не удалось прочитать файл', 'error');
      input.value = '';
    };
    reader.readAsText(file);
  }
  function importCsvFile(e) {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = importCSV(String(reader.result));
        if (!parsed) return toast('CSV-файл пуст или неверного формата', 'error');
        if (!confirm('Импортировать ' + parsed.bets.length + ' ставок и ' + parsed.operations.length + ' операций из CSV?')) {
          input.value = '';
          return;
        }
        parsed.bets.forEach(function (b) {
          state.bets.push(Object.assign({ id: uid('bet'), createdAt: new Date().toISOString(), archived: false }, sanitizeBet(b)));
        });
        parsed.operations.forEach(function (o) {
          state.operations.push(Object.assign({ id: uid('op'), createdAt: new Date().toISOString(), archived: false }, sanitizeOp(o)));
        });
        commit('CSV импортирован');
      } catch (err) {
        toast('Не удалось прочитать CSV: ' + err.message, 'error');
      } finally {
        input.value = '';
      }
    };
    reader.onerror = function () {
      toast('Не удалось прочитать файл', 'error');
      input.value = '';
    };
    reader.readAsText(file);
  }

  /* ============================================================
     12. НАСТРОЙКИ
     ============================================================ */

  function renderSettings() {
    const f = $('#settingsForm');
    if (!f) return;
    f.elements.projectName.value = state.settings.projectName;
    const currency = f.elements.currency;
    const hasCurrency = Array.prototype.some.call(currency.options, function (o) { return o.value === state.settings.currency; });
    if (!hasCurrency) {
      const opt = document.createElement('option');
      opt.value = state.settings.currency;
      opt.textContent = state.settings.currency;
      currency.appendChild(opt);
    }
    currency.value = state.settings.currency;
    f.elements.startCapital.value = state.settings.startCapital;
    f.elements.goal.value = state.settings.goal;
    f.elements.monthlyGoal.value = state.settings.monthlyGoal;
    f.elements.riskFlat.value = state.settings.riskFlat;
    f.elements.startDate.value = state.settings.startDate;
    f.elements.accent.value = state.settings.accent;
    f.elements.theme.value = state.settings.theme;
    f.elements.baseCurrency.value = state.settings.baseCurrency || '₽';
    f.elements.currencyRates.value = JSON.stringify(state.settings.currencyRates || {});
    f.elements.csvSeparator.value = state.settings.csvSeparator || ';';
    f.elements.notifyGoal.checked = state.settings.notifyGoal;
    f.elements.notifyDrawdown.checked = state.settings.notifyDrawdown;
    f.elements.notifyMonthly.checked = state.settings.notifyMonthly;
    f.elements.encryptData.checked = state.settings.encryptData;
    const encryptPasswordRow = $('#encryptPasswordRow');
    if (encryptPasswordRow) {
      encryptPasswordRow.classList.toggle('is-hidden', !state.settings.encryptData);
    }
    let size = '—';
    try {
      size = (new Blob([JSON.stringify(state)]).size / 1024).toFixed(1) + ' КБ';
    } catch (e) { size = '—'; }
    $('#storageInfo').textContent = state.bets.length + ' ' + plural(state.bets.length, 'ставка', 'ставки', 'ставок') + ' · ' +
      state.operations.length + ' ' + plural(state.operations.length, 'операция', 'операции', 'операций') + ' · ' +
      state.archive.length + ' в архиве · ' + size + ' · LOCALSTORAGE';
  }
  function submitSettings(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const get = function (name) { return String(fd.get(name) == null ? '' : fd.get(name)).trim(); };
    const startCapital = num(fd.get('startCapital'));
    const goal = num(fd.get('goal'));
    const monthlyGoal = num(fd.get('monthlyGoal'));
    const riskFlat = num(fd.get('riskFlat'));
    const startDate = get('startDate');
    const accent = ACCENTS.indexOf(get('accent')) !== -1 ? get('accent') : 'green';
    const theme = ['dark', 'light', 'matrix'].indexOf(get('theme')) !== -1 ? get('theme') : 'dark';
    const baseCurrency = get('baseCurrency') || '₽';
    let currencyRates = {};
    try {
      currencyRates = JSON.parse(get('currencyRates') || '{}');
      if (typeof currencyRates !== 'object' || Array.isArray(currencyRates)) currencyRates = {};
    } catch (e) { currencyRates = {}; }
    const csvSeparator = get('csvSeparator') || ';';
    const encryptData = fd.get('encryptData') === 'on';
    const encryptPassword = get('encryptPassword');
    if (!(startCapital >= 0)) return toast('Стартовый капитал не может быть отрицательным', 'error');
    if (!(goal > 0)) return toast('Цель должна быть больше нуля', 'error');
    if (!(riskFlat >= 0.1 && riskFlat <= 100)) return toast('Флэт должен быть от 0.1% до 100%', 'error');
    if (!parseISO(startDate)) return toast('Укажите корректную дату старта', 'error');
    if (encryptData && (!encryptPassword || encryptPassword.length < 8)) {
      return toast('Для шифрования укажите пароль минимум 8 символов', 'error');
    }
    state.settings.projectName = get('projectName').slice(0, 48) || 'АРХИТЕКТОР КАПИТАЛА PRO';
    state.settings.currency = get('currency').slice(0, 4) || '₽';
    state.settings.startCapital = startCapital;
    state.settings.goal = goal;
    state.settings.monthlyGoal = monthlyGoal;
    state.settings.riskFlat = riskFlat;
    state.settings.startDate = startDate;
    state.settings.accent = accent;
    state.settings.theme = theme;
    state.settings.baseCurrency = baseCurrency;
    state.settings.currencyRates = currencyRates;
    state.settings.csvSeparator = csvSeparator;
    state.settings.notifyGoal = fd.get('notifyGoal') === 'on';
    state.settings.notifyDrawdown = fd.get('notifyDrawdown') === 'on';
    state.settings.notifyMonthly = fd.get('notifyMonthly') === 'on';
    state.settings.encryptData = encryptData;
    state.settings.encryptPassword = encryptData ? encryptPassword : '';
    state.settings.demo = false;
    commit('Конфигурация сохранена' + (encryptData ? ' (зашифровано)' : ''));
  }

  function cycleAccent() {
    const next = ACCENTS[(ACCENTS.indexOf(state.settings.accent) + 1) % ACCENTS.length];
    state.settings.accent = next;
    renderChrome();
    if (ui.tab === 'settings') {
      const f = $('#settingsForm');
      if (f) f.elements.accent.value = next;
    }
    toast('Цветовой режим: ' + next.toUpperCase());
  }

  /* ============================================================
     13. ЧАСЫ И МАТРИЦА
     ============================================================ */

  function startClock() {
    const timeEl = $('#clockTime');
    const dateEl = $('#clockDate');
    if (!timeEl || !dateEl) return;
    function tick() {
      const now = new Date();
      timeEl.textContent = String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0');
      dateEl.textContent = String(now.getDate()).padStart(2, '0') + '.' +
        String(now.getMonth() + 1).padStart(2, '0') + '.' +
        now.getFullYear();
    }
    tick();
    setInterval(tick, 1000);
  }
  function startMatrix() {
    const canvas = $('#matrix');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, cols, drops;
    let accent = getComputedStyle(document.body).getPropertyValue('--accent-rgb').trim() || '0, 255, 102';
    function resize() {
      w = canvas.width = canvas.parentElement ? canvas.parentElement.clientWidth : window.innerWidth;
      h = canvas.height = window.innerHeight;
      cols = Math.floor(w / 20) + 1;
      drops = [];
      for (let i = 0; i < cols; i++) drops[i] = Math.random() * -100;
    }
    window.__matrixAccent = function () {
      const a = getComputedStyle(document.body).getPropertyValue('--accent-rgb').trim();
      if (a) accent = a;
    };
    window.addEventListener('resize', resize);
    resize();
    const chars = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ0123456789@#$%^&*';
    function draw() {
      ctx.fillStyle = 'rgba(3, 8, 6, 0.08)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = '16px monospace';
      for (let i = 0; i < drops.length; i++) {
        const text = chars.charAt(Math.floor(Math.random() * chars.length));
        ctx.fillStyle = i % 5 === 0 ? 'rgb(' + accent + ')' : '#00ff66';
        ctx.fillText(text, i * 20, drops[i] * 20);
        if (drops[i] * 20 > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }
    setInterval(draw, 50);
  }

  /* ============================================================
     14. ОБРАБОТЧИК ДЕЙСТВИЙ
     ============================================================ */

  function handleAction(action, el) {
    switch (action) {
      case 'new-bet': openBetDialog(); break;
      case 'edit-bet': {
        const bet = findBet(el.dataset.id);
        if (bet) openBetDialog(bet);
        break;
      }
      case 'archive-bet': archiveBet(el.dataset.id); break;
      case 'restore-bet': restoreBet(el.dataset.id); break;
      case 'delete-bet': purgeBet(el.dataset.id); break;
      case 'settle-bet': settleBet(el.dataset.id, el.dataset.status); break;
      case 'new-op': openOpDialog(); break;
      case 'edit-op': {
        const op = findOp(el.dataset.id);
        if (op) openOpDialog(op);
        break;
      }
      case 'archive-op': archiveOp(el.dataset.id); break;
      case 'restore-op': restoreOp(el.dataset.id); break;
      case 'delete-op': purgeOp(el.dataset.id); break;
      case 'restore-item': restoreItem(el.dataset.kind, el.dataset.id); break;
      case 'purge-item': purgeItem(el.dataset.kind, el.dataset.id); break;
      case 'new-strategy': openStrategyDialog(); break;
      case 'delete-strategy': removeStrategy(el.dataset.id); break;
      case 'global-search': openGlobalSearchDialog(); break;
      case 'toggle-accent': cycleAccent(); break;
      case 'export-json': exportJSON(); break;
      case 'export-csv': exportCSV(); break;
      case 'export-xlsx-bets': exportXlsxBets(); break;
      case 'export-xlsx-ops': exportXlsxOps(); break;
      case 'export-xlsx-all': exportXlsxAll(); break;
      case 'export-analytics-csv': exportAnalyticsCSV(); break;
      case 'export-archive-csv': exportArchiveCSV(); break;
      case 'import-json': $('#importFile').click(); break;
      case 'import-csv': $('#importFileCsv').click(); break;
      case 'reset-demo': resetDemo(); break;
      case 'restore-archive': restoreAllArchive(); break;
      case 'calendar-prev': calendarPrevMonth(); break;
      case 'calendar-next': calendarNextMonth(); break;
      case 'calendar-close-detail': {
        $('#calendarDayDetail').style.display = 'none';
        ui.calendarSelectedDate = null;
        break;
      }
      case 'bulk-select-all': {
        const cb = $('#selectAllBets');
        if (cb) cb.click();
        break;
      }
      case 'bulk-archive': bulkArchiveBets(); break;
      case 'bulk-delete': bulkDeleteBets(); break;
      case 'bulk-settle': bulkSettleBets(); break;
      case 'export-bet-json': exportBetJson(el.dataset.id); break;
      case 'export-op-json': exportOpJson(el.dataset.id); break;
      case 'update-currency-rates': {
        fetchCurrencyRates().then(function (rates) {
          const rateStr = JSON.stringify(rates, null, 2);
          const el = document.querySelector('textarea[name="currencyRates"]');
          if (el) el.value = rateStr;
          toast('Курсы валют обновлены из API');
        }).catch(function () {
          toast('Не удалось обновить курсы валют', 'error');
        });
        break;
      }
      case 'clear-data': clearData(); break;
      case 'print-dashboard-report': printAnalytics(); break;
      case 'print-analytics': printAnalytics(); break;
    }
  }

  /* Запуск */
  init();

})();

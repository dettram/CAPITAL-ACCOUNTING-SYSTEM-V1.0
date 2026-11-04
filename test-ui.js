/* АРХИТЕКТОР КАПИТАЛА PRO — unit-тесты для UI и store */
(function () {
  'use strict';

  var passed = 0;
  var failed = 0;

  function assert(condition, message) {
    if (condition) {
      passed++;
      console.log('✓ ' + message);
    } else {
      failed++;
      console.error('✗ ' + message);
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual === expected) {
      passed++;
      console.log('✓ ' + message);
    } else {
      failed++;
      console.error('✗ ' + message + ' (expected: ' + expected + ', actual: ' + actual + ')');
    }
  }

  function assertApprox(actual, expected, delta, message) {
    delta = delta || 0.001;
    if (Math.abs(actual - expected) <= delta) {
      passed++;
      console.log('✓ ' + message);
    } else {
      failed++;
      console.error('✗ ' + message + ' (expected ≈' + expected + ', actual: ' + actual + ')');
    }
  }

  window.runUITests = function (S) {
    var store = S;

    // ============================================================
    // 1. betProfit
    // ============================================================
    assertEqual(store.betProfit({ stake: 100, odds: 2.0, status: 'won', payout: 0 }), 100, 'betProfit won');
    assertEqual(store.betProfit({ stake: 100, odds: 2.0, status: 'lost', payout: 0 }), -100, 'betProfit lost');
    assertEqual(store.betProfit({ stake: 100, odds: 2.0, status: 'void', payout: 0 }), 0, 'betProfit void');
    assertEqual(store.betProfit({ stake: 100, odds: 2.0, status: 'cashout', payout: 150 }), 50, 'betProfit cashout');
    assertEqual(store.betProfit({ stake: 100, odds: 2.0, status: 'pending', payout: 0 }), 0, 'betProfit pending');

    // ============================================================
    // 2. opSigned
    // ============================================================
    assertEqual(store.opSigned({ type: 'deposit', amount: 500 }), 500, 'opSigned deposit');
    assertEqual(store.opSigned({ type: 'withdraw', amount: 500 }), -500, 'opSigned withdraw');
    assertEqual(store.opSigned({ type: 'profit', amount: 300 }), 300, 'opSigned profit');
    assertEqual(store.opSigned({ type: 'loss', amount: 300 }), -300, 'opSigned loss');

    // ============================================================
    // 3. num
    // ============================================================
    assertEqual(store.num('1 234,56'), 1234.56, 'num: "1 234,56" = 1234.56');
    assertEqual(store.num('abc'), 0, 'num: "abc" = 0');
    assertEqual(store.num(null), 0, 'num: null = 0');
    assertEqual(store.num(42), 42, 'num: 42 = 42');

    // ============================================================
    // 4. parseTags / tagsString
    // ============================================================
    var tags = store.parseTags('экспресс, лайв, фаворит ');
    assertEqual(tags.length, 3, 'parseTags: 3 тега');
    assertEqual(tags[0], 'экспресс', 'parseTags[0]');
    assertEqual(store.parseTags('').length, 0, 'parseTags empty');
    assertEqual(store.parseTags(null).length, 0, 'parseTags null');
    assertEqual(store.tagsString(['a', 'b']), 'a, b', 'tagsString join');
    assertEqual(store.tagsString(null), '', 'tagsString null');

    // ============================================================
    // 5. formatMoney / formatPercent / formatCompact
    // ============================================================
    assertEqual(store.formatMoney(1000, '₽', {}), '1 000\u00A0₽', 'formatMoney 1000 ₽');
    assertEqual(store.formatMoney(-250.5, 'BYN', { sign: true }), '-250,5\u00A0BYN', 'formatMoney negative BYN sign');
    assertEqual(store.formatPercent(50), '50%', 'formatPercent 50');
    assertEqual(store.formatPercent(33.333, 2), '33,3%', 'formatPercent 33,3% 2 digits');
    assertEqual(store.formatCompact(1500), '1,5к', 'formatCompact 1500');
    assertEqual(store.formatCompact(1500000), '1,5 млн', 'formatCompact 1.5 млн');
    assertEqual(store.formatCompact(0), '0', 'formatCompact 0');

    // ============================================================
    // 6. normalize
    // ============================================================
    var norm = store.normalize({});
    assertEqual(norm.version, 2, 'normalize version');
    assert(norm.strategies.length > 0, 'normalize strategies');
    assertEqual(norm.settings.currency, '₽', 'normalize default currency');

    var normBYN = store.normalize({ settings: { currency: 'BYN' } });
    assertEqual(normBYN.settings.currency, 'BYN', 'normalize currency BYN');

    var normEnc = store.normalize({ settings: { encryptData: true, encryptPassword: 'test1234' } });
    assertEqual(normEnc.settings.encryptData, true, 'normalize encryptData');

    // ============================================================
    // 7. calc
    // ============================================================
    var testState = store.defaultState(false);
    testState.settings.startCapital = 10000;
    testState.settings.goal = 20000;
    testState.settings.riskFlat = 3;
    testState.bets = [
      { id: 'b1', date: '2026-11-01', strategyId: 'sport', event: 'Тест', league: 'Л', market: 'П1', odds: 2.0, stake: 500, status: 'won', payout: 0, tags: [], note: '', archived: false, createdAt: '2026-11-01T00:00:00Z' },
      { id: 'b2', date: '2026-11-02', strategyId: 'sport', event: 'Тест2', league: 'Л', market: 'П1', odds: 1.8, stake: 300, status: 'lost', payout: 0, tags: [], note: '', archived: false, createdAt: '2026-11-02T00:00:00Z' },
      { id: 'b3', date: '2026-11-03', strategyId: 'sport', event: 'Тест3', league: 'Л', market: 'П1', odds: 2.5, stake: 200, status: 'pending', payout: 0, tags: [], note: '', archived: false, createdAt: '2026-11-03T00:00:00Z' }
    ];
    testState.operations = [
      { id: 'o1', date: '2026-11-01', type: 'profit', strategyId: 'crypto', amount: 1000, tags: [], note: '', archived: false, createdAt: '2026-11-01T00:00:00Z' },
      { id: 'o2', date: '2026-11-02', type: 'withdraw', strategyId: null, amount: 500, tags: [], note: '', archived: false, createdAt: '2026-11-02T00:00:00Z' }
    ];

    var m = store.calc(testState);
    assertEqual(m.betsProfit, 200, 'calc: betsProfit = 200');
    assertEqual(m.pnl, 500, 'calc: pnl = 500');
    assertEqual(m.profit, 700, 'calc: profit = 700');
    assertEqual(m.capital, 10700, 'calc: capital = 10700');
    assertEqual(m.pendingStake, 200, 'calc: pendingStake = 200');
    assertEqual(m.available, 10500, 'calc: available = 10500');
    assertEqual(m.winrate, 50, 'calc: winrate = 50%');
    assertApprox(m.turnoverRoi, 25, 0.01, 'calc: turnoverRoi = 25%');
    assertEqual(m.maxDrawdown, 0, 'calc: maxDrawdown = 0');
    assertEqual(m.streak, 1, 'calc: streak = 1');

    // Проверка prevMonthProfit (если есть)
    if (m.prevMonthProfit !== undefined) {
      assertEqual(typeof m.prevMonthProfit, 'number', 'calc: prevMonthProfit is number');
    }

    // ============================================================
    // 8. strategyStats
    // ============================================================
    var stats = store.strategyStats(testState);
    var sportStat = stats.find(function (s) { return s.id === 'sport'; });
    assertEqual(sportStat.profit, 200, 'strategyStats: sport profit = 200');
    assertEqual(sportStat.bets, 2, 'strategyStats: sport bets = 2');
    assertEqual(sportStat.pending, 1, 'strategyStats: sport pending = 1');

    // ============================================================
    // 9. analytics
    // ============================================================
    var an = store.analytics(testState);
    assertEqual(an.leagues.length, 1, 'analytics: 1 league');
    assertEqual(an.leagues[0].n, 2, 'analytics: settled bets = 2');
    assertEqual(an.leagues[0].won, 1, 'analytics: won = 1');
    assertEqual(an.tags.length, 0, 'analytics: no tags (empty tags array)');

    // ============================================================
    // 10. equitySeries
    // ============================================================
    var series = store.equitySeries(testState, 'all');
    assert(series.length > 0, 'equitySeries: has points');
    assertEqual(series[series.length - 1].performance, m.capital, 'equitySeries: last performance = capital');

    var series30 = store.equitySeries(testState, '30');
    assert(series30.length <= 30, 'equitySeries 30: max 30 points');

    // ============================================================
    // 11. importCSV
    // ============================================================
    var csvText = 'Дата;Направление;Событие;Турнир;Рынок;Кэф;Ставка;Статус;P&L;Теги;Заметка\r\n2026-11-01;sport;Тест;Л;П1;2.0;500;won;100;фаворит;заметка\r\n';
    var parsed = store.importCSV(csvText);
    assert(parsed !== null, 'importCSV: not null');
    assertEqual(parsed.bets.length, 1, 'importCSV: 1 bet');
    assertEqual(parsed.bets[0].event, 'Тест', 'importCSV: event');

    // ============================================================
    // 12. sanitizeBet / sanitizeOp
    // ============================================================
    var sb = store.sanitizeBet({ event: 'Тест', odds: 1.5, stake: 100, status: 'won', tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'] });
    assertEqual(sb.tags.length, 10, 'sanitizeBet: max 10 tags');
    assertEqual(sb.event, 'Тест', 'sanitizeBet: event');

    var so = store.sanitizeOp({ type: 'deposit', amount: 500, tags: ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p'] });
    assertEqual(so.tags.length, 10, 'sanitizeOp: max 10 tags');

    // ============================================================
    // 13. save / load simulation
    // ============================================================
    var saved = store.save(testState);
    assert(saved === true, 'save: returns true');

    console.log('\n=== UI ТЕСТЫ: ' + passed + ' пройдено, ' + failed + ' не пройдено ===');
    if (failed === 0) {
      console.log('Все UI тесты пройдены!');
    } else {
      console.error('Есть ошибки в UI тестах!');
    }
  };

  // Автозапуск, если CA.store уже доступен
  if (window.CA && window.CA.store) {
    window.runUITests(window.CA.store);
  }

})();

/* АРХИТЕКТОР КАПИТАЛА PRO — тесты для store.js */
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

  // Загружаем store через тестовый хелпер (имитируем CA.store)
  // В реальном браузере подключите store.js перед этим скриптом

  window.runTests = function (store) {
    var S = store;

    // ---------- betProfit ----------
    assertEqual(S.betProfit({ stake: 100, odds: 2.0, status: 'won', payout: 0 }), 100, 'betProfit won: 100@2.0 = 100');
    assertEqual(S.betProfit({ stake: 100, odds: 2.0, status: 'lost', payout: 0 }), -100, 'betProfit lost: -100');
    assertEqual(S.betProfit({ stake: 100, odds: 2.0, status: 'void', payout: 0 }), 0, 'betProfit void: 0');
    assertEqual(S.betProfit({ stake: 100, odds: 2.0, status: 'cashout', payout: 150 }), 50, 'betProfit cashout: 150-100 = 50');
    assertEqual(S.betProfit({ stake: 100, odds: 2.0, status: 'pending', payout: 0 }), 0, 'betProfit pending: 0');

    // ---------- opSigned ----------
    assertEqual(S.opSigned({ type: 'deposit', amount: 500 }), 500, 'opSigned deposit: +500');
    assertEqual(S.opSigned({ type: 'withdraw', amount: 500 }), -500, 'opSigned withdraw: -500');
    assertEqual(S.opSigned({ type: 'profit', amount: 300 }), 300, 'opSigned profit: +300');
    assertEqual(S.opSigned({ type: 'loss', amount: 300 }), -300, 'opSigned loss: -300');

    // ---------- num ----------
    assertEqual(S.num('1 234,56'), 1234.56, 'num: "1 234,56" = 1234.56');
    assertEqual(S.num('abc'), 0, 'num: "abc" = 0');
    assertEqual(S.num(null), 0, 'num: null = 0');

    // ---------- parseTags ----------
    var tags = S.parseTags('экспресс, лайв, фаворит ');
    assertEqual(tags.length, 3, 'parseTags: 3 тега');
    assertEqual(tags[0], 'экспресс', 'parseTags[0]: экспресс');
    assertEqual(tags[1], 'лайв', 'parseTags[1]: лайв');
    assertEqual(tags[2], 'фаворит', 'parseTags[2]: фаворит');

    assertEqual(S.parseTags('').length, 0, 'parseTags empty: 0');
    assertEqual(S.parseTags(null).length, 0, 'parseTags null: 0');

    // ---------- normalize ----------
    var normalized = S.normalize({});
    assertEqual(normalized.version, 2, 'normalize: version = 2');
    assert(normalized.strategies.length > 0, 'normalize: strategies exist');
    assert(normalized.settings.currency === '₽', 'normalize: default currency ₽');

    // ---------- normalize с валютой BYN ----------
    var normBYN = S.normalize({ settings: { currency: 'BYN' } });
    assertEqual(normBYN.settings.currency, 'BYN', 'normalize: currency BYN preserved');

    // ---------- calc ----------
    var testState = S.defaultState(false);
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

    var m = S.calc(testState);
    assertEqual(m.betsProfit, 500 - 300, 'calc: betsProfit = 200');
    assertEqual(m.pnl, 1000 - 500, 'calc: pnl = 500');
    assertEqual(m.profit, 700, 'calc: profit = 700');
    assertEqual(m.capital, 10000 + 700, 'calc: capital = 10700');
    assertEqual(m.pendingStake, 200, 'calc: pendingStake = 200');
    assertEqual(m.available, 10700 - 200, 'calc: available = 10500');
    assertEqual(m.winrate, 50, 'calc: winrate = 50%');
    assertEqual(m.turnoverRoi, (200 / 800) * 100, 'calc: turnoverRoi = 25%');
    assertEqual(m.maxDrawdown, 0, 'calc: maxDrawdown = 0 (рост)');
    assertEqual(m.streak, 1, 'calc: streak = 1 (последняя ставка won)');

    // ---------- strategyStats ----------
    var stats = S.strategyStats(testState);
    var sportStat = stats.find(function (s) { return s.id === 'sport'; });
    assertEqual(sportStat.profit, 200, 'strategyStats: sport profit = 200');
    assertEqual(sportStat.bets, 2, 'strategyStats: sport bets = 2');
    assertEqual(sportStat.pending, 1, 'strategyStats: sport pending = 1');

    // ---------- analytics ----------
    var an = S.analytics(testState);
    assertEqual(an.leagues.length, 1, 'analytics: 1 league');
    assertEqual(an.leagues[0].n, 2, 'analytics: league settled bets = 2');
    assertEqual(an.leagues[0].won, 1, 'analytics: league won = 1');

    console.log('\n=== РЕЗУЛЬТАТ: ' + passed + ' пройдено, ' + failed + ' не пройдено ===');
    if (failed === 0) {
      console.log('Все тесты пройдены!');
    } else {
      console.error('Есть ошибки!');
    }
  };

  // Автозапуск, если CA.store уже доступен
  if (window.CA && window.CA.store) {
    window.runTests(window.CA.store);
  }

})();

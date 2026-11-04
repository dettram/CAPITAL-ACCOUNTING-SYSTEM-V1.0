/* АРХИТЕКТОР КАПИТАЛА PRO — интеграционные тесты: жизненный цикл ставки */
import { test, expect } from '@playwright/test';

test.describe('Жизненный цикл ставки', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Очищаем локальное хранилище для чистого теста
    await page.evaluate(() => localStorage.removeItem('capital-architect:v2'));
    await page.reload();
  });

  test('Пользователь может добавить ставку, увидеть её в таблице и капитале', async ({ page }) => {
    // Переходим на вкладку ставок
    await page.click('button[data-tab="bets"]');

    // Нажимаем "НОВАЯ СТАВКА"
    await page.click('button[data-action="new-bet"]');

    // Заполняем форму ставки
    await page.fill('input[name="event"]', 'Реал Мадрид — Барселона');
    await page.fill('input[name="league"]', 'Ла Лига');
    await page.fill('input[name="market"]', 'П1');
    await page.fill('input[name="odds"]', '1.85');
    await page.fill('input[name="stake"]', '1000');
    await page.selectOption('select[name="status"]', 'won');

    // Сохраняем ставку
    await page.click('button[type="submit"]');

    // Проверяем, что ставка появилась в таблице
    await expect(page.locator('table tbody tr')).toContainText('Реал Мадрид — Барселона');
    await expect(page.locator('table tbody tr')).toContainText('1.85');
    await expect(page.locator('table tbody tr')).toContainText('1000');
    await expect(page.locator('table tbody tr')).toContainText('ВЫИГРЫШ');

    // Проверяем, что обновились статистические фишки
    await expect(page.locator('.stat-chip')).toContainText('ВСЕГО СТАВОК');
    await expect(page.locator('.stat-chip b')).toContainText('1');
  });

  test('Пользователь может переместить ставку в архив и восстановить', async ({ page }) => {
    // Сначала добавляем ставку
    await page.click('button[data-tab="bets"]');
    await page.click('button[data-action="new-bet"]');
    await page.fill('input[name="event"]', 'Тестовая ставка для архива');
    await page.fill('input[name="odds"]', '2.00');
    await page.fill('input[name="stake"]', '500');
    await page.selectOption('select[name="status"]', 'won');
    await page.click('button[type="submit"]');

    // Проверяем, что ставка в списке
    await expect(page.locator('table tbody tr')).toContainText('Тестовая ставка для архива');

    // Нажимаем "В архив"
    await page.click('button[data-action="archive-bet"]');

    // Подтверждаем в диалоге (если есть) — arch-bet уже вызывает commit напрямую
    // Ставка должна исчезнуть из таблицы
    await expect(page.locator('table tbody tr')).not.toContainText('Тестовая ставка для архива');

    // Переходим в архив
    await page.click('button[data-tab="archive"]');

    // Проверяем, что ставка в архиве
    await expect(page.locator('.archive-row')).toContainText('Тестовая ставка для архива');

    // Нажимаем "Восстановить"
    await page.click('button[data-action="restore-item"]');

    // Проверяем, что ставка вернулась в список ставок
    await page.click('button[data-tab="bets"]');
    await expect(page.locator('table tbody tr')).toContainText('Тестовая ставка для архива');
  });

  test('Пользователь может безвозвратно удалить ставку из архива', async ({ page }) => {
    // Добавляем ставку
    await page.click('button[data-tab="bets"]');
    await page.click('button[data-action="new-bet"]');
    await page.fill('input[name="event"]', 'Ставка на удаление');
    await page.fill('input[name="odds"]', '1.50');
    await page.fill('input[name="stake"]', '300');
    await page.selectOption('select[name="status"]', 'lost');
    await page.click('button[type="submit"]');

    // Перемещаем в архив
    await page.click('button[data-action="archive-bet"]');

    // Переходим в архив и безвозвратно удаляем
    await page.click('button[data-tab="archive"]');
    await expect(page.locator('.archive-row')).toContainText('Ставка на удаление');

    await page.click('button[data-action="purge-item"]');

    // Подтверждаем удаление
    await page.click('button[data-action="purge-item"]');

    // Проверяем, что ставка удалена из архива
    await expect(page.locator('.archive-row')).not.toContainText('Ставка на удаление');
  });
});

/* АРХИТЕКТОР КАПИТАЛА PRO — интеграционные тесты: валидация формы ставки */
import { test, expect } from '@playwright/test';

test.describe('Валидация формы ставки', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('capital-architect:v2'));
    await page.reload();
  });

  test('Кэф меньше 1.01 вызывает ошибку', async ({ page }) => {
    await page.click('button[data-tab="bets"]');
    await page.click('button[data-action="new-bet"]');

    await page.fill('input[name="event"]', 'Тест события');
    await page.fill('input[name="odds"]', '0.50');
    await page.fill('input[name="stake"]', '100');

    await page.click('button[type="submit"]');

    // Должна появиться toast с ошибкой
    await expect(page.locator('.toast-error')).toContainText('Коэффициент должен быть не меньше 1.01');
  });

  test('Пустое событие вызывает ошибку', async ({ page }) => {
    await page.click('button[data-tab="bets"]');
    await page.click('button[data-action="new-bet"]');

    await page.fill('input[name="odds"]', '2.00');
    await page.fill('input[name="stake"]', '100');

    await page.click('button[type="submit"]');

    await expect(page.locator('.toast-error')).toContainText('Укажите событие');
  });

  test('Сумма ставки больше свободного банка вызывает ошибку', async ({ page }) => {
    await page.click('button[data-tab="bets"]');
    await page.click('button[data-action="new-bet"]');

    await page.fill('input[name="event"]', 'Тест события');
    await page.fill('input[name="odds"]', '2.00');
    await page.fill('input[name="stake"]', '9999999');

    await page.click('button[type="submit"]');

    await expect(page.locator('.toast-error')).toContainText('Ставка превышает свободный банк');
  });

  test('Некорректная дата вызывает ошибку', async ({ page }) => {
    await page.click('button[data-tab="bets"]');
    await page.click('button[data-action="new-bet"]');

    await page.fill('input[name="date"]', 'неправильная-дата');
    await page.fill('input[name="event"]', 'Тест');
    await page.fill('input[name="odds"]', '2.00');
    await page.fill('input[name="stake"]', '100');

    await page.click('button[type="submit"]');

    await expect(page.locator('.toast-error')).toContainText('корректную дату');
  });
});

/* АРХИТЕКТОР КАПИТАЛА PRO — интеграционные тесты: дашборд и KPI */
import { test, expect } from '@playwright/test';

test.describe('Дашборд и KPI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('capital-architect:v2'));
    await page.reload();
  });

  test('Количество ставок обновляется после добавления новой ставки', async ({ page }) => {
    // На дашборде по умолчанию
    await expect(page.locator('.stat-chip')).toContainText('ВСЕГО СТАВОК');

    // Переходим на вкладку ставок и добавляем ставку
    await page.click('button[data-tab="bets"]');
    await page.click('button[data-action="new-bet"]');
    await page.fill('input[name="event"]', 'Кэф тест');
    await page.fill('input[name="odds"]', '2.00');
    await page.fill('input[name="stake"]', '500');
    await page.selectOption('select[name="status"]', 'won');
    await page.click('button[type="submit"]');

    // Возвращаемся на дашборд
    await page.click('button[data-tab="dashboard"]');

    // Проверяем, что статистика обновилась
    await expect(page.locator('.stat-chip b')).toContainText('1');
  });

  test('Переключение вкладок работает корректно', async ({ page }) => {
    // Проверяем, что дашборд активен по умолчанию
    await expect(page.locator('button[data-tab="dashboard"]')).toHaveClass(/is-active/);

    // Переходим на ставки
    await page.click('button[data-tab="bets"]');
    await expect(page.locator('button[data-tab="bets"]')).toHaveClass(/is-active/);

    // Переходим на капитал
    await page.click('button[data-tab="capital"]');
    await expect(page.locator('button[data-tab="capital"]')).toHaveClass(/is-active/);

    // Возвращаемся на дашборд
    await page.click('button[data-tab="dashboard"]');
    await expect(page.locator('button[data-tab="dashboard"]')).toHaveClass(/is-active/);
  });

  test('Переключение цветового режима изменяет акцент', async ({ page }) => {
    // Запоминаем текущий цвет
    const initialColor = await page.evaluate(() => document.body.dataset.accent);

    // Нажимаем кнопку смены акцента
    await page.click('button[data-action="toggle-accent"]');

    // Цвет должен измениться
    const newColor = await page.evaluate(() => document.body.dataset.accent);
    expect(newColor).not.toBe(initialColor);
  });
});

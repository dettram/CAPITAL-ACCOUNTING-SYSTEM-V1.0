# АРХИТЕКТОР КАПИТАЛА PRO v1.0

Терминальный трекер капитала: спортивные ставки, крипто, акции, пассивный доход, аналитика, бюджеты и экспорт отчётов.

## Описание

Локальное приложение (PWA, работает офлайн) для учёта финансовых операций:
- Ставки на спорт с отслеживанием статуса (в игре, выигрыш, проигрыш, возврат, кэшаут)
- Операции капитала (прибыль, убыток, пополнение, вывод)
- Дашборд с кривой капитала, донатом прибыли и статистикой
- Аналитика по лигам, рынкам, коэффициентам, дням недели, тегам
- Календарь ставок
- Экспорт в JSON / CSV / XLSX
- Шифрование данных в браузере (AES-GCM + PBKDF2)
- Service Worker для офлайн-работы

Все данные хранятся **локально в браузере** (IndexedDB / localStorage). Никакой сервер их не получает.

## Структура проекта

```
CAPITAL-ACCOUNTING-SYSTEM-V1.0-main/
├── index.html          # Главная страница приложения
├── app.js              # Основная логика приложения (всё в одном файле)
├── style.css           # Терминальная тема оформления
├── sw.js               # Service Worker (PWA, офлайн-кеш)
├── manifest.json       # Манифест PWA
├── offline.html        # Страница офлайн-режима
├── types.ts            # TypeScript типы
├── tsconfig.json       # Конфигурация TypeScript
├── package.json        # Зависимости и скрипты
├── .eslintrc.json      # ESLint правила
├── .prettierrc         # Prettier форматирование
├── .eslintignore       # Игнор для ESLint
├── ci.yml              # GitHub Actions CI (линтер, типы, E2E)
├── deploy.yml          # GitHub Actions Deploy (GitHub Pages)
├── byn-icon.svg        # Иконка валюты BYN
├── byn-sign.svg        # Знак валюты BYN
├── neo-kannep-mark.svg # Логотип приложения
├── runner.html         # Unit-тесты (UI)
├── runner-ui.html      # Unit-тесты (запуск)
├── test-store.js       # Тесты хранилища
├── test-ui.js          # Тесты интерфейса
├── validation.spec.ts  # E2E: валидация
├── dashboard.spec.ts   # E2E: дашборд
└── bet-lifecycle.spec.ts # E2E: жизненный цикл ставки
```

## Быстрый старт

### Локально
1. Склонируйте репозиторий:
   ```bash
   git clone https://github.com/dettram/CAPITAL-ACCOUNTING-SYSTEM-V1.0.git
   cd CAPITAL-ACCOUNTING-SYSTEM-V1.0
   ```
2. Установите зависимости:
   ```bash
   npm ci
   ```
3. Запустите локальный сервер:
   ```bash
   npx http-server . -p 5500
   ```
4. Откройте `http://localhost:5500` в браузере.

### GitHub Pages
Приложение автоматически разворачивается на GitHub Pages при пуше в ветку `main` (GitHub Actions workflow `.github/workflows/deploy.yml`).

## Скрипты

| Скрипт | Описание |
|--------|----------|
| `npm run lint` | Проверка кода ESLint |
| `npm run lint:fix` | Автоисправление ESLint |
| `npm run format` | Форматирование Prettier |
| `npm run format:check` | Проверка форматирования |
| `npm run type-check` | Проверка типов TypeScript |
| `npm run e2e` | E2E-тесты Playwright |
| `npm run e2e:headed` | E2E-тесты с открытым браузером |

## Технологии

- Vanilla JS (ES2021), без фреймворков
- IndexedDB для хранения данных
- Service Worker + Cache API (PWA)
- SVG-графики (кривая капитала, донат)
- SheetJS (экспорт XLSX)
- Playwright (E2E-тесты)

## Лицензия

MIT
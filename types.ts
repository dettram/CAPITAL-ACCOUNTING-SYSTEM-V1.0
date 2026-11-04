/* АРХИТЕКТОР КАПИТАЛА PRO — типы TypeScript для проверки кода */

/* ---------- базовые типы ---------- */

export type BetStatus = 'pending' | 'won' | 'lost' | 'void' | 'cashout';
export type OpType = 'deposit' | 'withdraw' | 'profit' | 'loss';
export type Accent = 'green' | 'red' | 'cyan' | 'purple' | 'orange' | 'pink';
export type Theme = 'dark' | 'light' | 'matrix';
export type Currency = '₽' | '$' | '€' | '₸' | 'BYN' | '£' | '¥';

/* ---------- модели данных ---------- */

export interface Bet {
  id: string;
  date: string;
  strategyId: string;
  event: string;
  league: string;
  market: string;
  odds: number;
  stake: number;
  status: BetStatus;
  payout: number;
  tags: string[];
  note: string;
  archived: boolean;
  createdAt: string;
}

export interface Operation {
  id: string;
  date: string;
  type: OpType;
  strategyId: string | null;
  amount: number;
  tags: string[];
  note: string;
  archived: boolean;
  createdAt: string;
}

export interface Strategy {
  id: string;
  name: string;
  phase: 1 | 2 | 3;
  color: string;
  note: string;
  monthlyBudget: number;
}

export interface ArchiveItem {
  kind: 'bet' | 'op';
  data: Bet | Operation;
}

export interface Settings {
  projectName: string;
  currency: Currency;
  startCapital: number;
  goal: number;
  monthlyGoal: number;
  riskFlat: number;
  startDate: string;
  accent: Accent;
  demo: boolean;
  notifyGoal: boolean;
  notifyDrawdown: boolean;
  notifyMonthly: boolean;
  csvSeparator: string;
  encryptData: boolean;
  encryptPassword: string;
  theme: Theme;
  baseCurrency: Currency;
  currencyRates: Record<string, number>;
}

export interface CalcResult {
  startCapital: number;
  deposits: number;
  withdrawals: number;
  pnl: number;
  betsProfit: number;
  profit: number;
  capital: number;
  invested: number;
  available: number;
  roi: number;
  goal: number;
  goalPct: number;
  monthlyGoal: number;
  monthProfit: number;
  prevMonthProfit: number;
  winrate: number;
  avgOdds: number;
  turnover: number;
  turnoverRoi: number;
  pendingStake: number;
  pendingPct: number;
  flatStake: number;
  maxDrawdown: number;
  won: number;
  lost: number;
  voided: number;
  cashouts: number;
  settledCount: number;
  streak: number;
  streakType: BetStatus | null;
}

export interface StrategyStat {
  id: string;
  name: string;
  phase: 1 | 2 | 3;
  color: string;
  note: string;
  monthlyBudget: number;
  profit: number;
  count: number;
  bets: number;
  ops: number;
  pending: number;
  stake: number;
  share: number;
}

export interface AnalyticsEntry {
  key: string;
  n: number;
  won: number;
  profit: number;
  turnover: number;
  winrate: number;
  roi: number;
}

export interface AnalyticsResult {
  leagues: AnalyticsEntry[];
  markets: AnalyticsEntry[];
  odds: AnalyticsEntry[];
  weekdays: AnalyticsEntry[];
  months: AnalyticsEntry[];
  tags: AnalyticsEntry[];
}

/* ---------- состояние UI ---------- */

export interface BetSort {
  field: string;
  dir: 'asc' | 'desc';
}

export interface UIState {
  tab: string;
  chartMetric: string;
  chartRange: string;
  betFilter: string;
  betSearch: string;
  journalFilter: string;
  journalSearch: string;
  archiveFilter: string;
  archiveSearch: string;
  editingBet: string | null;
  editingOp: string | null;
  calendarDate: string | null;
  calendarSelectedDate: string | null;
  betSort: BetSort;
  selectedBets: string[];
}

/* ---------- полное состояние приложения ---------- */

export interface AppState {
  version: number;
  settings: Settings;
  strategies: Strategy[];
  bets: Bet[];
  operations: Operation[];
  archive: ArchiveItem[];
}

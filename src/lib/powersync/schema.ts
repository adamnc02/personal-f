import { column, Schema, Table } from '@powersync/web'

// Mirrors personal_finance's Postgres tables (20260831120003, 20260901150000).
// No `id` column declared on any table — PowerSync auto-creates it (always
// `text`, regardless of the source column's real type; our own ids are
// already `text` except households/scenarios which are `uuid`, and uuid
// values sync fine as text). Types are limited to text/integer/real —
// Postgres `boolean` syncs as integer (0/1), `jsonb` syncs as text (a JSON
// string you JSON.parse/stringify at the read/write boundary, same as any
// other client consuming PowerSync's schemaless-underneath sync protocol).

const people = new Table(
  {
    user_id: column.text,
    household_id: column.text,
    linked_user_id: column.text,
    name: column.text,
    color: column.text,
    gross_annual: column.real,
    tax_code: column.text,
    student_loan_plan: column.text,
    pay_frequency: column.text,
    employer_pension_percent: column.real,
    savings_goal_name: column.text,
    savings_goal_target_amount: column.real,
    savings_goal_current_amount: column.real,
    savings_goal_target_date: column.text,
  },
  { indexes: { household: ['household_id'] } },
)

const salary_deductions = new Table(
  {
    user_id: column.text,
    person_id: column.text,
    name: column.text,
    type: column.text,
    amount_type: column.text,
    amount: column.real,
    percent_basis: column.text,
  },
  { indexes: { person: ['person_id'] } },
)

const savings_entries = new Table(
  {
    user_id: column.text,
    person_id: column.text,
    date: column.text,
    amount: column.real,
    note: column.text,
  },
  { indexes: { person: ['person_id'] } },
)

const bills = new Table(
  {
    user_id: column.text,
    owner_id: column.text,
    household_id: column.text,
    name: column.text,
    cost: column.real,
    due_day: column.integer,
    location: column.text,
    payee: column.text,
    payee_share_percent: column.real,
    category: column.text,
    is_standing_order: column.integer, // Postgres boolean -> SQLite 0/1
    icon: column.text,
    icon_color: column.text,
  },
  { indexes: { household: ['household_id'], owner: ['owner_id'] } },
)

const loans = new Table(
  {
    user_id: column.text,
    owner_id: column.text,
    household_id: column.text,
    name: column.text,
    total_amount: column.real,
    monthly_payment: column.real,
    first_payment_date: column.text,
    location: column.text,
    payee: column.text,
    payee_share_percent: column.real,
    icon: column.text,
    icon_color: column.text,
  },
  { indexes: { household: ['household_id'], owner: ['owner_id'] } },
)

const scenarios = new Table({
  user_id: column.text,
  name: column.text,
  payload: column.text, // jsonb -> JSON string; JSON.parse/stringify at the boundary
  created_at: column.text,
})

const households = new Table({
  created_at: column.text,
})

const household_members = new Table(
  {
    household_id: column.text,
    user_id: column.text,
  },
  { indexes: { household: ['household_id'], user: ['user_id'] } },
)
// household_link_codes is deliberately NOT included — it has no grants
// for authenticated at all (reachable only via the two security-definer
// RPCs), so it isn't in the Sync Streams and shouldn't be in this schema.

export const AppSchema = new Schema({
  people,
  salary_deductions,
  savings_entries,
  bills,
  loans,
  scenarios,
  households,
  household_members,
})

export type Database = (typeof AppSchema)['types']
export type PersonRow = Database['people']
export type SalaryDeductionRow = Database['salary_deductions']
export type SavingsEntryRow = Database['savings_entries']
export type BillRow = Database['bills']
export type LoanRow = Database['loans']
export type ScenarioRow = Database['scenarios']
export type HouseholdRow = Database['households']
export type HouseholdMemberRow = Database['household_members']

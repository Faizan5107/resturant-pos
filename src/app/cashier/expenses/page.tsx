import { createClient, createAdminClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate, getOrderDateString } from "@/lib/dates";
import CreateExpenseModal from "@/app/admin/expenses/CreateExpenseModal";

export default async function CashierExpensesPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id) return null;

  const adminClient = createAdminClient();
  const todayStr = getOrderDateString();

  // Fetch expense categories
  const { data: categories } = await adminClient
    .from("expense_categories")
    .select("id, name")
    .eq("restaurant_id", profile.restaurant_id)
    .order("name", { ascending: true });

  // Fetch employees (for salary/advance expenses)
  const { data: employees } = await adminClient
    .from("employees")
    .select("id, full_name")
    .eq("restaurant_id", profile.restaurant_id)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  // Fetch expenses for current business day/shift
  const { data: expenses } = await adminClient
    .from("expenses")
    .select(`
      id,
      expense_date,
      amount,
      note,
      created_at,
      expense_categories(name),
      employees(full_name)
    `)
    .eq("restaurant_id", profile.restaurant_id)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: settings } = await adminClient
    .from("restaurant_settings")
    .select("currency")
    .eq("restaurant_id", profile.restaurant_id)
    .single();

  const currency = settings?.currency || "PKR";
  const todayExpenses = (expenses || []).filter((e) => e.expense_date === todayStr);
  const totalTodayExpenses = todayExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">
            Daily Expenses
          </h1>
          <p className="text-xs text-zinc-500">
            Record cashier cash payouts, market purchases, and daily operating expenses.
          </p>
        </div>
        <CreateExpenseModal
          categories={categories || []}
          employees={employees || []}
        />
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-black p-4 rounded-lg bg-white space-y-1">
          <p className="text-xs font-semibold text-zinc-500 uppercase">
            Today's Recorded Expenses ({formatDate(todayStr)})
          </p>
          <p className="text-2xl font-bold text-black">
            {formatMoney(totalTodayExpenses, currency)}
          </p>
        </div>
        <div className="border border-black p-4 rounded-lg bg-white space-y-1">
          <p className="text-xs font-semibold text-zinc-500 uppercase">
            Expense Payouts Today
          </p>
          <p className="text-2xl font-bold text-black">
            {todayExpenses.length} entries
          </p>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="border border-black rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-black text-white text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Date</th>
              <th className="py-3 px-4 font-semibold">Category</th>
              <th className="py-3 px-4 font-semibold">Staff / Payee</th>
              <th className="py-3 px-4 font-semibold">Note</th>
              <th className="py-3 px-4 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-800">
            {(!expenses || expenses.length === 0) ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500 text-xs">
                  No expenses recorded yet. Click "+ Record Expense" to log cash payouts.
                </td>
              </tr>
            ) : (
              expenses.map((expense: any) => (
                <tr key={expense.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="py-3 px-4 text-xs font-semibold text-black">
                    {formatDate(expense.expense_date)}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <span className="px-2 py-0.5 border border-zinc-300 rounded font-medium text-black">
                      {expense.expense_categories?.name || "General"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-zinc-600">
                    {expense.employees?.full_name || "-"}
                  </td>
                  <td className="py-3 px-4 text-xs text-zinc-600">
                    {expense.note || "-"}
                  </td>
                  <td className="py-3 px-4 text-xs font-bold text-black text-right">
                    {formatMoney(expense.amount, currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

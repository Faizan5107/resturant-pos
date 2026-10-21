import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { firstRelation } from "@/lib/relations";
import { getSettings } from "@/lib/server-data";
import CreateExpenseModal from "./CreateExpenseModal";

export default async function AdminExpensesPage() {
  const supabase = await createClient();

  const [
    { data: categories, error: categoriesError },
    { data: employees, error: employeesError },
    { data: expenses, error: expensesError },
    settings,
  ] = await Promise.all([
    supabase
      .from("expense_categories")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(500),
    supabase
      .from("employees")
      .select("id, full_name")
      .order("full_name", { ascending: true })
      .limit(500),
    supabase
      .from("expenses")
      .select(
        "id, expense_date, category_id, employee_id, amount, note, expense_categories(name), employees(full_name)"
      )
      .order("expense_date", { ascending: false })
      .limit(500),
    getSettings("currency"),
  ]);
  if (categoriesError) throw categoriesError;
  if (employeesError) throw employeesError;
  if (expensesError) throw expensesError;

  const currency = settings?.currency || "PKR";
  const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">
            Expenses
          </h1>
          <p className="text-xs text-zinc-500">
            Track operating expenses, rent, utilities, and salary payouts.
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-[10px] uppercase font-semibold text-zinc-500">Total Recorded</p>
            <p className="text-lg font-bold text-black">{formatMoney(totalExpenses, currency)}</p>
          </div>
          <CreateExpenseModal categories={categories || []} employees={employees || []} />
        </div>
      </div>

      {/* Expenses Table */}
      <div className="border border-black rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-black text-white text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Date</th>
              <th className="py-3 px-4 font-semibold">Category</th>
              <th className="py-3 px-4 font-semibold">Description / Note</th>
              <th className="py-3 px-4 font-semibold">Linked Employee</th>
              <th className="py-3 px-4 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-800">
            {(!expenses || expenses.length === 0) ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500 text-xs">
                  No expenses recorded yet. Click "+ Record Expense" to add one.
                </td>
              </tr>
            ) : (
              expenses.map((e) => (
                <tr key={e.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="py-3 px-4 text-xs font-semibold text-black">
                    {formatDate(e.expense_date)}
                  </td>
                  <td className="py-3 px-4 text-xs font-semibold">
                    {firstRelation(e.expense_categories)?.name || "Uncategorized"}
                  </td>
                  <td className="py-3 px-4 text-xs text-zinc-600">
                    {e.note || "-"}
                  </td>
                  <td className="py-3 px-4 text-xs text-zinc-600">
                    {firstRelation(e.employees)?.full_name || "-"}
                  </td>
                  <td className="py-3 px-4 text-xs font-bold text-black text-right">
                    {formatMoney(e.amount, currency)}
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

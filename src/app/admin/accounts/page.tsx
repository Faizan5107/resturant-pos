import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import CreatePartyModal from "./CreatePartyModal";
import RecordPaymentModal from "./RecordPaymentModal";
import AddCreditModal from "./AddCreditModal";

export default async function AdminAccountsPage() {
  const supabase = await createClient();

  // Fetch Parties with balance
  const { data: parties } = await supabase
    .from("parties")
    .select(`
      *,
      ledger_entries(debit, credit)
    `)
    .order("name", { ascending: true });

  // Fetch Ledger Entries statement
  const { data: ledgerEntries } = await supabase
    .from("ledger_entries")
    .select(`
      *,
      parties(name, type)
    `)
    .order("entry_date", { ascending: false });

  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select("currency")
    .single();

  const currency = settings?.currency || "PKR";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">
            Accounts
          </h1>
          <p className="text-xs text-zinc-500">
            Manage suppliers, customer ledgers, credit purchases, and payments.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <AddCreditModal parties={parties || []} />
          <RecordPaymentModal parties={parties || []} />
          <CreatePartyModal />
        </div>
      </div>

      {/* Parties Balance Summary Grid */}
      <div className="grid grid-cols-3 gap-4">
        {(!parties || parties.length === 0) ? (
          <div className="col-span-3 border border-black p-6 rounded-lg bg-white text-center text-xs text-zinc-500">
            No parties registered yet. Click "+ Add Supplier / Party" to create one.
          </div>
        ) : (
          parties.map((p) => {
            const totalCredit = (p.ledger_entries || []).reduce((sum: number, l: any) => sum + Number(l.credit), 0);
            const totalDebit = (p.ledger_entries || []).reduce((sum: number, l: any) => sum + Number(l.debit), 0);
            const balance = totalCredit - totalDebit;

            return (
              <div key={p.id} className="border border-black p-4 rounded-lg bg-white space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-base text-black">{p.name}</span>
                    {p.phone && <p className="text-xs text-zinc-500">{p.phone}</p>}
                  </div>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 border border-black rounded">
                    {p.type}
                  </span>
                </div>

                <div className="border-t border-zinc-200 pt-2 flex justify-between items-center text-xs">
                  <span className="text-zinc-600">Balance Payable:</span>
                  <span
                    className={`font-bold ${
                      balance > 0 ? "text-black text-sm" : "text-zinc-500"
                    }`}
                  >
                    {formatMoney(balance, currency)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Ledger Statement Table */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-black tracking-tight">Ledger Statement</h2>
        <div className="border border-black rounded-lg overflow-hidden bg-white">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-black text-white text-xs uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Party Name</th>
                <th className="py-3 px-4 font-semibold">Description</th>
                <th className="py-3 px-4 font-semibold text-right">Debit (Paid)</th>
                <th className="py-3 px-4 font-semibold text-right">Credit (Billed)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-zinc-800">
              {(!ledgerEntries || ledgerEntries.length === 0) ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500 text-xs">
                    No ledger entries recorded yet.
                  </td>
                </tr>
              ) : (
                ledgerEntries.map((l) => (
                  <tr key={l.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="py-3 px-4 text-xs font-semibold text-black">
                      {formatDate(l.entry_date)}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold">
                      {(l.parties as any)?.name || "-"}
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-600">
                      {l.description}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-right text-black">
                      {l.debit > 0 ? formatMoney(l.debit, currency) : "-"}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-right text-black">
                      {l.credit > 0 ? formatMoney(l.credit, currency) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

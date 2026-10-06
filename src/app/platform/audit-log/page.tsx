import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";

export default async function PlatformAuditLogPage() {
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("platform_audit_log")
    .select("*, restaurants(name, slug)")
    .order("at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">
            Audit Log
          </h1>
          <p className="text-xs text-zinc-500">
            Immutable log of all platform-level actions. Showing latest 200 entries.
          </p>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="border border-black rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-black text-white text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Timestamp</th>
              <th className="py-3 px-4 font-semibold">Action</th>
              <th className="py-3 px-4 font-semibold">Restaurant</th>
              <th className="py-3 px-4 font-semibold">Actor ID</th>
              <th className="py-3 px-4 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-800">
            {(!logs || logs.length === 0) ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500 text-xs">
                  No audit log entries found.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const restaurant = log.restaurants as any;
                return (
                  <tr key={log.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="py-3 px-4 text-xs text-zinc-600 whitespace-nowrap">
                      {formatDateTime(log.at)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-md bg-black text-white font-mono">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {restaurant ? (
                        <span>
                          <span className="font-semibold text-black">{restaurant.name}</span>
                          <span className="text-zinc-400 font-mono ml-1">({restaurant.slug})</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-zinc-500">
                      {log.actor_id ? log.actor_id.slice(0, 8) + "…" : <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-zinc-600 max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details) : <span className="text-zinc-400">—</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

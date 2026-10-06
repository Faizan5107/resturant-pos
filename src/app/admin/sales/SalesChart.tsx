"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DailySaleData {
  sale_date: string;
  net_sales: number;
  paid_orders_count: number;
}

export default function SalesChart({ data }: { data: DailySaleData[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-zinc-400 border border-zinc-200 rounded-lg">
        No sales data available for chart rendering
      </div>
    );
  }

  return (
    <div className="h-72 w-full border border-black p-4 rounded-lg bg-white">
      <p className="text-xs font-bold uppercase tracking-wider text-black mb-4">
        Daily Revenue Trend (Grayscale)
      </p>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data}>
          <XAxis
            dataKey="sale_date"
            stroke="#09090b"
            fontSize={11}
            tickLine={false}
          />
          <YAxis stroke="#09090b" fontSize={11} tickLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#000000",
              color: "#ffffff",
              borderRadius: "4px",
              fontSize: "12px",
            }}
          />
          {/* Strictly Grayscale Fill */}
          <Bar dataKey="net_sales" fill="#18181b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

/**
 * /~offline — shown by the service worker when a navigation request fails
 * because the browser has no network AND the page isn't cached yet.
 *
 * This should virtually never appear for Cashier routes (which are served
 * from the NetworkFirst cache), but acts as a safety net for Admin/Platform.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-white text-black flex items-center justify-center p-4">
      <div className="max-w-md w-full border border-black p-8 rounded-lg text-center space-y-4">
        <div className="inline-block border-2 border-black rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wider">
          ⚡ Offline
        </div>
        <h1 className="text-xl font-bold">You are currently offline</h1>
        <p className="text-sm text-zinc-600">
          This page requires a network connection and is not available offline.
        </p>
        <p className="text-sm text-zinc-600">
          The <strong className="text-black">Cashier</strong> terminal works offline. Navigate back to continue taking orders.
        </p>
        <div className="pt-2">
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2.5 bg-black text-white text-xs font-semibold rounded hover:bg-zinc-800 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-md w-full border border-black p-8 rounded-lg text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-black">
          Subscription Inactive
        </h1>
        <p className="text-zinc-600 text-sm">
          Your restaurant subscription is currently suspended or inactive. Please contact system support to reactivate your account.
        </p>
        <div className="pt-4 border-t border-zinc-200">
          <a
            href="/login"
            className="inline-block px-4 py-2 bg-black text-white rounded-md text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}

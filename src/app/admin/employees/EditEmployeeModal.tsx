"use client";

import { useState } from "react";
import { updateEmployeeAction } from "./actions";

interface Employee {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

export default function EditEmployeeModal({ employee }: { employee: Employee }) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.append("id", employee.id);
    const result = await updateEmployeeAction(null, formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setIsOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-2 py-1 text-xs text-blue-600 hover:underline font-semibold"
      >
        Edit
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <h2 className="text-base font-bold text-black">Edit Employee</h2>
              <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-black font-semibold text-lg">X</button>
            </div>

            {error && (
              <div className="p-3 border border-black bg-zinc-100 text-black text-xs rounded-md">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">Full Name</label>
                <input name="fullName" type="text" required defaultValue={employee.full_name}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">New Password</label>
                <input name="password" type="password" minLength={6}
                  placeholder="Leave empty to keep current password"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black" />
                <p className="text-[10px] text-zinc-500 mt-0.5">Minimum 6 characters</p>
              </div>

              <div className="flex items-center space-x-2">
                <input type="checkbox" id={"isActive-" + employee.id} name="isActive"
                  defaultChecked={employee.is_active}
                  className="rounded border-zinc-300 text-black focus:ring-black" />
                <label htmlFor={"isActive-" + employee.id} className="text-xs font-semibold text-black">
                  Active (can login)
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-200">
                <button type="button" onClick={() => setIsOpen(false)}
                  className="px-4 py-2 border border-zinc-300 text-zinc-700 rounded-md text-xs font-semibold hover:border-black">
                  Cancel
                </button>
                <button type="submit" disabled={loading}
                  className="px-4 py-2 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50">
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
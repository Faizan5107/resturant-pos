"use client";

import { useState, useRef } from "react";
import { updateRestaurantSettingsAction } from "./actions";

interface SettingsProps {
  initialSettings: {
    address?: string | null;
    phone?: string | null;
    slogan?: string | null;
    currency: string;
    timezone: string;
    tax_rate: number;
    receipt_footer?: string | null;
    paper_width?: string | null;
    enable_donation?: boolean;
    donation_percentage?: number;
    enable_service_fee?: boolean;
    service_fee_amount?: number;
  };
  restaurantName?: string;
  logoUrl?: string;
}

export default function SettingsForm({ initialSettings, restaurantName = "", logoUrl = "" }: SettingsProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState((initialSettings?.tax_rate ?? 0) > 0);
  const [donationEnabled, setDonationEnabled] = useState(Boolean(initialSettings?.enable_donation));
  const [donationPercent, setDonationPercent] = useState<number>(initialSettings?.donation_percentage ?? 2.5);
  const [serviceFeeEnabled, setServiceFeeEnabled] = useState(Boolean(initialSettings?.enable_service_fee));
  const [serviceFeeAmount, setServiceFeeAmount] = useState<number>(initialSettings?.service_fee_amount ?? 0);

  // Logo Preview & Removal state
  const [previewLogo, setPreviewLogo] = useState<string | null>(logoUrl || null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRemoveLogo(false);
      const url = URL.createObjectURL(file);
      setPreviewLogo(url);
    }
  };

  const handleRemoveLogo = () => {
    setPreviewLogo(null);
    setRemoveLogo(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    if (removeLogo) {
      formData.set("removeLogo", "true");
    }

    const result = await updateRestaurantSettingsAction(null, formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
  };

  return (
    <form encType="multipart/form-data" onSubmit={handleSubmit} className="border border-black rounded-lg p-6 bg-white space-y-6 max-w-2xl">
      {error && (
        <div className="p-3 border border-black bg-zinc-100 text-black text-xs rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 border border-black bg-zinc-900 text-white text-xs rounded-md font-semibold">
          Settings updated successfully!
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-xs font-bold text-black uppercase tracking-wider border-b pb-2">
          Restaurant Identity & Slip Info
        </h3>

        {/* Restaurant Name */}
        <div>
          <label className="block text-xs font-semibold text-black mb-1">
            Restaurant Name
          </label>
          <input
            name="restaurantName"
            type="text"
            defaultValue={restaurantName}
            placeholder="e.g. Cheesy Bites"
            className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
          />
        </div>

        {/* Logo Upload Section */}
        <div>
          <label className="block text-xs font-semibold text-black mb-1">
            Restaurant Logo Image
          </label>
          <input type="hidden" name="removeLogo" value={removeLogo ? "true" : "false"} />

          <div className="border border-dashed border-zinc-300 rounded-md p-4 bg-zinc-50 flex flex-col sm:flex-row items-center gap-4">
            {previewLogo ? (
              <div className="relative group flex-shrink-0">
                <div className="w-24 h-24 border border-zinc-200 rounded-md bg-white p-2 flex items-center justify-center overflow-hidden">
                  <img
                    src={previewLogo}
                    alt="Logo Preview"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="mt-2 w-full text-center text-[11px] text-red-600 hover:text-red-800 font-semibold"
                >
                  Remove Logo
                </button>
              </div>
            ) : (
              <div className="w-24 h-24 border border-dashed border-zinc-300 rounded-md bg-white flex flex-col items-center justify-center text-zinc-400 text-xs">
                <span>No Logo</span>
              </div>
            )}

            <div className="space-y-2 flex-1">
              <input
                ref={fileInputRef}
                name="logoFile"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full text-xs text-zinc-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-black file:text-white hover:file:bg-zinc-800 cursor-pointer"
              />
              <p className="text-[11px] text-zinc-500 leading-normal">
                Upload your restaurant logo (PNG or JPG). High contrast black & white images print best on thermal slips.
              </p>
            </div>
          </div>
        </div>

        {/* Phone & Slogan */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-black mb-1">
              Restaurant Phone Number
            </label>
            <input
              name="phone"
              type="text"
              defaultValue={initialSettings?.phone || ""}
              placeholder="+92 300 0000000"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-black mb-1">
              Restaurant Slogan / Tagline
            </label>
            <input
              name="slogan"
              type="text"
              defaultValue={initialSettings?.slogan || initialSettings?.receipt_footer || ""}
              placeholder="e.g. Taste the Perfection!"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-black mb-1">
            Address
          </label>
          <textarea
            name="address"
            rows={2}
            defaultValue={initialSettings?.address || ""}
            placeholder="Restaurant location address..."
            className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
          />
        </div>
      </div>

      <div className="space-y-4 pt-2">
        <h3 className="text-xs font-bold text-black uppercase tracking-wider border-b pb-2">
          Tax & Sales Options
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-black mb-1">
              Tax Settings
            </label>
            <div className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                id="taxEnabled"
                checked={taxEnabled}
                onChange={(e) => setTaxEnabled(e.target.checked)}
                className="rounded border-zinc-300 text-black focus:ring-black"
              />
              <label htmlFor="taxEnabled" className="text-xs font-semibold text-black">
                Enable Tax (GST / Sales Tax)
              </label>
            </div>
            {taxEnabled && (
              <input
                name="taxRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={initialSettings?.tax_rate ?? 0}
                placeholder="Tax Percentage (%)"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
              />
            )}
            {!taxEnabled && <input type="hidden" name="taxRate" value="0" />}
          </div>

          <div>
            <label className="block text-xs font-semibold text-black mb-1">
              Currency Code
            </label>
            <input
              name="currency"
              type="text"
              defaultValue={initialSettings?.currency || "PKR"}
              placeholder="PKR"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
            />
          </div>
        </div>
      </div>

      {/* Donation Settings Section */}
      <div className="border border-zinc-200 bg-zinc-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-black uppercase tracking-wider">
              Charity & Donation Settings
            </h4>
            <p className="text-[11px] text-zinc-500">
              Calculate charitable donation percentage on daily net sales and display on the dashboard.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              name="enableDonation"
              value="true"
              checked={donationEnabled}
              onChange={(e) => setDonationEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
          </label>
        </div>

        {donationEnabled && (
          <div className="pt-2 border-t border-zinc-200 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-black mb-1">
                Donation Percentage (%)
              </label>
              <div className="relative">
                <input
                  name="donationPercentage"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={donationPercent}
                  onChange={(e) => setDonationPercent(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 2.5"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black pr-8 bg-white"
                />
                <span className="absolute right-3 top-2.5 text-xs text-zinc-400 font-semibold">%</span>
              </div>
            </div>
            <div className="flex items-center">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-900 text-xs w-full">
                <p className="font-semibold text-[11px]">Preview:</p>
                <p className="text-[11px] text-emerald-800">
                  {donationPercent}% of net sales will be tracked daily and highlighted on your admin dashboard.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Service Fee Settings Section */}
      <div className="border border-zinc-200 bg-zinc-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-black uppercase tracking-wider">
              Dine-In Service Fee
            </h4>
            <p className="text-[11px] text-zinc-500">
              Automatically add a fixed service fee to all Dine-In orders.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              name="enableServiceFee"
              value="true"
              checked={serviceFeeEnabled}
              onChange={(e) => setServiceFeeEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
          </label>
        </div>

        {serviceFeeEnabled && (
          <div className="pt-2 border-t border-zinc-200 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-black mb-1">
                Service Fee Amount
              </label>
              <div className="relative">
                <input
                  name="serviceFeeAmount"
                  type="number"
                  step="1"
                  min="0"
                  value={serviceFeeAmount}
                  onChange={(e) => setServiceFeeAmount(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 50"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black pr-16 bg-white"
                />
                <span className="absolute right-3 top-2.5 text-xs text-zinc-400 font-semibold">PKR</span>
              </div>
            </div>
            <div className="flex items-center">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-blue-900 text-xs w-full">
                <p className="font-semibold text-[11px]">Preview:</p>
                <p className="text-[11px] text-blue-800">
                  PKR {serviceFeeAmount} will be added to every Dine-In order and printed on the customer slip.
                </p>
              </div>
            </div>
          </div>
        )}
        {!serviceFeeEnabled && <input type="hidden" name="serviceFeeAmount" value="0" />}
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-zinc-200 pt-4">
        <div>
          <label className="block text-xs font-semibold text-black mb-1">
            Timezone
          </label>
          <input
            name="timezone"
            type="text"
            defaultValue={initialSettings?.timezone || "Asia/Karachi"}
            placeholder="Asia/Karachi"
            className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-black mb-1">
            Paper Width
          </label>
          <select
            name="paperWidth"
            defaultValue={initialSettings?.paper_width || "80mm"}
            className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
          >
            <option value="80mm">80mm Thermal</option>
            <option value="58mm">58mm Thermal</option>
          </select>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-black text-white rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Saving Settings..." : "Save Restaurant Settings"}
        </button>
      </div>
    </form>
  );
}

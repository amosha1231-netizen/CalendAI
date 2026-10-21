import React, { useState, useEffect, useCallback } from "react";
import { X, Loader2, Plus, Trash2, Pencil, CheckCircle2, RotateCcw, Wallet } from "lucide-react";
import { listExpenses, createExpense, updateExpense, deleteExpense } from "../api/expenses";

const CATEGORIES_HE = [
  { value: "wedding", label: "💍 חתונה" },
  { value: "bar_mitzvah", label: "🕎 בר/בת מצווה" },
  { value: "trip", label: "✈️ טיול" },
  { value: "birthday", label: "🎂 יום הולדת" },
  { value: "gift", label: "🎁 מתנה" },
  { value: "holiday", label: "🎉 חג" },
  { value: "other", label: "💰 אחר" }
];

const CATEGORIES_EN = [
  { value: "wedding", label: "💍 Wedding" },
  { value: "bar_mitzvah", label: "🕎 Bar/Bat Mitzvah" },
  { value: "trip", label: "✈️ Trip" },
  { value: "birthday", label: "🎂 Birthday" },
  { value: "gift", label: "🎁 Gift" },
  { value: "holiday", label: "🎉 Holiday" },
  { value: "other", label: "💰 Other" }
];

const emptyForm = { title: "", amount: "", category: "other", expectedDate: "", notes: "" };

export default function ExpectedExpenses({ lang, onClose, prefill, onConsumedPrefill }) {
  const isRtl = lang === "he";
  const categories = lang === "he" ? CATEGORIES_HE : CATEGORIES_EN;
  const t = (he, en) => (lang === "he" ? he : en);

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("expected");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const getCategoryLabel = (cat) => {
    const found = categories.find(c => c.value === cat);
    return found ? found.label : categories[categories.length - 1].label;
  };

  const fetchExpenses = useCallback(async (status) => {
    setLoading(true);
    setError("");
    try {
      const data = await listExpenses(status === "all" ? undefined : status);
      setExpenses(data.expenses || []);
    } catch (err) {
      setError(err.response?.data?.error || t("שגיאה בטעינת ההוצאות.", "Failed to load expenses."));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    fetchExpenses(statusFilter);
  }, [statusFilter, fetchExpenses]);

  // If opened right after the AI suggested an expense (e.g. a wedding was just scheduled),
  // open the add form pre-filled so the user only needs to confirm/adjust it.
  useEffect(() => {
    if (prefill) {
      setForm({
        title: prefill.title || "",
        amount: "",
        category: prefill.category || "other",
        expectedDate: "",
        notes: ""
      });
      setEditingId(null);
      setShowForm(true);
      if (onConsumedPrefill) onConsumedPrefill();
    }
  }, [prefill]);

  const openNewForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (expense) => {
    setForm({
      title: expense.title,
      amount: expense.amount === null || expense.amount === undefined ? "" : String(expense.amount),
      category: expense.category,
      expectedDate: expense.expectedDate || "",
      notes: expense.notes || ""
    });
    setEditingId(expense._id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError(t("נדרשת כותרת להוצאה.", "A title is required."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await updateExpense(editingId, form);
      } else {
        await createExpense(form);
      }
      setShowForm(false);
      await fetchExpenses(statusFilter);
    } catch (err) {
      setError(err.response?.data?.error || t("שגיאה בשמירת ההוצאה.", "Failed to save expense."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteExpense(id);
      setExpenses(prev => prev.filter(e => e._id !== id));
    } catch (err) {
      setError(err.response?.data?.error || t("שגיאה במחיקת ההוצאה.", "Failed to delete expense."));
    }
  };

  const handleToggleStatus = async (expense) => {
    const newStatus = expense.status === "paid" ? "expected" : "paid";
    try {
      const data = await updateExpense(expense._id, { status: newStatus });
      setExpenses(prev => {
        const updated = data.expense;
        if (statusFilter !== "all" && updated.status !== statusFilter) {
          return prev.filter(e => e._id !== expense._id);
        }
        return prev.map(e => (e._id === expense._id ? updated : e));
      });
    } catch (err) {
      setError(err.response?.data?.error || t("שגיאה בעדכון ההוצאה.", "Failed to update expense."));
    }
  };

  const totalExpected = expenses
    .filter(e => e.status === "expected")
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" dir={isRtl ? "rtl" : "ltr"}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-gray-900">
              {t("💰 הוצאות צפויות", "💰 Expected Expenses")}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Filters + Add button */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2">
            {[
              { value: "expected", label: t("צפויות", "Expected") },
              { value: "paid", label: t("שולמו", "Paid") },
              { value: "all", label: t("הכל", "All") }
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  statusFilter === opt.value
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={openNewForm}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
          >
            <Plus className="w-4 h-4" />
            {t("הוצאה חדשה", "New Expense")}
          </button>
        </div>

        {/* Total */}
        {statusFilter !== "paid" && (
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-sm text-emerald-800 font-medium">
            {t("סה״כ צפוי:", "Total expected:")} ₪{totalExpected.toLocaleString()}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-red-50 text-red-700 text-sm border-b border-red-100">{error}</div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center text-gray-400 py-10 text-sm">
              {t("אין הוצאות להצגה.", "No expenses to show.")}
            </div>
          ) : (
            expenses.map(expense => (
              <div
                key={expense._id}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${
                  expense.status === "paid" ? "bg-gray-50 border-gray-200" : "bg-white border-emerald-100"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800 truncate">{expense.title}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                      {getCategoryLabel(expense.category)}
                    </span>
                    {expense.status === "paid" && (
                      <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                        {t("שולם", "Paid")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                    {expense.amount !== null && expense.amount !== undefined && (
                      <span className="font-medium text-gray-700">₪{Number(expense.amount).toLocaleString()}</span>
                    )}
                    {expense.expectedDate && <span>{expense.expectedDate}</span>}
                    {expense.notes && <span className="truncate">{expense.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleStatus(expense)}
                    title={expense.status === "paid" ? t("סמן כצפוי", "Mark as expected") : t("סמן כשולם", "Mark as paid")}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                  >
                    {expense.status === "paid" ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEditForm(expense)}
                    title={t("ערוך", "Edit")}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(expense._id)}
                    title={t("מחק", "Delete")}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-3">
            <h3 className="text-sm font-bold text-gray-700">
              {editingId ? t("עריכת הוצאה", "Edit Expense") : t("הוצאה צפויה חדשה", "New Expected Expense")}
            </h3>
            <input
              type="text"
              placeholder={t("כותרת (לדוגמה: חתונה של דני)", "Title (e.g. Dani's wedding)")}
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              className="w-full max-w-full box-border px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex gap-2">
              <select
                value={form.category}
                onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
              >
                {categories.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder={t("סכום (₪)", "Amount")}
                value={form.amount}
                onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <input
              type="date"
              value={form.expectedDate}
              onChange={(e) => setForm(prev => ({ ...prev, expectedDate: e.target.value }))}
              className="w-full max-w-full box-border px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            />
            <textarea
              placeholder={t("הערות (אופציונלי)", "Notes (optional)")}
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              className="w-full max-w-full box-border px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-60"
              >
                {saving ? t("שומר...", "Saving...") : t("שמור", "Save")}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition"
              >
                {t("ביטול", "Cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

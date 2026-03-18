'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import { importCsv } from '@/lib/api';

const CSV_COLUMNS = [
  { col: 'Title / Description', required: true, note: 'Transaction description' },
  { col: 'Amount', required: true, note: 'Number or "Rp1,000,000" format' },
  { col: 'Type', required: true, note: '"income" or "outcome"' },
  { col: 'Category', required: true, note: 'Auto-created if not found' },
  { col: 'Timestamp / Date / Time', required: true, note: 'M/D/YYYY H:mm:ss, YYYY-MM-DD HH:mm:ss, or ISO 8601' },
  { col: 'Timezone', required: false, note: 'IANA timezone, defaults to Asia/Jakarta' },
];

function SuccessModal({ result, onClose }) {
  const router = useRouter();
  const allOk = result.failed === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-5 ${allOk ? 'bg-emerald-50' : 'bg-amber-50'}`}>
          <div className="text-3xl mb-2">{allOk ? '✅' : '⚠️'}</div>
          <h2 className="text-lg font-bold text-gray-900">
            {allOk ? 'Import complete!' : 'Import finished with some errors'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {result.success} of {result.total} rows imported successfully
          </p>
        </div>

        {/* Stats */}
        <div className="px-6 py-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{result.total}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total rows</p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
            <p className="text-xl font-bold text-emerald-700">{result.success}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Imported</p>
          </div>
          <div className={`rounded-xl p-3 text-center ${result.failed > 0 ? 'bg-rose-50 border border-rose-200' : 'bg-gray-50 border border-gray-200'}`}>
            <p className={`text-xl font-bold ${result.failed > 0 ? 'text-rose-700' : 'text-gray-400'}`}>{result.failed}</p>
            <p className={`text-xs mt-0.5 ${result.failed > 0 ? 'text-rose-600' : 'text-gray-400'}`}>Failed</p>
          </div>
        </div>

        {/* Row errors */}
        {result.errors?.length > 0 && (
          <div className="px-6 pb-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 max-h-36 overflow-y-auto">
              <p className="text-xs font-semibold text-amber-800 mb-1.5">Skipped rows</p>
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-700 flex gap-2">
                    <span className="shrink-0 text-amber-400">•</span>{e}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={() => router.push('/')}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            Go to dashboard
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Import another
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ImportPage() {
  const [file, setFile]       = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');
  const inputRef = useRef(null);

  const clearFile = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.endsWith('.csv') && f.type !== 'text/csv') {
      setError('Only CSV files are allowed');
      return;
    }
    setFile(f);
    setResult(null);
    setError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Please select a CSV file'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await importCsv(file);
      clearFile();           // remove the file immediately on success
      setResult(res.data);   // open modal
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    setResult(null);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />

        {result && <SuccessModal result={result} onClose={handleModalClose} />}

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Import CSV</h1>
          <p className="text-sm text-gray-500 mb-6">Bulk-import transactions from a CSV exported from your spreadsheet</p>

          <div className="max-w-2xl space-y-6">
            {/* Column guide */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm">Expected CSV columns</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-5 py-2.5 text-left font-medium">Column</th>
                      <th className="px-5 py-2.5 text-left font-medium">Required</th>
                      <th className="px-5 py-2.5 text-left font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {CSV_COLUMNS.map(({ col, required, note }) => (
                      <tr key={col}>
                        <td className="px-5 py-2.5">
                          <code className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{col}</code>
                        </td>
                        <td className="px-5 py-2.5">
                          {required
                            ? <span className="text-xs text-rose-600 font-medium">Yes</span>
                            : <span className="text-xs text-gray-400">No</span>}
                        </td>
                        <td className="px-5 py-2.5 text-gray-500 text-xs">{note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Upload form */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Drop zone */}
                <div
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-12 px-6 cursor-pointer transition-all ${
                    dragOver
                      ? 'border-indigo-400 bg-indigo-50'
                      : file
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-gray-300 hover:border-indigo-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files[0])}
                  />
                  <div className="text-4xl">{file ? '✅' : '📄'}</div>
                  {file ? (
                    <>
                      <p className="font-medium text-emerald-700 text-sm">{file.name}</p>
                      <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-gray-700 text-sm">
                        Drop your CSV here, or <span className="text-indigo-600 underline">browse</span>
                      </p>
                      <p className="text-xs text-gray-400">Only .csv files, max 5 MB</p>
                    </>
                  )}
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={!file || loading}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Importing…
                    </>
                  ) : 'Import'}
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

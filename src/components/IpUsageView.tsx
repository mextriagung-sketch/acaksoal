import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, ShieldAlert } from 'lucide-react';
import type { UsageStatsResponse } from '../types/exam';

function formatRelativeOrDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const IpUsageView: React.FC = () => {
  const [data, setData] = useState<UsageStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchIp, setSearchIp] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'most_used'>('recent');

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/usage');
      if (res.status === 404) {
        throw new Error(
          'Pencatatan alamat IP membutuhkan server backend Node.js (Express). Pada hosting statis seperti Netlify tanpa backend, data IP server tidak tersedia.'
        );
      }
      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(
          'Server backend tidak tersedia pada hosting statis ini sehingga riwayat IP tidak dapat dimuat.'
        );
      }
      if (!res.ok) {
        throw new Error(parsed?.error || 'Gagal memuat daftar pengguna IP.');
      }
      setData(parsed as UsageStatsResponse);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Tidak dapat memuat statistik penggunaan IP.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const filteredUsers = (data?.users || [])
    .filter((u) => {
      if (!searchIp.trim()) return true;
      const needle = searchIp.toLowerCase();
      return (
        u.ip.toLowerCase().includes(needle) ||
        u.lastAction.toLowerCase().includes(needle) ||
        u.deviceSummary.toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'most_used') {
        return b.totalUses - a.totalUses;
      }
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Pengguna Aplikasi Berdasarkan Alamat IP
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Daftar alamat IP yang mengakses aplikasi beserta jumlah total penggunaan, pemrosesan
            soal, dan pengunduhan dokumen siap cetak.
          </p>
          {data?.currentIp && (
            <p className="mt-2 text-xs text-slate-500">
              IP Anda saat ini:{' '}
              <span className="font-mono font-semibold text-slate-900">{data.currentIp}</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={fetchUsage}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Segarkan Data
        </button>
      </div>

      {/* Ringkasan Metrik (Single-elevation grid, tabular-nums, no pill clutter) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Alamat IP Unik</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {data ? data.summary.uniqueIps : '-'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Penggunaan</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-blue-700 tabular-nums">
            {data ? data.summary.totalUses : '-'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Proses / Muat Soal</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {data ? data.summary.totalParses : '-'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Unduh PDF / Word / ZIP</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {data ? data.summary.totalExports : '-'}
          </p>
        </div>
      </div>

      {/* Filter & Sort Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchIp}
            onChange={(e) => setSearchIp(e.target.value)}
            placeholder="Cari alamat IP, perangkat, atau aktivitas..."
            className="w-full sm:w-80 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSortBy('recent')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              sortBy === 'recent'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Terakhir Aktif
          </button>
          <button
            type="button"
            onClick={() => setSortBy('most_used')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              sortBy === 'most_used'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Paling Sering Digunakan
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {loading && !data ? (
          <div className="divide-y divide-slate-200 p-4 space-y-3">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-10 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-800">
              {searchIp.trim()
                ? 'Tidak ada catatan IP yang cocok dengan kata kunci pencarian.'
                : 'Belum ada aktivitas pengguna yang tercatat.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Setiap kali pengguna membuka aplikasi, mengunggah soal, atau mengunduh dokumen,
              alamat IP dan jumlah penggunaannya akan otomatis tercatat di sini.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                <th className="px-4 py-3 whitespace-nowrap">Alamat IP</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Total Dipakai</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Kunjungan</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Proses Soal</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Unduh File</th>
                <th className="px-4 py-3 whitespace-nowrap">Aktivitas Terakhir</th>
                <th className="px-4 py-3 whitespace-nowrap">Perangkat</th>
                <th className="px-4 py-3 whitespace-nowrap">Terakhir Aktif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.map((user) => {
                const isSelf = data?.currentIp === user.ip;
                return (
                  <tr key={user.ip} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                      <span>{user.ip}</span>
                      {isSelf && (
                        <span className="ml-2 font-sans text-[11px] font-medium text-blue-700">
                          (IP Anda)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-bold text-blue-700 tabular-nums whitespace-nowrap">
                      {user.totalUses}×
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {user.visits}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {user.parses}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {user.exports}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 max-w-xs truncate">
                      {user.lastAction}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {user.deviceSummary}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {formatRelativeOrDate(user.lastSeen)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

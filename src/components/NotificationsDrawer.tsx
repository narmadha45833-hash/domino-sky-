import React, { useState } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { AppNotification } from '../types/aviation';

interface NotificationsDrawerProps {
  open: boolean;
  notifications: AppNotification[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  open,
  notifications,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
}) => {
  const [filter, setFilter] = useState<string>('ALL');

  if (!open) return null;

  const filtered = notifications.filter((n) =>
    filter === 'ALL' ? true : filter === 'UNREAD' ? !n.read : n.category === filter
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl border-l border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#081224] px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <Bell className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold">Smart Operational Notifications</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter notifications"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
          >
            <option value="ALL">All Events ({notifications.length})</option>
            <option value="UNREAD">Unread ({notifications.filter((n) => !n.read).length})</option>
            <option value="CLOSURE">Closures</option>
            <option value="DELAY">Flight Delays</option>
            <option value="CANCELLATION">Cancellations</option>
            <option value="CONNECTION">Missed Connections</option>
            <option value="CREW">Crew Duty Alerts</option>
            <option value="RECOVERY">Recovery Actions</option>
          </select>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:text-red-600"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No notifications matching this filter.
            </div>
          ) : (
            filtered.map((n) => {
              const sevColor =
                n.severity === 'CRITICAL'
                  ? 'text-red-700 bg-red-50 border-red-200'
                  : n.severity === 'HIGH'
                  ? 'text-orange-700 bg-orange-50 border-orange-200'
                  : n.severity === 'MEDIUM'
                  ? 'text-amber-700 bg-amber-50 border-amber-200'
                  : 'text-emerald-700 bg-emerald-50 border-emerald-200';

              return (
                <div
                  key={n.id}
                  onClick={() => onMarkRead(n.id)}
                  className={`cursor-pointer rounded-lg border p-3 text-xs transition-colors ${
                    n.read
                      ? 'border-slate-200 bg-white opacity-75'
                      : 'border-blue-200 bg-[#F0F7FF]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${sevColor}`}>
                      {n.severity} · {n.category}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      Sim {n.simTimeStr} · {n.timestamp}
                    </span>
                  </div>
                  <div className="mt-1.5 font-bold text-slate-900">{n.title}</div>
                  <p className="mt-0.5 text-slate-600 leading-relaxed">{n.message}</p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

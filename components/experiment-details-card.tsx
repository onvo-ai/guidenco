'use client';

import { useMemo } from 'react';
import { FlaskConical, Calendar, Clock, Target, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface Experiment {
  id: string;
  name: string;
  entityId: string;
  entityType: string;
  maxDepth: number;
  maxIterations: number;
  startDate: string | null;
  endDate: string | null;
  checkInInterval: number | null;
  goalMetric: string | null;
  currentIteration: number;
  scores: Array<{ iteration: number; score: number; notes?: string }> | null;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  parameters?: Array<{
    id: string;
    key: string;
    description: string | null;
    type: 'string' | 'number' | 'boolean';
    value: string | number | boolean | null;
    min?: number | null;
    max?: number | null;
  }>;
}

interface ExperimentDetailsCardProps {
  experiment: Experiment;
  onClose?: () => void;
}

export function ExperimentDetailsCard({ experiment, onClose }: ExperimentDetailsCardProps) {
  const chartData = useMemo(() => {
    if (!experiment.scores || experiment.scores.length === 0) return [];
    return experiment.scores.map((s) => ({
      iteration: s.iteration,
      score: s.score,
      label: `Iter ${s.iteration}`,
    }));
  }, [experiment.scores]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'completed':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'cancelled':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
    }
  };

  const getTimelineProgress = () => {
    if (!experiment.startDate || !experiment.endDate) return 0;
    const start = new Date(experiment.startDate).getTime();
    const end = new Date(experiment.endDate).getTime();
    const now = Date.now();
    if (now >= end) return 100;
    if (now <= start) return 0;
    return Math.round(((now - start) / (end - start)) * 100);
  };

  const timelineProgress = getTimelineProgress();

  return (
    <div className="fixed top-4 left-4 z-50 w-80 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <FlaskConical className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">
              {experiment.name}
            </h3>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getStatusColor(
                experiment.status
              )}`}
            >
              {experiment.status}
            </span>
          </div>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-600"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Goal Metric */}
        {experiment.goalMetric && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
              <Target className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Goal Metric
              </p>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {experiment.goalMetric}
              </p>
            </div>
          </div>
        )}

        {/* Timeline Widget */}
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700 p-3">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Timeline</span>
          </div>

          {/* Mini Calendar Grid */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center">
              <p className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">
                Start
              </p>
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {formatDate(experiment.startDate)}
              </p>
            </div>
            <div className="text-center border-x border-zinc-200 dark:border-zinc-700">
              <p className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">
                Check-in
              </p>
              <div className="flex items-center justify-center gap-1">
                <Clock className="h-3 w-3 text-zinc-400" />
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {experiment.checkInInterval ? `${experiment.checkInInterval}d` : '—'}
                </p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">
                End
              </p>
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {formatDate(experiment.endDate)}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          {experiment.startDate && experiment.endDate && (
            <div className="space-y-1">
              <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-500"
                  style={{ width: `${timelineProgress}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 text-right">
                {timelineProgress}% complete
              </p>
            </div>
          )}
        </div>

        {/* Metric Chart */}
        {chartData.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Metric Performance
              </span>
            </div>
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e4e4e7"
                    className="dark:stroke-zinc-700"
                  />
                  <XAxis
                    dataKey="iteration"
                    tick={{ fontSize: 10, fill: '#71717a' }}
                    axisLine={{ stroke: '#e4e4e7' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#71717a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 shadow-lg">
                            <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                              Score: {payload[0].value}
                            </p>
                            <p className="text-[10px] text-zinc-500">
                              Iteration {payload[0].payload.iteration}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ fill: '#8b5cf6', strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, fill: '#8b5cf6' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Iteration Stats */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">Iteration</span>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {experiment.currentIteration} / {experiment.maxIterations}
          </span>
        </div>

        {/* Parameters */}
        {experiment.parameters && experiment.parameters.length > 0 && (
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
              Parameters
            </p>
            <div className="space-y-1.5">
              {experiment.parameters.slice(0, 3).map((param) => (
                <div
                  key={param.id}
                  className="flex items-center justify-between text-xs bg-zinc-50 dark:bg-zinc-800 rounded-lg px-2 py-1.5"
                >
                  <span className="text-zinc-600 dark:text-zinc-400 font-mono">{param.key}</span>
                  <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                    {String(param.value ?? '—')}
                  </span>
                </div>
              ))}
              {experiment.parameters.length > 3 && (
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center italic">
                  +{experiment.parameters.length - 3} more
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

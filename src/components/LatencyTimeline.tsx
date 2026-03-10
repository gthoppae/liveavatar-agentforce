'use client';

import { useEffect, useState } from 'react';

export interface TimelineSegment {
  label: string;
  service: string;
  startMs: number;
  durationMs: number;
  color: string;
}

export interface TimelineData {
  segments: TimelineSegment[];
  totalProcessingMs: number;
}

interface LatencyTimelineProps {
  data: TimelineData | null;
  isProcessing: boolean;
  currentStep?: 'stt' | 'agent' | 'tts' | 'avatar' | null;
}

export default function LatencyTimeline({ data, isProcessing, currentStep }: LatencyTimelineProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  // Animate elapsed time while processing
  useEffect(() => {
    if (!isProcessing) {
      setElapsedMs(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 50);

    return () => clearInterval(interval);
  }, [isProcessing]);

  // Processing state - show animated waiting view
  if (isProcessing) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg p-4 shadow-sm dark:shadow-none">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Processing...</h3>
          <span className="font-mono text-sm text-gray-500">{(elapsedMs / 1000).toFixed(1)}s</span>
        </div>

        <div className="space-y-2">
          {/* STT Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-16">STT</span>
            <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden relative">
              {currentStep === 'stt' && (
                <div className="absolute inset-0 bg-blue-200 dark:bg-blue-900 animate-pulse">
                  <div className="h-full bg-blue-400 animate-[loading_1s_ease-in-out_infinite]"
                       style={{ width: '30%' }} />
                </div>
              )}
              {(currentStep === 'agent' || currentStep === 'tts' || currentStep === 'avatar') && (
                <div className="h-full bg-blue-400" style={{ width: '100%' }} />
              )}
            </div>
          </div>

          {/* Agent Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-16">Agent</span>
            <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden relative">
              {currentStep === 'agent' && (
                <div className="absolute inset-0 bg-yellow-200 dark:bg-yellow-900 animate-pulse">
                  <div className="h-full bg-yellow-400 animate-[loading_1s_ease-in-out_infinite]"
                       style={{ width: '30%' }} />
                </div>
              )}
              {(currentStep === 'tts' || currentStep === 'avatar') && (
                <div className="h-full bg-yellow-400" style={{ width: '100%' }} />
              )}
            </div>
          </div>

          {/* TTS Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-16">TTS</span>
            <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden relative">
              {currentStep === 'tts' && (
                <div className="absolute inset-0 bg-purple-200 dark:bg-purple-900 animate-pulse">
                  <div className="h-full bg-purple-400 animate-[loading_1s_ease-in-out_infinite]"
                       style={{ width: '30%' }} />
                </div>
              )}
              {currentStep === 'avatar' && (
                <div className="h-full bg-purple-400" style={{ width: '100%' }} />
              )}
            </div>
          </div>

          {/* Avatar Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-16">Avatar</span>
            <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden relative">
              {currentStep === 'avatar' && (
                <div className="absolute inset-0 bg-orange-200 dark:bg-orange-900 animate-pulse">
                  <div className="h-full bg-orange-400 animate-[loading_1s_ease-in-out_infinite]"
                       style={{ width: '30%' }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No data yet
  if (!data) {
    return null;
  }

  const { segments, totalProcessingMs } = data;
  const maxTime = totalProcessingMs;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-4 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Last Turn Timeline</h3>
        <span className="font-semibold text-cyan-600 dark:text-cyan-400 text-xs">
          Total: {(totalProcessingMs / 1000).toFixed(2)}s
        </span>
      </div>

      {/* Timeline scale */}
      <div className="flex justify-between text-xs text-gray-400 mb-1 px-16">
        <span>0s</span>
        <span>{(maxTime / 2000).toFixed(1)}s</span>
        <span>{(maxTime / 1000).toFixed(1)}s</span>
      </div>

      {/* Timeline bars */}
      <div className="space-y-2">
        {segments.map((segment, idx) => {
          const leftPercent = (segment.startMs / maxTime) * 100;
          const widthPercent = (segment.durationMs / maxTime) * 100;

          return (
            <div key={idx} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-16 truncate" title={segment.service}>
                {segment.label}
              </span>
              <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden relative">
                {/* Grid lines */}
                <div className="absolute inset-0 flex">
                  <div className="flex-1 border-r border-gray-200 dark:border-gray-700" />
                  <div className="flex-1 border-r border-gray-200 dark:border-gray-700" />
                  <div className="flex-1" />
                </div>

                {/* Segment bar */}
                <div
                  className="absolute h-full rounded flex items-center justify-end pr-2 text-xs text-white font-medium"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${Math.max(widthPercent, 2)}%`,
                    backgroundColor: segment.color,
                  }}
                >
                  {widthPercent > 15 && (
                    <span>{(segment.durationMs / 1000).toFixed(2)}s</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400 w-16 text-right font-mono">
                {(segment.durationMs / 1000).toFixed(2)}s
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
        {segments.map((segment, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs text-gray-500">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: segment.color }}
            />
            <span>{segment.service}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

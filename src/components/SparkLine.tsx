'use client';

import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface SparkLineProps {
  data: number[];
  positive: boolean;
  width?: number;
  height?: number;
}

export default function SparkLine({
  data,
  positive,
  width = 80,
  height = 30,
}: SparkLineProps) {
  if (!data || data.length === 0) {
    return <div style={{ width, height }} className="bg-dark-800 rounded" />;
  }

  const chartData = data.map((value, index) => ({ index, value }));
  const strokeColor = positive ? '#22c55e' : '#ef4444';

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

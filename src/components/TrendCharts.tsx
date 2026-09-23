'use client';

import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

function fmt(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' mlrd';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + ' mln';
  return Math.round(v).toLocaleString('ru-RU');
}

export type ChartData = {
  labels: string[];
  pay: number[];
  closed: number[];
  new: number[];
};

export default function TrendCharts({ data }: { data: ChartData }) {
  const payRef = useRef<HTMLCanvasElement>(null);
  const countRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let charts: Chart[] = [];

    const css = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    function draw() {
      charts.forEach((c) => c.destroy());
      charts = [];
      Chart.defaults.color = css('--muted');
      Chart.defaults.font.family = 'Plus Jakarta Sans, system-ui, sans-serif';
      const grid = { color: css('--line') };

      if (payRef.current) {
        charts.push(
          new Chart(payRef.current, {
            type: 'bar',
            data: {
              labels: data.labels,
              datasets: [
                {
                  label: 'Tushum',
                  data: data.pay,
                  backgroundColor: '#6366f1',
                  borderRadius: 6,
                  maxBarThickness: 36,
                },
              ],
            },
            options: {
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx: any) => `${fmt(ctx.parsed.y)} so'm` } },
              },
              scales: {
                y: { grid, ticks: { callback: (v: any) => fmt(Number(v)) } },
                x: { grid: { display: false } },
              },
            },
          }),
        );
      }

      if (countRef.current) {
        charts.push(
          new Chart(countRef.current, {
            type: 'bar',
            data: {
              labels: data.labels,
              datasets: [
                {
                  label: 'Yangi',
                  data: data.new,
                  backgroundColor: '#38bdf8',
                  borderRadius: 5,
                  maxBarThickness: 18,
                },
                {
                  label: 'Yopilgan',
                  data: data.closed,
                  backgroundColor: '#10b981',
                  borderRadius: 5,
                  maxBarThickness: 18,
                },
              ],
            },
            options: {
              maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } } },
              scales: {
                y: { grid, beginAtZero: true, ticks: { precision: 0 } as any },
                x: { grid: { display: false } },
              },
            },
          }),
        );
      }
    }

    draw();
    document.addEventListener('themechange', draw);
    return () => {
      document.removeEventListener('themechange', draw);
      charts.forEach((c) => c.destroy());
    };
  }, [data]);

  return (
    <div className="two-col">
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Oylik tushumlar</h2>
            <p>Material, abyom va pul — boshlang&apos;ich chekdan tashqari</p>
          </div>
        </header>
        <div className="chart-box">
          <canvas ref={payRef} aria-label="Oylik tushumlar grafigi" />
        </div>
      </section>
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Yangi va yopilgan shartnomalar</h2>
            <p>Soni bo&apos;yicha</p>
          </div>
        </header>
        <div className="chart-box">
          <canvas ref={countRef} aria-label="Shartnomalar soni grafigi" />
        </div>
      </section>
    </div>
  );
}

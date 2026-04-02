import { Chart, registerables } from 'chart.js';
import { runDecarb } from './decarb-engine';

Chart.register(...registerables);

const GRID_COLOR = 'rgba(255, 255, 255, 0.06)';
const TICK_COLOR = '#8b8d94';

const COLORS = {
  THCA: '#2ecc71',
  THC: '#27ae60',
  CBN: '#e74c3c',
  CBDA: '#3498db',
  CBD: '#2980b9',
  CBD_DEG: '#8e44ad',
};

const sliderIds = ['temp_c', 'P_atm', 'O2_percent', 'ratio_THC'] as const;
type SliderId = (typeof sliderIds)[number];

const units: Record<SliderId, string> = {
  temp_c: ' °C',
  P_atm: ' atm',
  O2_percent: ' %',
  ratio_THC: ' %',
};

function formatValue(id: SliderId, val: number): string {
  if (id === 'ratio_THC') {
    const thc = Math.round(val);
    const cbd = 100 - thc;
    return `${thc} % THC · ${cbd} % CBD`;
  }
  const str = id === 'P_atm' ? val.toFixed(1) : (Number.isInteger(val) ? val.toString() : val.toFixed(1));
  return str + units[id];
}

function readInputs(): { T_celsius: number; P_atm: number; O2_percent: number; ratio_THC_percent: number } {
  const get = (id: string) => parseFloat((document.getElementById(id) as HTMLInputElement).value);
  return {
    T_celsius: get('temp_c'),
    P_atm: get('P_atm'),
    O2_percent: get('O2_percent'),
    ratio_THC_percent: get('ratio_THC'),
  };
}

function toChartData(t: number[], y: number[]) {
  return t.map((x, i) => ({ x, y: y[i] }));
}

let maxPoints: { THC: { x: number; y: number } | null; CBD: { x: number; y: number } | null } = {
  THC: null,
  CBD: null,
};

function createChart(canvas: HTMLCanvasElement): Chart {
  return new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [
        { label: 'THCA', data: [], borderColor: COLORS.THCA, backgroundColor: 'transparent', borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: 0.3 },
        { label: 'THC Activo', data: [], borderColor: COLORS.THC, backgroundColor: 'transparent', borderWidth: 3, pointRadius: 0, tension: 0.3 },
        { label: 'CBN', data: [], borderColor: COLORS.CBN, backgroundColor: 'transparent', borderWidth: 2, borderDash: [2, 4], pointRadius: 0, tension: 0.3 },
        { label: 'CBDA', data: [], borderColor: COLORS.CBDA, backgroundColor: 'transparent', borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: 0.3 },
        { label: 'CBD Activo', data: [], borderColor: COLORS.CBD, backgroundColor: 'transparent', borderWidth: 3, pointRadius: 0, tension: 0.3 },
        { label: 'CBD Degradado', data: [], borderColor: COLORS.CBD_DEG, backgroundColor: 'transparent', borderWidth: 2, borderDash: [2, 4], pointRadius: 0, tension: 0.3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 150 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e2027',
          titleColor: '#e4e5e7',
          bodyColor: '#8b8d94',
          borderColor: '#2a2d35',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
          displayColors: true,
          callbacks: {
            title(items) {
              const m = items[0]?.parsed?.x ?? 0;
              return `${Math.round(m)} min`;
            },
            label(ctx) {
              return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(1)} %`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Tiempo (minutos)', color: TICK_COLOR, font: { size: 11, weight: 400 } },
          grid: { color: GRID_COLOR },
          ticks: { color: TICK_COLOR, font: { size: 10 } },
          min: 0,
          max: 150,
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'Concentración relativa (%)', color: TICK_COLOR, font: { size: 11, weight: 400 } },
          grid: { color: GRID_COLOR },
          ticks: { color: TICK_COLOR, font: { size: 10 } },
          min: 0,
          max: 105,
        },
      },
    },
    plugins: [
      {
        id: 'maxPoints',
        afterDraw(chart) {
          if (!maxPoints.THC && !maxPoints.CBD) return;
          const { ctx, scales } = chart;
          const xScale = scales['x'];
          const yScale = scales['y'];
          for (const [key, pt] of Object.entries(maxPoints)) {
            if (!pt) continue;
            const xPx = xScale.getPixelForValue(pt.x);
            const yPx = yScale.getPixelForValue(pt.y);
            if (xPx < xScale.left || xPx > xScale.right || yPx < yScale.top || yPx > yScale.bottom) continue;
            ctx.save();
            ctx.fillStyle = key === 'THC' ? COLORS.THC : COLORS.CBD;
            ctx.beginPath();
            ctx.arc(xPx, yPx, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#0e0f11';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          }
        },
      },
    ],
  });
}

function updateChart(chart: Chart) {
  const input = readInputs();
  const result = runDecarb(input);
  const ratioTHC = input.ratio_THC_percent;

  chart.data.datasets[0].data = toChartData(result.t_min, result.THCA);
  chart.data.datasets[1].data = toChartData(result.t_min, result.THC);
  chart.data.datasets[2].data = toChartData(result.t_min, result.CBN);
  chart.data.datasets[3].data = toChartData(result.t_min, result.CBDA);
  chart.data.datasets[4].data = toChartData(result.t_min, result.CBD);
  chart.data.datasets[5].data = toChartData(result.t_min, result.CBD_DEG);

  const showTHC = ratioTHC > 1;
  const showCBD = ratioTHC < 99;
  chart.data.datasets[0].hidden = !showTHC;
  chart.data.datasets[1].hidden = !showTHC;
  chart.data.datasets[2].hidden = !showTHC;
  chart.data.datasets[3].hidden = !showCBD;
  chart.data.datasets[4].hidden = !showCBD;
  chart.data.datasets[5].hidden = !showCBD;

  maxPoints = {
    THC: result.maxTHC ? { x: result.maxTHC.t_min, y: result.maxTHC.value } : null,
    CBD: result.maxCBD ? { x: result.maxCBD.t_min, y: result.maxCBD.value } : null,
  };

  chart.update();

  document.querySelectorAll('.legend-thc').forEach((el) => {
    (el as HTMLElement).style.display = showTHC ? '' : 'none';
  });
  document.querySelectorAll('.legend-cbd').forEach((el) => {
    (el as HTMLElement).style.display = showCBD ? '' : 'none';
  });

  const maxThcRow = document.getElementById('max-thc-label')!;
  const maxCbdRow = document.getElementById('max-cbd-label')!;
  const maxThcValue = document.getElementById('max-thc-value')!;
  const maxCbdValue = document.getElementById('max-cbd-value')!;
  if (result.maxTHC) {
    maxThcValue.textContent = `${result.maxTHC.t_min.toFixed(0)} min → ${result.maxTHC.value.toFixed(1)} %`;
    maxThcRow.style.display = showTHC ? '' : 'none';
  } else {
    maxThcValue.textContent = '—';
    maxThcRow.style.display = 'none';
  }
  if (result.maxCBD) {
    maxCbdValue.textContent = `${result.maxCBD.t_min.toFixed(0)} min → ${result.maxCBD.value.toFixed(1)} %`;
    maxCbdRow.style.display = showCBD ? '' : 'none';
  } else {
    maxCbdValue.textContent = '—';
    maxCbdRow.style.display = 'none';
  }
}

function init() {
  const canvas = document.getElementById('chart') as HTMLCanvasElement;
  const chart = createChart(canvas);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleUpdate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateChart(chart);
      debounceTimer = null;
    }, 80);
  }

  for (const id of sliderIds) {
    const slider = document.getElementById(id) as HTMLInputElement;
    const valueSpan = document.getElementById(`${id}_val`)!;
    slider.addEventListener('input', () => {
      valueSpan.textContent = formatValue(id, parseFloat(slider.value));
      scheduleUpdate();
    });
  }

  updateChart(chart);

  const overlay = document.getElementById('info-overlay')!;
  const slides = document.querySelectorAll<HTMLElement>('#carousel [data-slide]');
  const dotsContainer = document.getElementById('dots')!;
  const indicatorEl = document.getElementById('page-indicator')!;
  const btnPrev = document.getElementById('btn-prev') as HTMLButtonElement;
  const btnNext = document.getElementById('btn-next') as HTMLButtonElement;
  const total = slides.length;
  let current = 0;

  for (let i = 0; i < total; i++) {
    const dot = document.createElement('span');
    dotsContainer.appendChild(dot);
  }
  const dots = dotsContainer.querySelectorAll('span');

  function goTo(idx: number) {
    current = Math.max(0, Math.min(total - 1, idx));
    slides.forEach((s, i) => s.classList.toggle('active', i === current));
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
    indicatorEl.textContent = `${current + 1} / ${total}`;
    btnPrev.disabled = current === 0;
    btnNext.disabled = current === total - 1;
  }

  btnPrev.addEventListener('click', () => goTo(current - 1));
  btnNext.addEventListener('click', () => goTo(current + 1));
  dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));

  let swipeX0: number | null = null;
  const carousel = document.getElementById('carousel')!;
  carousel.addEventListener('touchstart', (e) => { swipeX0 = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener('touchend', (e) => {
    if (swipeX0 === null) return;
    const dx = e.changedTouches[0].clientX - swipeX0;
    if (Math.abs(dx) > 40) goTo(current + (dx < 0 ? 1 : -1));
    swipeX0 = null;
  });

  document.addEventListener('keydown', (e) => {
    if (overlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') overlay.classList.add('hidden');
    if (e.key === 'ArrowRight') goTo(current + 1);
    if (e.key === 'ArrowLeft') goTo(current - 1);
  });

  document.getElementById('btn-info')!.addEventListener('click', () => {
    goTo(0);
    overlay.classList.remove('hidden');
  });
  document.getElementById('btn-close')!.addEventListener('click', () => overlay.classList.add('hidden'));
  document.querySelector('.overlay-inner')!.addEventListener('click', (e) => e.stopPropagation());
  overlay.addEventListener('click', () => overlay.classList.add('hidden'));
}

init();

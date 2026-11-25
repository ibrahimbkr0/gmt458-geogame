/**
 * CultureGlobe 3D — Simple Single-Axis Pixel Bar Chart (Chart.js v4)
 */

let chartInstance = null;

export function renderResultsChart(canvasEl, questionHistory) {
  if (!canvasEl || typeof Chart === "undefined") return;

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const hasData = questionHistory.length > 0;
  const labels = hasData
    ? questionHistory.map((item) => `Q${item.questionNumber}`)
    : ["—"];

  const pointsData = hasData ? questionHistory.map((item) => item.points) : [0];

  const barColors = hasData
    ? questionHistory.map((item) => {
        if (!item.solved) return "#ff2a85";
        return item.attemptsUsed === 1 ? "#00ff66" : "#80ffb3";
      })
    : ["#33081c"];

  chartInstance = new Chart(canvasEl, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Points",
          data: pointsData,
          backgroundColor: barColors,
          borderColor: "#040406",
          borderWidth: 2,
          borderRadius: 0,
          minBarLength: 8,
          maxBarThickness: 36
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: "#040406",
          borderColor: "#00ff66",
          borderWidth: 2,
          cornerRadius: 0,
          displayColors: false,
          titleColor: "#00ff66",
          bodyColor: "#f2fff6",
          titleFont: { family: "Silkscreen, monospace", size: 11 },
          bodyFont: { family: "Pixelify Sans, monospace", size: 13 },
          padding: 10,
          callbacks: {
            title(items) {
              if (!hasData) return "NO DATA";
              const entry = questionHistory[items[0].dataIndex];
              return `Q${entry.questionNumber} · ${entry.countryName}`;
            },
            label(item) {
              if (!hasData) return "";
              const entry = questionHistory[item.dataIndex];
              const status = entry.solved
                ? `Solved (Try #${entry.attemptsUsed})`
                : entry.outcome === "timeout"
                  ? "Time Expired"
                  : "Missed";
              return [
                `Score: +${entry.points} pts`,
                `Status: ${status}`,
                `Time: ${entry.timeSpent}s · Hints: ${entry.hintsUsed}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#a3c2b0",
            font: { family: "Silkscreen, monospace", size: 10 }
          },
          grid: { display: false },
          border: { color: "#00ff66", width: 2 }
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            color: "#00ff66",
            font: { family: "Silkscreen, monospace", size: 10 }
          },
          grid: {
            color: "rgba(0, 255, 102, 0.14)"
          },
          border: { color: "#00ff66", width: 2 }
        }
      }
    }
  });
}
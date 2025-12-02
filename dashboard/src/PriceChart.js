import React from "react";
import {
  Line
} from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale
} from "chart.js";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale);

function PriceChart({ labels, data }) {
  const chartData = {
    labels,
    datasets: [
      {
        label: "AMM Spot Price (B per A)",
        data,
        borderColor: "#60a5fa",
        backgroundColor: "rgba(96,165,250,0.2)",
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: "#93c5fd"
      }
    ]
  };

  const options = {
    scales: {
      x: {
        ticks: { color: "#9ca3af" },
        grid: { color: "#1e293b" }
      },
      y: {
        ticks: { color: "#d1d5db" },
        grid: { color: "#1e293b" }
      }
    },
    plugins: {
      legend: { labels: { color: "#e5e7eb" } }
    }
  };

  return (
    <div style={{ width: "100%", height: "280px" }}>
      <Line data={chartData} options={options} />
    </div>
  );
}

export default PriceChart;

/**
 * Siemens Energy Industrial Load Intelligence & Customer Segmentation Platform
 * Application Logic & Interactive Charts
 */

document.addEventListener('DOMContentLoaded', () => {
  // Ensure data bundle is available
  if (!window.SIEMENS_DATA) {
    console.error('SIEMENS_DATA not found. Please ensure data.js is loaded.');
    return;
  }

  const { overview, timeseries, consumers } = window.SIEMENS_DATA;

  // State Management
  const state = {
    theme: localStorage.getItem('siemens_theme') || 'dark',
    chartPcaMode: 'cumulative', // 'cumulative' | 'scree'
    chartKMode: 'inertia', // 'inertia' | 'silhouette'
    chartProfileMode: 'shape', // 'shape' | 'raw'
    showQuartiles: false,
    selectedConsumer: null,
    searchQuery: '',
    clusterFilter: 'all', // 'all' | '0' | '1' | 'excluded'
    sortField: 'series_id',
    sortAsc: true,
    currentPage: 1,
    pageSize: 15,
    sim: {
      peakShaving: 15,
      loadShift: 20,
      efficiency: 10,
      baseRate: 0.12,
      peakSurcharge: 14.50,
      carbonFactor: 0.42
    }
  };

  // Setup theme
  if (state.theme === 'light') {
    document.body.classList.add('light-theme');
  }

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      state.theme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
      localStorage.setItem('siemens_theme', state.theme);
      rebuildChartsOnThemeChange();
    });
  }

  // References to Chart instances
  let pcaVarianceChart = null;
  let kMeansEvalChart = null;
  let pcaScatterChart = null;
  let weeklyProfileChart = null;
  let consumerDetailChart = null;

  // Chart theme colors helper
  function getChartColors() {
    const isLight = document.body.classList.contains('light-theme');
    return {
      textColor: isLight ? '#334e68' : '#9bb0c9',
      gridColor: isLight ? 'rgba(0, 43, 73, 0.08)' : 'rgba(255, 255, 255, 0.06)',
      c0Color: isLight ? '#008f7d' : '#00e5c9',
      c0Glow: isLight ? 'rgba(0, 143, 125, 0.2)' : 'rgba(0, 229, 201, 0.25)',
      c1Color: isLight ? '#d94819' : '#ff7a45',
      c1Glow: isLight ? 'rgba(217, 72, 25, 0.2)' : 'rgba(255, 122, 69, 0.25)',
      accentBlue: '#3b82f6',
      cardBg: isLight ? '#ffffff' : '#152b47'
    };
  }

  function rebuildChartsOnThemeChange() {
    initPcaVarianceChart();
    initKMeansEvalChart();
    initPcaScatterChart();
    initWeeklyProfileChart();
    if (state.selectedConsumer) {
      renderConsumerModalChart(state.selectedConsumer);
    }
  }

  // ==========================================================================
  // 1. PCA Variance & Scree Chart
  // ==========================================================================
  function initPcaVarianceChart() {
    const ctx = document.getElementById('pcaVarianceCanvas');
    if (!ctx) return;
    if (pcaVarianceChart) pcaVarianceChart.destroy();

    const colors = getChartColors();
    const screeData = overview.pca_comparison.scree_top15;
    const cumData = overview.pca_comparison.cumulative_top30;

    const isCum = state.chartPcaMode === 'cumulative';
    const labels = isCum 
      ? cumData.map((_, i) => `PC${i + 1}`)
      : screeData.map((_, i) => `PC${i + 1}`);
    const dataVals = isCum ? cumData : screeData;

    const datasets = [{
      label: isCum ? 'Cumulative Variance (%)' : 'Individual Variance (%)',
      data: dataVals,
      borderColor: colors.c0Color,
      backgroundColor: isCum ? colors.c0Glow : 'rgba(0, 229, 201, 0.4)',
      fill: isCum,
      tension: 0.25,
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: colors.c0Color
    }];

    // 95% Threshold Line for Cumulative
    if (isCum) {
      datasets.push({
        label: '95% Target Cutoff (PC 25: 95.17%)',
        data: Array(cumData.length).fill(95),
        borderColor: '#ff7a45',
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      });
    }

    pcaVarianceChart = new Chart(ctx, {
      type: isCum ? 'line' : 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: colors.textColor, font: { weight: 'bold', size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${context.raw}%`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: colors.textColor },
            grid: { color: colors.gridColor }
          },
          y: {
            min: 0,
            max: isCum ? 100 : 35,
            ticks: {
              color: colors.textColor,
              callback: (val) => `${val}%`
            },
            grid: { color: colors.gridColor }
          }
        }
      }
    });
  }

  // PCA Toggle Buttons
  document.querySelectorAll('[data-pca-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-pca-toggle]').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.chartPcaMode = e.target.getAttribute('data-pca-toggle');
      initPcaVarianceChart();
    });
  });

  // ==========================================================================
  // 2. K-Means Evaluation Chart (Inertia vs Silhouette)
  // ==========================================================================
  function initKMeansEvalChart() {
    const ctx = document.getElementById('kMeansEvalCanvas');
    if (!ctx) return;
    if (kMeansEvalChart) kMeansEvalChart.destroy();

    const colors = getChartColors();
    const kData = overview.k_means_eval;
    const isSilhouette = state.chartKMode === 'silhouette';

    const labels = kData.map(d => `K=${d.k}`);
    const dataVals = isSilhouette ? kData.map(d => d.silhouette) : kData.map(d => d.inertia);

    kMeansEvalChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: isSilhouette ? 'Silhouette Score (Higher = Better separation)' : 'Inertia / Within-Cluster Sum of Squares (Elbow Method)',
          data: dataVals,
          borderColor: isSilhouette ? '#3b82f6' : colors.c0Color,
          backgroundColor: isSilhouette ? 'rgba(59, 130, 246, 0.15)' : colors.c0Glow,
          fill: true,
          tension: 0.25,
          borderWidth: 2.5,
          pointRadius: kData.map(d => d.k === 2 ? 8 : 4),
          pointBackgroundColor: kData.map(d => d.k === 2 ? '#ff7a45' : (isSilhouette ? '#3b82f6' : colors.c0Color)),
          pointHoverRadius: 9
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: colors.textColor, font: { weight: 'bold', size: 12 } }
          },
          tooltip: {
            callbacks: {
              afterLabel: (context) => {
                const item = kData[context.dataIndex];
                let note = `Smallest Cluster: ${item.smallest_cluster} profiles`;
                if (item.clusters_below_5 > 0) {
                  note += ` | Warning: ${item.clusters_below_5} cluster(s) < 5 profiles! (Overfitting)`;
                }
                if (item.k === 2) {
                  note += ` (Selected Optimal: 227 vs 92 profiles)`;
                }
                return note;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: colors.textColor },
            grid: { color: colors.gridColor }
          },
          y: {
            ticks: { color: colors.textColor },
            grid: { color: colors.gridColor }
          }
        }
      }
    });
  }

  // K-Means Toggle Buttons
  document.querySelectorAll('[data-k-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-k-toggle]').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.chartKMode = e.target.getAttribute('data-k-toggle');
      initKMeansEvalChart();
    });
  });

  // ==========================================================================
  // 3. 2D PCA Latent Space Scatter Chart (PC1 vs PC2)
  // ==========================================================================
  function initPcaScatterChart() {
    const ctx = document.getElementById('pcaScatterCanvas');
    if (!ctx) return;
    if (pcaScatterChart) pcaScatterChart.destroy();

    const colors = getChartColors();
    const activeConsumers = consumers.filter(c => c.status === 'Active');

    const c0Points = activeConsumers.filter(c => c.cluster === 0).map(c => ({
      x: c.pc1,
      y: c.pc2,
      rawObj: c
    }));

    const c1Points = activeConsumers.filter(c => c.cluster === 1).map(c => ({
      x: c.pc1,
      y: c.pc2,
      rawObj: c
    }));

    pcaScatterChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Cluster 0: High-Base Stable Load (227 profiles)',
            data: c0Points,
            backgroundColor: colors.c0Color,
            borderColor: 'rgba(0, 0, 0, 0.4)',
            borderWidth: 0.5,
            pointRadius: 5.5,
            pointHoverRadius: 8
          },
          {
            label: 'Cluster 1: Dynamic / Volatile Peakers (92 profiles)',
            data: c1Points,
            backgroundColor: colors.c1Color,
            borderColor: 'rgba(0, 0, 0, 0.4)',
            borderWidth: 0.5,
            pointRadius: 5.5,
            pointHoverRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements.length > 0) {
            const el = elements[0];
            const datasetIndex = el.datasetIndex;
            const index = el.index;
            const pt = pcaScatterChart.data.datasets[datasetIndex].data[index];
            if (pt && pt.rawObj) {
              openConsumerModal(pt.rawObj);
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: colors.textColor, font: { weight: 'bold', size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const c = context.raw.rawObj;
                return [
                  `Series ID: ${c.series_id} (Cluster ${c.cluster})`,
                  `PC1: ${c.pc1}, PC2: ${c.pc2}`,
                  `Mean Load: ${c.mean.toLocaleString()} units`,
                  `CV (Volatility): ${c.cv}`,
                  `Peak/Avg: ${c.peak_to_average}`,
                  `Silhouette: ${c.silhouette} (Click to inspect profile)`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Principal Component 1 (PC1: 27.84% variance)', color: colors.textColor },
            ticks: { color: colors.textColor },
            grid: { color: colors.gridColor }
          },
          y: {
            title: { display: true, text: 'Principal Component 2 (PC2: 17.09% variance)', color: colors.textColor },
            ticks: { color: colors.textColor },
            grid: { color: colors.gridColor }
          }
        }
      }
    });
  }

  // ==========================================================================
  // 4. Weekly Consumption Trajectories Chart (156 Weeks / 3 Years)
  // ==========================================================================
  function initWeeklyProfileChart() {
    const ctx = document.getElementById('weeklyProfileCanvas');
    if (!ctx) return;
    if (weeklyProfileChart) weeklyProfileChart.destroy();

    const colors = getChartColors();
    const isShape = state.chartProfileMode === 'shape';
    const weeks = timeseries.weeks;
    const dataObj = isShape ? timeseries.shape : timeseries.raw;

    const datasets = [
      {
        label: isShape ? 'Cluster 0 Median Normalised Shape' : 'Cluster 0 Median Raw Load (Dataset Units)',
        data: dataObj.cluster_0_median,
        borderColor: colors.c0Color,
        backgroundColor: colors.c0Glow,
        borderWidth: 2.5,
        fill: false,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4
      },
      {
        label: isShape ? 'Cluster 1 Median Normalised Shape' : 'Cluster 1 Median Raw Load (Dataset Units)',
        data: dataObj.cluster_1_median,
        borderColor: colors.c1Color,
        backgroundColor: colors.c1Glow,
        borderWidth: 2.5,
        fill: false,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4
      }
    ];

    // Reference Baseline Line for Shape
    if (isShape) {
      datasets.push({
        label: 'Baseline Normalized Mean (1.0)',
        data: Array(weeks.length).fill(1.0),
        borderColor: 'rgba(255, 255, 255, 0.4)',
        borderDash: [5, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false
      });
    }

    // Interquartile Bands
    if (state.showQuartiles) {
      datasets.push({
        label: 'Cluster 0 (75th Percentile)',
        data: dataObj.cluster_0_q75,
        borderColor: 'transparent',
        backgroundColor: 'rgba(0, 229, 201, 0.12)',
        pointRadius: 0,
        fill: '+1'
      });
      datasets.push({
        label: 'Cluster 0 (25th Percentile)',
        data: dataObj.cluster_0_q25,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        pointRadius: 0,
        fill: false
      });
    }

    weeklyProfileChart = new Chart(ctx, {
      type: 'line',
      data: { labels: weeks, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: colors.textColor, font: { weight: 'bold', size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${context.raw}`
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Time Horizon (156 Consecutive Weeks / 3 Years)', color: colors.textColor },
            ticks: {
              color: colors.textColor,
              maxTicksLimit: 26,
              callback: (val, idx) => (idx % 12 === 0 ? `W${idx + 1}` : '')
            },
            grid: { color: colors.gridColor }
          },
          y: {
            title: {
              display: true,
              text: isShape ? 'Normalised Ratio (Week / Profile Mean)' : 'Weekly Electricity Usage (Dataset Units)',
              color: colors.textColor
            },
            ticks: {
              color: colors.textColor,
              callback: (val) => isShape ? val.toFixed(2) : val.toLocaleString()
            },
            grid: { color: colors.gridColor }
          }
        }
      }
    });
  }

  // Profile View Toggle
  document.querySelectorAll('[data-profile-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-profile-toggle]').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.chartProfileMode = e.target.getAttribute('data-profile-toggle');
      initWeeklyProfileChart();
    });
  });

  const quartileToggle = document.getElementById('quartileToggle');
  if (quartileToggle) {
    quartileToggle.addEventListener('change', (e) => {
      state.showQuartiles = e.target.checked;
      initWeeklyProfileChart();
    });
  }

  // ==========================================================================
  // 5. Consumer Explorer Table & Search Logic
  // ==========================================================================
  const searchInput = document.getElementById('consumerSearch');
  const tableBody = document.getElementById('consumerTableBody');
  const totalCountEl = document.getElementById('tableTotalCount');
  const pageInfoEl = document.getElementById('tablePageInfo');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');

  function getFilteredConsumers() {
    return consumers.filter(c => {
      // Search filter
      const matchesSearch = c.series_id.toLowerCase().includes(state.searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Cluster filter
      if (state.clusterFilter === 'all') return true;
      if (state.clusterFilter === '0') return c.cluster === 0;
      if (state.clusterFilter === '1') return c.cluster === 1;
      if (state.clusterFilter === 'excluded') return c.status === 'Excluded';
      return true;
    }).sort((a, b) => {
      let valA = a[state.sortField];
      let valB = b[state.sortField];

      // Handle nulls
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      // Natural series_id sort: T1, T2, ... T321
      if (state.sortField === 'series_id') {
        const numA = parseInt(valA.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(valB.replace(/\D/g, ''), 10) || 0;
        return state.sortAsc ? numA - numB : numB - numA;
      }

      if (valA < valB) return state.sortAsc ? -1 : 1;
      if (valA > valB) return state.sortAsc ? 1 : -1;
      return 0;
    });
  }

  function renderConsumerTable() {
    if (!tableBody) return;
    const filtered = getFilteredConsumers();
    const total = filtered.length;
    const totalPages = Math.ceil(total / state.pageSize) || 1;

    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    const startIdx = (state.currentPage - 1) * state.pageSize;
    const endIdx = Math.min(startIdx + state.pageSize, total);
    const pageItems = filtered.slice(startIdx, endIdx);

    tableBody.innerHTML = '';

    if (pageItems.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">No consumer profiles matching query "${state.searchQuery}".</td></tr>`;
    } else {
      pageItems.forEach(c => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';

        let clusterBadge = '';
        if (c.status === 'Excluded') {
          clusterBadge = `<span class="badge" style="background: rgba(138, 153, 173, 0.2); color: var(--cluster-ex);">Excluded (${c.zero_weeks} zero wks)</span>`;
        } else if (c.cluster === 0) {
          clusterBadge = `<span class="badge" style="background: rgba(0, 229, 201, 0.15); color: var(--cluster-0); border: 1px solid var(--cluster-0);">Cluster 0 (Baseload)</span>`;
        } else {
          clusterBadge = `<span class="badge" style="background: rgba(255, 122, 69, 0.15); color: var(--cluster-1); border: 1px solid var(--cluster-1);">Cluster 1 (Peaker)</span>`;
        }

        tr.innerHTML = `
          <td><strong>${c.series_id}</strong></td>
          <td>${clusterBadge}</td>
          <td class="metric-num">${c.mean.toLocaleString()}</td>
          <td class="metric-num">${c.median.toLocaleString()}</td>
          <td class="metric-num">${c.std.toLocaleString()}</td>
          <td class="metric-num" style="color: ${c.cv > 0.13 ? 'var(--cluster-1)' : 'var(--cluster-0)'};">${c.cv}</td>
          <td class="metric-num">${c.peak_to_average}</td>
          <td class="metric-num">${c.silhouette !== null ? c.silhouette : 'N/A'}</td>
        `;

        tr.addEventListener('click', () => openConsumerModal(c));
        tableBody.appendChild(tr);
      });
    }

    if (totalCountEl) totalCountEl.textContent = `${total} profiles found`;
    if (pageInfoEl) pageInfoEl.textContent = `Page ${state.currentPage} of ${totalPages} (${total} total)`;
    if (prevPageBtn) prevPageBtn.disabled = state.currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = state.currentPage >= totalPages;
  }

  // Search input handler
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      state.currentPage = 1;
      renderConsumerTable();
    });
  }

  // Filter pills
  document.querySelectorAll('[data-cluster-filter]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-cluster-filter]').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.clusterFilter = e.target.getAttribute('data-cluster-filter');
      state.currentPage = 1;
      renderConsumerTable();
    });
  });

  // Table header sorting
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const field = th.getAttribute('data-sort');
      if (state.sortField === field) {
        state.sortAsc = !state.sortAsc;
      } else {
        state.sortField = field;
        state.sortAsc = true;
      }
      renderConsumerTable();
    });
  });

  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        renderConsumerTable();
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      const filtered = getFilteredConsumers();
      const totalPages = Math.ceil(filtered.length / state.pageSize);
      if (state.currentPage < totalPages) {
        state.currentPage++;
        renderConsumerTable();
      }
    });
  }

  // ==========================================================================
  // 6. Consumer Detail Modal & Inspection Logic
  // ==========================================================================
  const modalOverlay = document.getElementById('consumerModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');

  function openConsumerModal(c) {
    state.selectedConsumer = c;
    if (!modalOverlay) return;

    document.getElementById('modalSeriesId').textContent = c.series_id;
    const badgeContainer = document.getElementById('modalClusterBadge');
    if (c.status === 'Excluded') {
      badgeContainer.innerHTML = `<span class="badge" style="background: rgba(138, 153, 173, 0.2); color: var(--cluster-ex);">Excluded (${c.zero_weeks} zero weeks, ${c.zero_percent}%)</span>`;
    } else if (c.cluster === 0) {
      badgeContainer.innerHTML = `<span class="badge" style="background: rgba(0, 229, 201, 0.15); color: var(--cluster-0); border: 1px solid var(--cluster-0);">Cluster 0 (Baseload Heavy)</span>`;
    } else {
      badgeContainer.innerHTML = `<span class="badge" style="background: rgba(255, 122, 69, 0.15); color: var(--cluster-1); border: 1px solid var(--cluster-1);">Cluster 1 (Dynamic Peaker)</span>`;
    }

    document.getElementById('modalMean').textContent = c.mean.toLocaleString();
    document.getElementById('modalMedian').textContent = c.median.toLocaleString();
    document.getElementById('modalStd').textContent = c.std.toLocaleString();
    document.getElementById('modalMax').textContent = c.max.toLocaleString();
    document.getElementById('modalCV').textContent = c.cv;
    document.getElementById('modalPeakAvg').textContent = c.peak_to_average;
    document.getElementById('modalSilhouette').textContent = c.silhouette !== null ? c.silhouette : 'N/A';
    document.getElementById('modalZeroWeeks').textContent = `${c.zero_weeks} (${c.zero_percent}%)`;

    // Strategy recommendation in modal
    const stratBox = document.getElementById('modalStrategyRec');
    if (c.status === 'Excluded') {
      stratBox.innerHTML = `
        <h4 style="color: var(--cluster-ex); margin-bottom: 0.35rem;">Telemetry & Metering Integrity Diagnostic</h4>
        <p style="font-size: 0.88rem; color: var(--text-secondary);">This meter exhibited ${c.zero_weeks} weeks of total zero consumption (${c.zero_percent}% of operational horizon). Immediate field inspection recommended for CT/PT transformer saturation, telemetry link failure, or prolonged facility mothballing.</p>
      `;
    } else if (c.cluster === 0) {
      stratBox.innerHTML = `
        <h4 style="color: var(--cluster-0); margin-bottom: 0.35rem;">Targeted Baseload Playbook</h4>
        <p style="font-size: 0.88rem; color: var(--text-secondary);">High basal load (${c.mean.toLocaleString()} units) and low volatility (${c.cv} CV). Prime candidate for Siemens Energy <strong>Combined Heat & Power (CHP)</strong>, long-term hedged PPA contracts, and Omnivise predictive maintenance on continuous motors.</p>
      `;
    } else {
      stratBox.innerHTML = `
        <h4 style="color: var(--cluster-1); margin-bottom: 0.35rem;">Targeted Flexibility & Peak Shaving Playbook</h4>
        <p style="font-size: 0.88rem; color: var(--text-secondary);">Significant operational volatility (${c.cv} CV) and high peak multiplier (${c.peak_to_average}x). High priority for <strong>Time-of-Use (ToU) automated demand response</strong>, behind-the-meter battery storage (BESS), and thermal energy load-shifting.</p>
      `;
    }

    renderConsumerModalChart(c);
    modalOverlay.classList.add('active');
  }

  function renderConsumerModalChart(c) {
    const ctx = document.getElementById('consumerModalCanvas');
    if (!ctx) return;
    if (consumerDetailChart) consumerDetailChart.destroy();

    const colors = getChartColors();
    const weeks = timeseries.weeks;
    const consumerVals = c.weekly_values || [];

    const datasets = [
      {
        label: `${c.series_id} Actual Weekly Consumption`,
        data: consumerVals,
        borderColor: c.cluster === 0 ? colors.c0Color : (c.cluster === 1 ? colors.c1Color : '#a0aec0'),
        backgroundColor: c.cluster === 0 ? colors.c0Glow : colors.c1Glow,
        borderWidth: 2.5,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 5
      },
      {
        label: 'Cluster 0 Benchmark Median',
        data: timeseries.raw.cluster_0_median,
        borderColor: 'rgba(0, 229, 201, 0.4)',
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false
      },
      {
        label: 'Cluster 1 Benchmark Median',
        data: timeseries.raw.cluster_1_median,
        borderColor: 'rgba(255, 122, 69, 0.4)',
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false
      }
    ];

    consumerDetailChart = new Chart(ctx, {
      type: 'line',
      data: { labels: weeks, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: colors.textColor, font: { weight: 'bold', size: 11 } }
          }
        },
        scales: {
          x: {
            ticks: {
              color: colors.textColor,
              maxTicksLimit: 26,
              callback: (val, idx) => (idx % 12 === 0 ? `W${idx + 1}` : '')
            },
            grid: { color: colors.gridColor }
          },
          y: {
            ticks: {
              color: colors.textColor,
              callback: (val) => val.toLocaleString()
            },
            grid: { color: colors.gridColor }
          }
        }
      }
    });
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
    });
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) modalOverlay.classList.remove('active');
    });
  }

  // ==========================================================================
  // 7. Real-Time Tariff & Optimization ROI Simulator
  // ==========================================================================
  const peakShavingInput = document.getElementById('simPeakShaving');
  const loadShiftInput = document.getElementById('simLoadShift');
  const efficiencyInput = document.getElementById('simEfficiency');
  const baseRateInput = document.getElementById('simBaseRate');
  const peakSurchargeInput = document.getElementById('simPeakSurcharge');
  const carbonFactorInput = document.getElementById('simCarbonFactor');

  function calculateSimulatorROI() {
    const psPct = parseFloat(peakShavingInput?.value || 15) / 100;
    const lsPct = parseFloat(loadShiftInput?.value || 20) / 100;
    const effPct = parseFloat(efficiencyInput?.value || 10) / 100;
    const baseRate = parseFloat(baseRateInput?.value || 0.12);
    const peakSurcharge = parseFloat(peakSurchargeInput?.value || 14.50);
    const carbonFactor = parseFloat(carbonFactorInput?.value || 0.42);

    // Update value badges
    if (document.getElementById('valPeakShaving')) document.getElementById('valPeakShaving').textContent = `${Math.round(psPct * 100)}%`;
    if (document.getElementById('valLoadShift')) document.getElementById('valLoadShift').textContent = `${Math.round(lsPct * 100)}%`;
    if (document.getElementById('valEfficiency')) document.getElementById('valEfficiency').textContent = `${Math.round(effPct * 100)}%`;
    if (document.getElementById('valBaseRate')) document.getElementById('valBaseRate').textContent = `$${baseRate.toFixed(2)}`;
    if (document.getElementById('valPeakSurcharge')) document.getElementById('valPeakSurcharge').textContent = `$${peakSurcharge.toFixed(2)}`;
    if (document.getElementById('valCarbonFactor')) document.getElementById('valCarbonFactor').textContent = `${carbonFactor.toFixed(2)} kg/u`;

    // Quantitative baseline calculations:
    // Cluster 0: 227 profiles * 131,134 weekly units * 52 weeks = ~1.548 billion units/yr
    // Cluster 1: 92 profiles * 47,710 weekly units * 52 weeks = ~228 million units/yr
    // Total annual consumption ~ 1.776 billion units
    const c0Profiles = 227;
    const c1Profiles = 92;
    const c0WeeklyMedian = 131134.08;
    const c1WeeklyMedian = 47710.12;
    const weeksPerYear = 52;

    const c0AnnualLoad = c0Profiles * c0WeeklyMedian * weeksPerYear;
    const c1AnnualLoad = c1Profiles * c1WeeklyMedian * weeksPerYear;
    const totalAnnualLoad = c0AnnualLoad + c1AnnualLoad;

    // Peak demand capacity estimates
    const c0PeakWeekly = c0Profiles * (c0WeeklyMedian * 1.2789);
    const c1PeakWeekly = c1Profiles * (c1WeeklyMedian * 1.3762);
    const totalPeakDemand = c0PeakWeekly + c1PeakWeekly;

    // Savings:
    // 1. Efficiency savings: reduces total load
    const efficiencyUnitSavings = totalAnnualLoad * effPct;
    const efficiencyDollarSavings = efficiencyUnitSavings * baseRate;

    // 2. Peak Shaving savings: reduces peak capacity charges (high leverage on Cluster 1)
    const peakShavedUnits = (c1PeakWeekly * psPct * 1.2) + (c0PeakWeekly * psPct * 0.8);
    const peakDemandDollarSavings = (peakShavedUnits / 168) * peakSurcharge * 12; // monthly billing

    // 3. Load Shifting (ToU arbitrage: e.g. $0.05/unit differential between peak and off-peak)
    const touDifferential = baseRate * 0.40;
    const shiftedLoadUnits = (c1AnnualLoad * 0.25 * lsPct) + (c0AnnualLoad * 0.10 * lsPct);
    const loadShiftDollarSavings = shiftedLoadUnits * touDifferential;

    const totalAnnualSavings = efficiencyDollarSavings + peakDemandDollarSavings + loadShiftDollarSavings;

    // Cluster Breakdown
    const c0Savings = (c0AnnualLoad * effPct * baseRate) + ((c0PeakWeekly * psPct * 0.8) / 168 * peakSurcharge * 12) + (c0AnnualLoad * 0.10 * lsPct * touDifferential);
    const c1Savings = totalAnnualSavings - c0Savings;

    // Carbon Savings: metric tons (1 metric ton = 1000 kg)
    const carbonAvoidedTons = (efficiencyUnitSavings * carbonFactor) / 1000;

    // Payback estimation
    const estimatedCapex = totalAnnualSavings * 2.3;
    const paybackYears = (estimatedCapex / totalAnnualSavings).toFixed(1);

    // Update UI elements
    if (document.getElementById('simTotalSavings')) {
      document.getElementById('simTotalSavings').textContent = `$${Math.round(totalAnnualSavings).toLocaleString()}`;
    }
    if (document.getElementById('simC0Savings')) {
      document.getElementById('simC0Savings').textContent = `$${Math.round(c0Savings).toLocaleString()}`;
    }
    if (document.getElementById('simC1Savings')) {
      document.getElementById('simC1Savings').textContent = `$${Math.round(c1Savings).toLocaleString()}`;
    }
    if (document.getElementById('simPeakShaved')) {
      document.getElementById('simPeakShaved').textContent = `${Math.round(peakShavedUnits).toLocaleString()} u/wk`;
    }
    if (document.getElementById('simCarbonSaved')) {
      document.getElementById('simCarbonSaved').textContent = `${Math.round(carbonAvoidedTons).toLocaleString()} t CO₂`;
    }
    if (document.getElementById('simPayback')) {
      document.getElementById('simPayback').textContent = `${paybackYears} Years`;
    }
  }

  // Attach simulator listeners
  [peakShavingInput, loadShiftInput, efficiencyInput, baseRateInput, peakSurchargeInput, carbonFactorInput].forEach(inp => {
    if (inp) inp.addEventListener('input', calculateSimulatorROI);
  });

  // ==========================================================================
  // 8. Data Export Capabilities
  // ==========================================================================
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      const filtered = getFilteredConsumers();
      let csv = 'series_id,status,cluster,mean,median,std,max,cv,peak_to_average,zero_weeks,silhouette,pc1,pc2\n';
      filtered.forEach(c => {
        csv += `${c.series_id},${c.status},${c.cluster},${c.mean},${c.median},${c.std},${c.max},${c.cv},${c.peak_to_average},${c.zero_weeks},${c.silhouette !== null ? c.silhouette : ''},${c.pc1 !== null ? c.pc1 : ''},${c.pc2 !== null ? c.pc2 : ''}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'siemens_energy_customer_segmentation.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // Code Copy Buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const codeId = e.target.getAttribute('data-copy-target');
      const codeEl = document.getElementById(codeId);
      if (codeEl) {
        navigator.clipboard.writeText(codeEl.innerText).then(() => {
          const originalText = e.target.textContent;
          e.target.textContent = 'Copied!';
          setTimeout(() => { e.target.textContent = originalText; }, 2000);
        });
      }
    });
  });

  // Initialize components
  initPcaVarianceChart();
  initKMeansEvalChart();
  initPcaScatterChart();
  initWeeklyProfileChart();
  renderConsumerTable();
  calculateSimulatorROI();
});

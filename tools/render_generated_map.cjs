const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
function renderGeneratedMap(map, config, seed, report) {
  const tileNames = Object.fromEntries(config.tiles.map(tile => [tile.id, tile.name]));
  const objectives = map.objectives.map(o => o.type === 'Collect' ? `${tileNames[o.tileKind]}: ${o.target}` : `${o.enemy.name}: ${o.target} HP`).join(' · ');
  const summary = report.validation.summary;
  const retry = (label, data) => `<section><h2>${label}</h2><p>Median: ${data.medianAttempts ?? 'Chưa đạt trong giới hạn'} lần chơi / ${data.medianRetries ?? '—'} retry; P90: ${data.p90Attempts ?? 'chưa đạt'} lần chơi.</p><p>Đạt: ${data.completed}/${data.samples}; chưa đạt: ${data.unfinished}.</p><table><tr><th>Lần chơi</th><th>Retry</th><th>Tỷ lệ tích lũy</th></tr>${data.byAttempt.map(r => `<tr><td>${r.attempt}</td><td>${r.retries}</td><td>${percent(r.cumulativeRate)}</td></tr>`).join('')}</table></section>`;
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(map.name)}</title>
<style>body{background:#101e1c;color:#edf7ef;font:16px system-ui;max-width:900px;margin:32px auto;padding:0 20px}h1,h2{color:#eac782}.board{display:grid;grid-template-columns:repeat(${map.layout[0].length},48px);gap:5px;margin:24px 0}.cell{height:48px;display:grid;place-items:center;background:#366054;border-radius:8px}.hole{background:transparent;outline:1px dashed #486059}.muted{color:#b4c9c0}section{margin:24px 0}td,th{text-align:left;padding:6px 20px 6px 0}code{overflow-wrap:anywhere}</style>
<h1>Map ${map.id}: ${escape(map.name)}</h1><p>${escape(map.difficulty)} · ${map.layout[0].length}×${map.layout.length} · ${map.moves} lượt · ${escape(objectives)}</p>
<p class="muted">Seed sinh map: ${seed.generation.seed}; hình: ${escape(seed.generation.shape.family)}. □ = ô khuyết, ? = ô ngẫu nhiên. Hàng trên là hàng đầu của layout.</p>
<div class="board">${map.layout.flat().map(cell => `<div class="cell ${cell === 0 ? 'hole' : ''}">${cell === 0 ? '□' : cell === -1 ? '?' : escape(tileNames[cell])}</div>`).join('')}</div>
<h2>Validation: ${escape(report.status)}</h2><p>${summary.samples} ván · thắng ${percent(summary.winRate)} · 3 sao ${percent(summary.starRates[3])} · median lượt thắng ${summary.medianMoves ?? '—'}</p>
<p>${summary.suboptimalChoices ?? 0} lựa chọn kém tối ưu (${percent(summary.suboptimalChoiceRate)}).</p>
<p>3 sao: dùng dưới ${map.starThresholds.threeStarBelowPercent}% lượt; 2 sao: dùng dưới ${map.starThresholds.twoStarBelowPercent}% lượt.</p>
${report.failures.length ? `<ul>${report.failures.map(f => `<li>${escape(f)}</li>`).join('')}</ul>` : ''}
${retry('Đến lần thắng đầu', report.retries.firstWin)}${retry('Đến lần đạt 3 sao đầu', report.retries.firstThreeStars)}
<p class="muted">Bot normal v${report.botModel?.version ?? '—'} dùng loadout trống; xác suất chọn nước kém tối ưu basic / normal / strategic: ${Object.values(report.botModel?.mistakeRates ?? {}).map(percent).join(' / ')}. Nước kém tối ưu đo được trong retry: ${report.retries.suboptimalChoices ?? 0}. EXP tham chiếu ${report.powerModel.expectedTotalExp}; không mua thêm lượt. Quantile chưa đạt được báo là censored, không loại các chuỗi chưa hoàn thành khỏi mẫu.</p>
<p class="muted">Map hash: <code>${report.hashes.map}</code></p></html>\n`;
}
module.exports = { renderGeneratedMap };

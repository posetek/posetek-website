// Keep the same disclosure contract in the coach-report callable and the share builder.
function testDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = new Date(value + "T00:00:00Z");
  return Number.isFinite(stamp.getTime()) && stamp.toISOString().slice(0, 10) === value;
}

function string(value, max = 140) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function unique(values, message) {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function selectReportContext({ assessments, organizationPathway }) {
  const out = {};
  if (assessments != null) {
    if (!Array.isArray(assessments) || assessments.length > 256) throw new Error("Invalid assessments.");
    out.assessments = assessments.map(({ id, label, startDate, endDate }) => {
      if (!string(id) || !string(label) || !testDate(startDate) || !testDate(endDate) || startDate > endDate) {
        throw new Error("Invalid assessment period.");
      }
      return { id, label, startDate, endDate };
    }).sort((a, b) => b.endDate.localeCompare(a.endDate) || a.label.localeCompare(b.label));
    unique(out.assessments.map(row => row.id), "Repeated assessment.");
  }
  if (organizationPathway != null) {
    const { through, series } = organizationPathway;
    if (!testDate(through) || !Array.isArray(series) || series.length > 120) throw new Error("Invalid organization pathway.");
    const selected = series.map(({ test, ageBasis, unit, description, groups, teamMean, teamCount }) => {
      if (!string(test) || !["team-band", "recorded-age"].includes(ageBasis) ||
          !["s", "m/s", "in", "ft", "mph", "m", "cm"].includes(unit) || !string(description, 500) ||
          !Array.isArray(groups) || groups.length > 30 ||
          !(teamCount === null || (Number.isSafeInteger(teamCount) && teamCount >= 0)) ||
          !(teamMean === null || (Number.isFinite(teamMean) && teamMean > 0 && teamCount >= 5))) {
        throw new Error("Invalid organization test series.");
      }
      const points = groups.map(({ age, mean, count, status }) => {
        if (!Number.isInteger(age) || age < 4 || age > 30 ||
            !(count === null || (Number.isSafeInteger(count) && count >= 0)) ||
            !["published", "unavailable", "small-group", "incompatible"].includes(status) ||
            (status === "published" ? (!Number.isFinite(mean) || mean <= 0 || count == null || count < 5) : mean !== null) ||
            (status === "small-group" && !(count > 0 && count < 5))) throw new Error("Invalid organization age group.");
        return { age, count, mean, status };
      }).sort((a, b) => a.age - b.age);
      unique(points.map(row => row.age), "Repeated organization age group.");
      return { test, ageBasis, unit, description, groups: points, teamMean, teamCount };
    });
    unique(selected.map(row => JSON.stringify([row.test, row.ageBasis, row.unit])), "Repeated organization test series.");
    out.organizationPathway = { through, series: selected };
  }
  return out;
}

function selectHistoryReportFields({ history }, assessments, selectMetrics) {
  if (history == null) return {};
  if (!Array.isArray(history) || !Array.isArray(assessments) || history.length > assessments.length) throw new Error("Invalid athlete testing history.");
  const entries = history.map(({ assessmentId, notes, metrics }) => {
    const period = assessments.find(a => a.id === assessmentId);
    if (!period || !Array.isArray(notes) || notes.length > 30 || !notes.every(n => string(n, 500))) throw new Error("Unknown assessment or invalid notes.");
    const selected = selectMetrics(metrics);
    if (!Array.isArray(selected) || selected.some(m => m.result != null && (!testDate(m.date) || m.date < period.startDate || m.date > period.endDate))) {
      throw new Error("A history measurement falls outside its assessment.");
    }
    unique(selected.map(m => m.label), "Repeated assessment test.");
    return { assessmentId, notes, metrics: selected };
  });
  unique(entries.map(r => r.assessmentId), "Repeated athlete assessment.");
  return { history: entries };
}

module.exports = { selectReportContext, selectHistoryReportFields };

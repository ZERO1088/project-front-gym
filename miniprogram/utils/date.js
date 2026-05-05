function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateInput(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDisplayDate(value) {
  if (!value) return '-';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return formatDateInput(date);
}

function shiftDate(dateString, diffDays) {
  const date = dateString ? new Date(`${dateString}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) {
    return formatDateInput();
  }

  date.setDate(date.getDate() + diffDays);
  return formatDateInput(date);
}

function getWeekdayIndex(dateString) {
  const date = dateString ? new Date(`${dateString}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return 0;
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

module.exports = {
  formatDateInput,
  formatDisplayDate,
  shiftDate,
  getWeekdayIndex
};

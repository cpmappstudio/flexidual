export function getSmartStartDate(
  currentDate: Date, 
  selectedDays: number[] // 0=Sun, 1=Mon...
): Date {
  const day = currentDate.getDay();
  if (selectedDays.includes(day)) return currentDate;

  const sortedDays = [...selectedDays].sort((a, b) => a - b);
  const nextDay = sortedDays.find(d => d > day) ?? sortedDays[0];
  
  const daysToAdd = nextDay > day 
    ? nextDay - day 
    : (7 - day) + nextDay;

  const newDate = new Date(currentDate);
  newDate.setDate(newDate.getDate() + daysToAdd);
  return newDate;
}
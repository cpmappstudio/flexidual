// Equal weight per lesson, including partial and unviewed lessons. Keep raw precision.
export function abekaProgressPercentage(
  lessons: readonly { percentage: number }[],
) {
  return lessons.length
    ? lessons.reduce((sum, lesson) => sum + lesson.percentage, 0) /
        lessons.length
    : 0;
}

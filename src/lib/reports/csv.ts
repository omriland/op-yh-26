function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((line) => line.map(escapeCsvCell).join(',')).join('\r\n')
}

export function csvWithBom(csv: string): string {
  return `\uFEFF${csv}`
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csvWithBom(csv)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

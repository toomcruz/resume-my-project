import ExcelJS from "exceljs";
import type { AgendaEvent } from "@/lib/agenda";
import { formatAgendaDate, trimTime } from "@/lib/agenda";

const HEADERS = [
  "QUADRA/RUA",
  "TERRENO",
  "GAVE",
  "SALA",
  "SEPULTAMENTO/ VELÓRIO AGENDADO",
  "HORÁRIO DE VELÓRIO",
  "HORÁRIO PREVISTO PARA SEPULTAMENTO",
  "HORÁRIO DE CHEGADA DO CORPO",
  "BLOCO/EMP",
  "MOTORISTA",
  "PLACA",
];

function rowFor(event: AgendaEvent): (string | null)[] {
  return [
    event.quadra_rua ?? event.location ?? "",
    event.terreno ?? "",
    event.gaveta ?? "",
    event.room ?? "",
    event.deceased_name ?? "",
    trimTime(event.start_time),
    trimTime(event.burial_time),
    trimTime(event.arrival_time),
    event.funeral_home ?? "",
    event.driver_name ?? "",
    event.vehicle_plate ?? "",
  ];
}

export async function exportAgendaReport(
  events: AgendaEvent[],
  eventDate: string,
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Autofill Helper";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Agenda", {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true },
  });

  sheet.columns = [
    { width: 12 },
    { width: 10 },
    { width: 8 },
    { width: 8 },
    { width: 38 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 20 },
    { width: 12 },
  ];

  // Título mesclado
  sheet.mergeCells(1, 1, 1, HEADERS.length);
  const title = sheet.getCell(1, 1);
  title.value = `AGENDA DO DIA  ${formatAgendaDate(eventDate)}`;
  title.font = { bold: true, size: 14, color: { argb: "FF1F3A5F" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEAF2FB" },
  };
  sheet.getRow(1).height = 28;

  // Cabeçalho
  const headerRow = sheet.getRow(2);
  HEADERS.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F3A5F" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF999999" } },
      left: { style: "thin", color: { argb: "FF999999" } },
      bottom: { style: "thin", color: { argb: "FF999999" } },
      right: { style: "thin", color: { argb: "FF999999" } },
    };
  });
  headerRow.height = 40;

  // Dados — pelo menos 8 linhas para preencher visualmente
  const dataRows = events.length > 0 ? events.map(rowFor) : [];
  const minRows = Math.max(dataRows.length, 8);
  for (let i = 0; i < minRows; i++) {
    const values = dataRows[i] ?? Array(HEADERS.length).fill("");
    const excelRow = sheet.getRow(3 + i);
    values.forEach((value, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      cell.value = value ?? "";
      cell.alignment = {
        horizontal: colIndex === 4 ? "left" : "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.font = { size: 10 };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        left: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
        right: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
    });
    excelRow.height = 22;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
